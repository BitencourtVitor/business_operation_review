// Package quickbooks handles OAuth2 and API requests to QuickBooks Online.
package quickbooks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	baseURL    = "https://quickbooks.api.intuit.com"
	sandboxURL = "https://sandbox-quickbooks.api.intuit.com"
	tokenURL   = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
	pageSize   = 1000 // QB max per request
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

// RefreshToken obtains a new access+refresh token pair and updates the client in place.
func (c *Client) RefreshToken(ctx context.Context) error {
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

		if len(batch) < pageSize {
			break
		}
		startPos += pageSize
	}

	return all, nil
}

// ─── internal ────────────────────────────────────────────────────────────────

func (c *Client) query(ctx context.Context, q string) ([]byte, error) {
	base := baseURL
	if c.sandbox {
		base = sandboxURL
	}

	endpoint := fmt.Sprintf("%s/v3/company/%s/query?query=%s&minorversion=65",
		base, c.config.RealmID, url.QueryEscape(q))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.config.AccessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("QB request: %w", err)
	}
	defer resp.Body.Close()

	// Auto-refresh on 401 — rebuild request (original is consumed)
	if resp.StatusCode == http.StatusUnauthorized {
		if err := c.RefreshToken(ctx); err != nil {
			return nil, fmt.Errorf("auto-refresh failed: %w", err)
		}
		req2, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		req2.Header.Set("Authorization", "Bearer "+c.config.AccessToken)
		req2.Header.Set("Accept", "application/json")
		resp2, err := c.httpClient.Do(req2)
		if err != nil {
			return nil, fmt.Errorf("retry after refresh: %w", err)
		}
		defer resp2.Body.Close()
		return io.ReadAll(resp2.Body)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("QB API error (%d): %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
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
