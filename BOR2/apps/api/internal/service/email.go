package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
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

type EmailSender interface { Send(context.Context, EmailMessage) (EmailDelivery, error) }

// BrevoEmailSender delivers over HTTPS, which is the production provider on
// Railway because outbound SMTP ports are unavailable there.
type BrevoEmailSender struct { apiKey, sender string; client *http.Client }

func NewBrevoEmailSenderFromEnv() *BrevoEmailSender {
	return &BrevoEmailSender{apiKey: os.Getenv("BREVO_API_KEY"), sender: os.Getenv("GMAIL_USER"), client: &http.Client{Timeout: 15 * time.Second}}
}

func (s *BrevoEmailSender) Send(ctx context.Context, message EmailMessage) (EmailDelivery, error) {
	if s.apiKey == "" || s.sender == "" { return EmailDelivery{}, fmt.Errorf("brevo email delivery is not configured") }
	if len(message.To) == 0 { return EmailDelivery{}, fmt.Errorf("at least one primary recipient is required") }
	recipients := func(emails []string) []map[string]string { out := make([]map[string]string, 0, len(emails)); for _, email := range emails { out = append(out, map[string]string{"email": email}) }; return out }
	payload := map[string]any{"sender": map[string]string{"name": "Premium Group", "email": s.sender}, "to": recipients(message.To), "subject": message.Subject, "textContent": message.Text}
	if len(message.CC) > 0 { payload["cc"] = recipients(message.CC) }
	body, err := json.Marshal(payload); if err != nil { return EmailDelivery{}, fmt.Errorf("brevo payload: %w", err) }
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(body)); if err != nil { return EmailDelivery{}, fmt.Errorf("brevo request: %w", err) }
	req.Header.Set("api-key", s.apiKey); req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req); if err != nil { return EmailDelivery{}, fmt.Errorf("brevo connection: %w", err) }
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 { return EmailDelivery{}, fmt.Errorf("brevo rejected email with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody))) }
	var result struct { MessageID string `json:"messageId"` }; _ = json.Unmarshal(responseBody, &result)
	if result.MessageID == "" { result.MessageID = uuid.NewString() }
	logger.Info("email accepted by provider", "provider", "brevo", "delivery_id", result.MessageID, "to_count", len(message.To), "cc_count", len(message.CC))
	return EmailDelivery{ID: result.MessageID, Provider: "brevo"}, nil
}

// GmailSMTPSender is the shared transactional-mail sender. Railway provides
// GMAIL_USER and GMAIL_APP_PASSWORD as service variables; no handler reads
// credentials directly.
type GmailSMTPSender struct { user, password string }

func NewGmailSMTPSenderFromEnv() *GmailSMTPSender {
	return &GmailSMTPSender{user: os.Getenv("GMAIL_USER"), password: os.Getenv("GMAIL_APP_PASSWORD")}
}

func (s *GmailSMTPSender) Send(ctx context.Context, message EmailMessage) (EmailDelivery, error) {
	if err := ctx.Err(); err != nil { return EmailDelivery{}, err }
	if s.user == "" || s.password == "" { return EmailDelivery{}, fmt.Errorf("gmail smtp is not configured") }
	if len(message.To) == 0 { return EmailDelivery{}, fmt.Errorf("at least one primary recipient is required") }
	all := append(append([]string{}, message.To...), message.CC...)
	deliveryID := uuid.NewString()
	headers := []string{
		fmt.Sprintf("From: Premium Group <%s>", s.user),
		"To: " + strings.Join(message.To, ", "),
		"Subject: " + mime.QEncoding.Encode("UTF-8", message.Subject),
		"Message-ID: <" + deliveryID + "@premiumgrpinc.com>",
		"MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8",
	}
	if len(message.CC) > 0 { headers = append(headers, "Cc: "+strings.Join(message.CC, ", ")) }
	body := strings.Join(headers, "\r\n") + "\r\n\r\n" + message.Text
	conn, err := (&net.Dialer{Timeout: 12 * time.Second}).DialContext(ctx, "tcp", "smtp.gmail.com:465")
	if err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp connection: %w", err) }
	tlsConn := tls.Client(conn, &tls.Config{ServerName: "smtp.gmail.com", MinVersion: tls.VersionTLS12})
	if err := tlsConn.HandshakeContext(ctx); err != nil { conn.Close(); return EmailDelivery{}, fmt.Errorf("gmail smtp tls: %w", err) }
	client, err := smtp.NewClient(tlsConn, "smtp.gmail.com")
	if err != nil { tlsConn.Close(); return EmailDelivery{}, fmt.Errorf("gmail smtp handshake: %w", err) }
	defer client.Quit()
	if err := client.Auth(smtp.PlainAuth("", s.user, s.password, "smtp.gmail.com")); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp authentication: %w", err) }
	if err := client.Mail(s.user); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp sender: %w", err) }
	for _, recipient := range all { if err := client.Rcpt(recipient); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp recipient: %w", err) } }
	writer, err := client.Data(); if err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp data: %w", err) }
	if _, err := writer.Write([]byte(body)); err != nil { writer.Close(); return EmailDelivery{}, fmt.Errorf("gmail smtp write: %w", err) }
	if err := writer.Close(); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp delivery: %w", err) }
	logger.Info("email accepted by smtp", "delivery_id", deliveryID, "to_count", len(message.To), "cc_count", len(message.CC), "at", time.Now().UTC().Format(time.RFC3339))
	return EmailDelivery{ID: deliveryID, Provider: "gmail-smtp"}, nil
}
