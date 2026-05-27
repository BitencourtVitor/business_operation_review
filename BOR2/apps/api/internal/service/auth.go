package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type LoginResult struct {
	User  *domain.User `json:"user"`
	Token string       `json:"token"`
}

type AuthService struct {
	userRepo    repository.UserRepository
	sessionRepo repository.SessionRepository
}

func NewAuthService(userRepo repository.UserRepository, sessionRepo repository.SessionRepository) *AuthService {
	return &AuthService{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
	}
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	token := uuid.NewString()
	session := &domain.Session{
		ID:        uuid.NewString(),
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, errors.New("failed to create session")
	}

	return &LoginResult{User: user, Token: token}, nil
}

func (s *AuthService) Logout(ctx context.Context, token string) error {
	return s.sessionRepo.DeleteByToken(ctx, token)
}

func (s *AuthService) GetUserByToken(ctx context.Context, token string) (*domain.User, error) {
	session, err := s.sessionRepo.FindByToken(ctx, token)
	if err != nil {
		return nil, errors.New("invalid session")
	}

	if time.Now().After(session.ExpiresAt) {
		_ = s.sessionRepo.DeleteByToken(ctx, token)
		return nil, errors.New("session expired")
	}

	return s.userRepo.FindByID(ctx, session.UserID)
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		logger.Info("forgot password: email not found in db", "email", email)
		return nil
	}

	// Generate random 10-char provisional password
	tempPass, err := generateTempPassword(10)
	if err != nil {
		return fmt.Errorf("generate temp password: %w", err)
	}

	// Send email BEFORE updating the DB — if delivery fails, the user's
	// current password remains valid and they can retry.
	if err := sendPasswordEmail(user.Email, user.Name, tempPass); err != nil {
		logger.Error("failed to send password reset email", "error", err, "email", user.Email)
		return fmt.Errorf("send email: %w", err)
	}

	logger.Info("provisional password email sent", "email", user.Email)

	hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.userRepo.UpdatePassword(ctx, user.ID, string(hash), true); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	return nil
}

func (s *AuthService) ChangePassword(ctx context.Context, userID, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	return s.userRepo.UpdatePassword(ctx, userID, string(hash), false)
}

func generateTempPassword(length int) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$"
	result := make([]byte, length)
	for i := range result {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		result[i] = charset[n.Int64()]
	}
	return string(result), nil
}

func sendPasswordEmail(to, name, tempPass string) error {
	apiKey := os.Getenv("BREVO_API_KEY")
	senderEmail := os.Getenv("GMAIL_USER")
	if apiKey == "" {
		return fmt.Errorf("BREVO_API_KEY not set")
	}
	if senderEmail == "" {
		return fmt.Errorf("GMAIL_USER not set")
	}

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0a0a0a;padding:24px 32px;text-align:center;">
            <span style="color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:1px;">PREMIUM GROUP</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#111;">Hi <strong>%s</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">Your password has been reset. Use the temporary password below to sign in:</p>
            <div style="background:#f4f4f5;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
              <span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#111;font-family:monospace;">%s</span>
            </div>
            <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">After signing in, you will be prompted to create a new permanent password.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f4f4f5;padding:16px 32px;text-align:center;border-top:1px solid #e5e5e5;">
            <p style="margin:0;font-size:12px;color:#aaa;">Business Operations Review &mdash; Premium Group</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, name, tempPass)

	payload, err := json.Marshal(map[string]any{
		"sender":      map[string]string{"name": "Premium Group", "email": senderEmail},
		"to":          []map[string]string{{"email": to, "name": name}},
		"subject":     "BOR2 — Temporary Password",
		"htmlContent": htmlBody,
	})
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("brevo returned status %d", resp.StatusCode)
	}
	return nil
}
