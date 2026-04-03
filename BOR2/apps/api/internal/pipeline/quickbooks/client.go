// Package quickbooks handles OAuth2 authentication and API requests
// to the QuickBooks Online API for multiple companies.
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
	baseURL      = "https://quickbooks.api.intuit.com"
	tokenURL     = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
	sandboxURL   = "https://sandbox-quickbooks.api.intuit.com"
	pageSize     = 100
)

type Company string

const (
	CompanyHVAC    Company = "hvac"
	CompanyFraming Company = "framing"
	CompanyPCG     Company = "pcg"
)

type CompanyConfig struct {
	RealmID      string
	AccessToken  string
	RefreshToken string
	ClientID     string
	ClientSecret string
}

type Client struct {
	httpClient *http.Client
	config     CompanyConfig
	company    Company
	sandbox    bool
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func NewClient(company Company, config CompanyConfig, sandbox bool) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		config:     config,
		company:    company,
		sandbox:    sandbox,
	}
}

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

func (c *Client) query(ctx context.Context, q string) ([]byte, error) {
	base := baseURL
	if c.sandbox {
		base = sandboxURL
	}

	endpoint := fmt.Sprintf("%s/v3/company/%s/query?query=%s&minorversion=65",
		base, c.config.RealmID, url.QueryEscape(q))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build query request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.config.AccessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("query request: %w", err)
	}
	defer resp.Body.Close()

	// Auto-refresh on 401
	if resp.StatusCode == http.StatusUnauthorized {
		if err := c.RefreshToken(ctx); err != nil {
			return nil, fmt.Errorf("auto-refresh failed: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+c.config.AccessToken)
		resp2, err := c.httpClient.Do(req)
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

// QueryAll paginates through all results of a QB query.
func (c *Client) QueryAll(ctx context.Context, entity string) ([]json.RawMessage, error) {
	var all []json.RawMessage
	startPos := 1

	for {
		q := fmt.Sprintf("SELECT * FROM %s STARTPOSITION %d MAXRESULTS %d", entity, startPos, pageSize)
		body, err := c.query(ctx, q)
		if err != nil {
			return nil, err
		}

		var result map[string]json.RawMessage
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("unmarshal QB response: %w", err)
		}

		qr, ok := result["QueryResponse"]
		if !ok {
			break
		}

		var qrMap map[string]json.RawMessage
		if err := json.Unmarshal(qr, &qrMap); err != nil {
			break
		}

		rows, ok := qrMap[entity]
		if !ok {
			break
		}

		var batch []json.RawMessage
		if err := json.Unmarshal(rows, &batch); err != nil {
			break
		}

		all = append(all, batch...)

		if len(batch) < pageSize {
			break
		}
		startPos += pageSize
	}

	return all, nil
}
