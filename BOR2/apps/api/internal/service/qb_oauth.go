package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/pkg/crypto"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

const (
	qbAuthURL    = "https://appcenter.intuit.com/connect/oauth2"
	qbTokenURL   = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
	qbScope      = "com.intuit.quickbooks.accounting"
	qbRevokeURL  = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"
)

var validCompanies = map[string]bool{"hvac": true, "framing": true, "pcg": true}

type QBOAuthService struct {
	repo          repository.QBCredentialsRepository
	clientID      string
	clientSecret  string
	redirectURI   string
	encryptionKey string
}

func NewQBOAuthService(repo repository.QBCredentialsRepository) *QBOAuthService {
	return &QBOAuthService{
		repo:          repo,
		clientID:      os.Getenv("QB_CLIENT_ID"),
		clientSecret:  os.Getenv("QB_CLIENT_SECRET"),
		redirectURI:   os.Getenv("QB_REDIRECT_URI"),
		encryptionKey: os.Getenv("QB_ENCRYPTION_KEY"),
	}
}

// AuthURL returns the QuickBooks OAuth2 authorization URL for the given company.
// The company name is passed as the OAuth state parameter so the callback knows
// which company is being authorized.
func (s *QBOAuthService) AuthURL(company string) (string, error) {
	if !validCompanies[company] {
		return "", fmt.Errorf("unknown company: %s", company)
	}

	params := url.Values{}
	params.Set("client_id", s.clientID)
	params.Set("scope", qbScope)
	params.Set("redirect_uri", s.redirectURI)
	params.Set("response_type", "code")
	params.Set("state", company)

	return qbAuthURL + "?" + params.Encode(), nil
}

type qbTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	Error        string `json:"error"`
}

// ExchangeCode exchanges an authorization code for access+refresh tokens and
// persists them encrypted in the database.
func (s *QBOAuthService) ExchangeCode(ctx context.Context, company, code, realmID string) error {
	if !validCompanies[company] {
		return fmt.Errorf("unknown company: %s", company)
	}

	tokens, err := s.requestTokens(ctx, url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {code},
		"redirect_uri": {s.redirectURI},
	})
	if err != nil {
		return fmt.Errorf("token exchange failed: %w", err)
	}

	return s.saveTokens(ctx, company, realmID, tokens.AccessToken, tokens.RefreshToken)
}

// RefreshTokens uses the stored refresh_token to obtain a new access_token,
// persists the new token pair, and returns the fresh access_token (plaintext).
func (s *QBOAuthService) RefreshTokens(ctx context.Context, company string) (string, error) {
	creds, err := s.repo.Get(ctx, company)
	if err != nil {
		return "", fmt.Errorf("credentials not found for %s: %w", company, err)
	}

	refreshToken, err := crypto.Decrypt(creds.RefreshToken, s.encryptionKey)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt refresh token: %w", err)
	}

	tokens, err := s.requestTokens(ctx, url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	})
	if err != nil {
		return "", fmt.Errorf("token refresh failed for %s: %w", company, err)
	}

	if err := s.saveTokens(ctx, company, creds.RealmID, tokens.AccessToken, tokens.RefreshToken); err != nil {
		return "", err
	}

	logger.Info("qb tokens refreshed", "company", company)
	return tokens.AccessToken, nil
}

// GetAccessToken returns a valid (plaintext) access_token for the company,
// refreshing automatically if needed.
func (s *QBOAuthService) GetAccessToken(ctx context.Context, company string) (string, string, error) {
	creds, err := s.repo.Get(ctx, company)
	if err != nil {
		return "", "", fmt.Errorf("credentials not found for %s — run OAuth first", company)
	}

	accessToken, err := crypto.Decrypt(creds.AccessToken, s.encryptionKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to decrypt access token: %w", err)
	}

	// If token was updated more than 50 minutes ago, proactively refresh
	// (access tokens expire at 60 minutes)
	if time.Since(creds.TokenUpdatedAt) > 50*time.Minute {
		accessToken, err = s.RefreshTokens(ctx, company)
		if err != nil {
			return "", "", err
		}
		// Re-fetch to get updated realmID
		creds, err = s.repo.Get(ctx, company)
		if err != nil {
			return "", "", err
		}
	}

	return accessToken, creds.RealmID, nil
}

// ─── internal ────────────────────────────────────────────────────────────────

func (s *QBOAuthService) requestTokens(ctx context.Context, body url.Values) (*qbTokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, qbTokenURL, strings.NewReader(body.Encode()))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(s.clientID, s.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	var t qbTokenResponse
	if err := json.Unmarshal(raw, &t); err != nil {
		return nil, fmt.Errorf("invalid QB token response: %s", string(raw))
	}
	if t.Error != "" {
		return nil, errors.New(t.Error)
	}
	if t.AccessToken == "" {
		return nil, fmt.Errorf("empty access token in response: %s", string(raw))
	}

	return &t, nil
}

func (s *QBOAuthService) saveTokens(ctx context.Context, company, realmID, accessToken, refreshToken string) error {
	encAccess, err := crypto.Encrypt(accessToken, s.encryptionKey)
	if err != nil {
		return fmt.Errorf("failed to encrypt access token: %w", err)
	}

	encRefresh, err := crypto.Encrypt(refreshToken, s.encryptionKey)
	if err != nil {
		return fmt.Errorf("failed to encrypt refresh token: %w", err)
	}

	return s.repo.Upsert(ctx, &repository.QBCredentials{
		Company:      company,
		RealmID:      realmID,
		AccessToken:  encAccess,
		RefreshToken: encRefresh,
	})
}
