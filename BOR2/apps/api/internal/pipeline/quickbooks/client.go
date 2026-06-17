// Package quickbooks handles OAuth2 and API requests to QuickBooks Online.
package quickbooks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

const (
	baseURL    = "https://quickbooks.api.intuit.com"
	sandboxURL = "https://sandbox-quickbooks.api.intuit.com"
	tokenURL   = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
	pageSize   = 1000 // QB max per request

	// Throttle handling: QB enforces ~500 requests/minute per realm. On 429 we
	// wait a full minute (so the rolling window fully clears) and retry the same
	// request — no hurry, the sync runs overnight. A longer Retry-After is honored.
	maxThrottleRetries = 5
	throttleWait       = 61 * time.Second
)

type Company string

const (
	CompanyHVAC    Company = "hvac"
	CompanyFraming Company = "framing"
	CompanyPCG     Company = "pcg"
)

var AllCompanies = []Company{CompanyHVAC, CompanyFraming, CompanyPCG}

// AllEntities is every QuickBooks entity we fetch. Entities with a typed upsert
// (see entities.go) land in dedicated tables; all others are captured generically
// in qb_raw, so we hold complete contemplation of Premium's QuickBooks data.
//
// Deliberately NOT synced:
//   - Attachable: a file (transaction receipt/proof) attached to a record — not
//     financial data, and the highest-volume entity (20k+ per company).
//   - TimeActivity: QB Time is owned by the separate QBT pipeline.
//   - Empty/config singletons (Class, Department, JournalCode, CompanyCurrency,
//     Preferences, CompanyInfo): no data or pure configuration.
var AllEntities = []string{
	// structured (typed upsert → dedicated tables)
	"Bill", "BillPayment", "Estimate", "Invoice",
	"Payment", "Purchase", "VendorCredit", "Deposit",
	"PurchaseOrder", "Account", "Vendor", "Customer",
	// raw-only (captured in qb_raw)
	"JournalEntry", "Transfer", "ReimburseCharge", "CreditMemo",
	"RefundReceipt", "SalesReceipt", "Item", "Employee",
	"Term", "PaymentMethod", "TaxCode", "TaxRate", "TaxAgency",
	"CustomerType", "Budget",
}

type CompanyConfig struct {
	RealmID      string
	AccessToken  string
	RefreshToken string
	ClientID     string
	ClientSecret string
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

type Client struct {
	httpClient *http.Client
	mu         sync.Mutex // guards config tokens + serializes refresh
	config     CompanyConfig
	company    Company
	sandbox    bool
}

func NewClient(company Company, config CompanyConfig, sandbox bool) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		config:     config,
		company:    company,
		sandbox:    sandbox,
	}
}

func (c *Client) Company() Company { return c.company }
func (c *Client) RealmID() string  { return c.config.RealmID }

// accessToken returns the current access token under lock.
func (c *Client) accessToken() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.config.AccessToken
}

// RefreshToken obtains a new access+refresh token pair and updates the client in
// place. Safe for concurrent callers: only the first refresh following a given
// access token actually runs — the rest observe the already-refreshed token and
// return immediately, avoiding a refresh storm under a 401 burst.
func (c *Client) RefreshToken(ctx context.Context) error {
	return c.refreshIfStale(ctx, c.accessToken())
}

// refreshIfStale refreshes only if the live access token still equals `used`,
// i.e. nobody refreshed since the caller's request went out.
func (c *Client) refreshIfStale(ctx context.Context, used string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.config.AccessToken != used {
		return nil // another goroutine already refreshed
	}
	if c.config.RefreshToken == "" || c.config.ClientID == "" || c.config.ClientSecret == "" {
		return fmt.Errorf("no refresh credentials configured")
	}

	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", c.config.RefreshToken)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("build refresh request: %w", err)
	}
	req.SetBasicAuth(c.config.ClientID, c.config.ClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("refresh token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("refresh token failed (%d): %s", resp.StatusCode, string(body))
	}

	var token TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return fmt.Errorf("decode token: %w", err)
	}

	c.config.AccessToken = token.AccessToken
	c.config.RefreshToken = token.RefreshToken
	logger.Info("qb access token refreshed mid-sync", "company", c.company)
	return nil
}

// QueryUpdated fetches all records of an entity updated after `since`.
// If since is zero, fetches all records (full sync).
func (c *Client) QueryUpdated(ctx context.Context, entity string, since time.Time) ([]json.RawMessage, error) {
	var all []json.RawMessage
	startPos := 1

	for {
		var q string
		if since.IsZero() {
			q = fmt.Sprintf("SELECT * FROM %s STARTPOSITION %d MAXRESULTS %d", entity, startPos, pageSize)
		} else {
			q = fmt.Sprintf(
				"SELECT * FROM %s WHERE MetaData.LastUpdatedTime > '%s' STARTPOSITION %d MAXRESULTS %d",
				entity, since.UTC().Format("2006-01-02T15:04:05-07:00"), startPos, pageSize,
			)
		}

		body, err := c.query(ctx, q)
		if err != nil {
			return nil, err
		}

		batch, err := extractRows(body, entity)
		if err != nil {
			return nil, err
		}

		all = append(all, batch...)
		if len(batch) == pageSize || startPos > 1 {
			// Only chatter when actually paginating (a full pull), not for the
			// single small page a typical incremental delta returns.
			logger.Info("qb fetch page", "company", c.company, "entity", entity,
				"page", (startPos/pageSize)+1, "fetched", len(all))
		}

		if len(batch) < pageSize {
			break
		}
		startPos += pageSize
	}

	return all, nil
}

