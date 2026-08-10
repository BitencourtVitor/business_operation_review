package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

const (
	googleOAuthTokenURL = "https://oauth2.googleapis.com/token"
	gmailSendURL        = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
)

// EmailMessage is provider-neutral so any page can use the same delivery API.
type EmailMessage struct {
	To      []string
	CC      []string
	Subject string
	Text    string
}

type EmailDelivery struct {
	ID       string `json:"delivery_id"`
	Provider string `json:"provider"`
}

type EmailSender interface {
	Send(context.Context, EmailMessage) (EmailDelivery, error)
}

// GmailAPISender delivers transactional email through the Gmail HTTPS API.
// It is safe to run on Railway because it does not depend on outbound SMTP.
type GmailAPISender struct {
	clientID     string
	clientSecret string
	refreshToken string
	sender       string
	client       *http.Client
}

func NewGmailAPISenderFromEnv() *GmailAPISender {
	return &GmailAPISender{
		clientID:     strings.TrimSpace(os.Getenv("GMAIL_CLIENT_ID")),
		clientSecret: strings.TrimSpace(os.Getenv("GMAIL_CLIENT_SECRET")),
		refreshToken: strings.TrimSpace(os.Getenv("GMAIL_REFRESH_TOKEN")),
		sender:       strings.TrimSpace(os.Getenv("GMAIL_USER")),
		client:       &http.Client{Timeout: 20 * time.Second},
	}
}

func (s *GmailAPISender) Send(ctx context.Context, message EmailMessage) (EmailDelivery, error) {
	if s.clientID == "" || s.clientSecret == "" || s.refreshToken == "" || s.sender == "" {
		return EmailDelivery{}, fmt.Errorf("gmail api delivery is not configured")
	}
	if len(message.To) == 0 {
		return EmailDelivery{}, fmt.Errorf("at least one primary recipient is required")
	}

	accessToken, err := s.accessToken(ctx)
	if err != nil {
		return EmailDelivery{}, err
	}

	rawMessage := buildGmailMessage(s.sender, message)
	payload, err := json.Marshal(map[string]string{
		"raw": base64.RawURLEncoding.EncodeToString([]byte(rawMessage)),
	})
	if err != nil {
		return EmailDelivery{}, fmt.Errorf("gmail api payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, gmailSendURL, bytes.NewReader(payload))
	if err != nil {
		return EmailDelivery{}, fmt.Errorf("gmail api request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return EmailDelivery{}, fmt.Errorf("gmail api connection: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return EmailDelivery{}, fmt.Errorf("gmail api response: %w", err)
	}
	if resp.StatusCode >= http.StatusMultipleChoices {
		return EmailDelivery{}, fmt.Errorf("gmail api rejected email with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return EmailDelivery{}, fmt.Errorf("gmail api response: %w", err)
	}
	if result.ID == "" {
		return EmailDelivery{}, fmt.Errorf("gmail api accepted email without a message id")
	}

	logger.Info(
		"email accepted by provider",
		"provider", "gmail-api",
		"delivery_id", result.ID,
		"to_count", len(message.To),
		"cc_count", len(message.CC),
	)
	return EmailDelivery{ID: result.ID, Provider: "gmail-api"}, nil
}

func (s *GmailAPISender) accessToken(ctx context.Context) (string, error) {
	form := url.Values{
		"client_id":     {s.clientID},
		"client_secret": {s.clientSecret},
		"refresh_token": {s.refreshToken},
		"grant_type":    {"refresh_token"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleOAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("gmail oauth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gmail oauth connection: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return "", fmt.Errorf("gmail oauth response: %w", err)
	}
	if resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("gmail oauth rejected credentials with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return "", fmt.Errorf("gmail oauth response: %w", err)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("gmail oauth returned no access token")
	}
	return result.AccessToken, nil
}

func buildGmailMessage(sender string, message EmailMessage) string {
	headers := []string{
		fmt.Sprintf("From: Premium Group <%s>", sender),
		"To: " + strings.Join(message.To, ", "),
		"Subject: " + mime.QEncoding.Encode("UTF-8", sanitizeEmailHeader(message.Subject)),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
	}
	if len(message.CC) > 0 {
		headers = append(headers, "Cc: "+strings.Join(message.CC, ", "))
	}
	return strings.Join(headers, "\r\n") + "\r\n\r\n" + message.Text
}

func sanitizeEmailHeader(value string) string {
	return strings.NewReplacer("\r", " ", "\n", " ").Replace(value)
}
