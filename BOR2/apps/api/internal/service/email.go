package service

import (
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
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
	conn, err := (&net.Dialer{Timeout: 12 * time.Second}).DialContext(ctx, "tcp", "smtp.gmail.com:587")
	if err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp connection: %w", err) }
	client, err := smtp.NewClient(conn, "smtp.gmail.com")
	if err != nil { conn.Close(); return EmailDelivery{}, fmt.Errorf("gmail smtp handshake: %w", err) }
	defer client.Quit()
	if err := client.StartTLS(&tls.Config{ServerName: "smtp.gmail.com", MinVersion: tls.VersionTLS12}); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp tls: %w", err) }
	if err := client.Auth(smtp.PlainAuth("", s.user, s.password, "smtp.gmail.com")); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp authentication: %w", err) }
	if err := client.Mail(s.user); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp sender: %w", err) }
	for _, recipient := range all { if err := client.Rcpt(recipient); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp recipient: %w", err) } }
	writer, err := client.Data(); if err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp data: %w", err) }
	if _, err := writer.Write([]byte(body)); err != nil { writer.Close(); return EmailDelivery{}, fmt.Errorf("gmail smtp write: %w", err) }
	if err := writer.Close(); err != nil { return EmailDelivery{}, fmt.Errorf("gmail smtp delivery: %w", err) }
	logger.Info("email accepted by smtp", "delivery_id", deliveryID, "to_count", len(message.To), "cc_count", len(message.CC), "at", time.Now().UTC().Format(time.RFC3339))
	return EmailDelivery{ID: deliveryID, Provider: "gmail-smtp"}, nil
}