// QueryAllIDs fetches every current Id for an entity (paginated). The bool is
// false if ANY page failed — callers MUST treat that as "unknown" and never delete
// based on an incomplete set, otherwise a transient API error could wipe data.
func (c *Client) QueryAllIDs(ctx context.Context, entity string) ([]string, bool) {
	var ids []string
	startPos := 1
	for {
		q := fmt.Sprintf("SELECT Id FROM %s STARTPOSITION %d MAXRESULTS %d", entity, startPos, pageSize)
		body, err := c.query(ctx, q)
		if err != nil {
			return nil, false
		}
		batch, err := extractRows(body, entity)
		if err != nil {
			return nil, false
		}
		for _, raw := range batch {
			var m map[string]json.RawMessage
			if json.Unmarshal(raw, &m) == nil {
				if id := str(m, "Id"); id != "" {
					ids = append(ids, id)
				}
			}
		}
		if len(batch) < pageSize {
			break
		}
		startPos += pageSize
	}
	return ids, true
}

// ─── internal ────────────────────────────────────────────────────────────────

func (c *Client) query(ctx context.Context, q string) ([]byte, error) {
	base := baseURL
	if c.sandbox {
		base = sandboxURL
	}

	endpoint := fmt.Sprintf("%s/v3/company/%s/query?query=%s&minorversion=65",
		base, c.config.RealmID, url.QueryEscape(q))

	refreshed := false
	throttleAttempts := 0

	for {
		used := c.accessToken()
		body, status, retryAfter, err := c.doGet(ctx, endpoint, used)
		if err != nil {
			return nil, err
		}

		switch {
		case status == http.StatusOK:
			return body, nil

		case status == http.StatusUnauthorized && !refreshed:
			// Access token expired mid-sync — refresh once and retry.
			if err := c.refreshIfStale(ctx, used); err != nil {
				return nil, fmt.Errorf("auto-refresh failed: %w", err)
			}
			refreshed = true
			continue

		case status == http.StatusTooManyRequests || status == http.StatusServiceUnavailable:
			if throttleAttempts >= maxThrottleRetries {
				return nil, fmt.Errorf("QB throttled (%d) — gave up after %d retries: %s",
					status, throttleAttempts, string(body))
			}
			delay := backoffDelay(retryAfter)
			throttleAttempts++
			logger.Warn("qb throttled — waiting a full minute before retry",
				"company", c.company, "attempt", throttleAttempts,
				"max", maxThrottleRetries, "delay", delay.String())
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
			continue

		default:
			return nil, fmt.Errorf("QB API error (%d): %s", status, string(body))
		}
	}
}

// doGet performs a single authenticated GET and returns the body, HTTP status,
// and any Retry-After hint. The token is passed in (not read from config) so the
// caller can detect whether a concurrent refresh has since superseded it.
func (c *Client) doGet(ctx context.Context, endpoint, accessToken string) (body []byte, status int, retryAfter time.Duration, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, 0, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, 0, fmt.Errorf("QB request: %w", err)
	}
	defer resp.Body.Close()

	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, 0, fmt.Errorf("read QB response: %w", err)
	}
	if ra := resp.Header.Get("Retry-After"); ra != "" {
		if secs, perr := strconv.Atoi(strings.TrimSpace(ra)); perr == nil && secs > 0 {
			retryAfter = time.Duration(secs) * time.Second
		}
	}
	return body, resp.StatusCode, retryAfter, nil
}

// backoffDelay returns how long to wait before retrying a throttled request:
// a full minute (clears QB's per-minute window), unless QB asked for longer.
func backoffDelay(retryAfter time.Duration) time.Duration {
	if retryAfter > throttleWait {
		return retryAfter
	}
	return throttleWait
}

func extractRows(body []byte, entity string) ([]json.RawMessage, error) {
	var result struct {
		QueryResponse map[string]json.RawMessage `json:"QueryResponse"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("unmarshal QB response: %w", err)
	}

	rowsRaw, ok := result.QueryResponse[entity]
	if !ok {
		return nil, nil // empty result
	}

	var rows []json.RawMessage
	if err := json.Unmarshal(rowsRaw, &rows); err != nil {
		return nil, fmt.Errorf("unmarshal %s rows: %w", entity, err)
	}

	return rows, nil
}
