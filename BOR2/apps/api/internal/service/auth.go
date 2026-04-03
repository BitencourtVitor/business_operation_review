package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/smtp"
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
		// Don't reveal if email exists
		return nil
	}

	// Generate random 10-char provisional password
	tempPass, err := generateTempPassword(10)
	if err != nil {
		return fmt.Errorf("generate temp password: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.userRepo.UpdatePassword(ctx, user.ID, string(hash), true); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	// Send email with temp password
	go func() {
		if err := sendPasswordEmail(user.Email, user.Name, tempPass); err != nil {
			logger.Error("failed to send password reset email", "error", err, "email", user.Email)
		}
	}()

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
	gmailUser := os.Getenv("GMAIL_USER")
	gmailPass := os.Getenv("GMAIL_APP_PASSWORD")

	if gmailUser == "" || gmailPass == "" {
		return fmt.Errorf("GMAIL_USER or GMAIL_APP_PASSWORD not set")
	}

	subject := "BOR2 — Senha Provisória"
	body := fmt.Sprintf(`Olá %s,

Sua senha foi redefinida. Use a senha provisória abaixo para fazer login:

    %s

Ao fazer login, você será solicitado a criar uma nova senha.

— Business Operations Review`, name, tempPass)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		gmailUser, to, subject, body)

	auth := smtp.PlainAuth("", gmailUser, gmailPass, "smtp.gmail.com")
	return smtp.SendMail("smtp.gmail.com:587", auth, gmailUser, []string{to}, []byte(msg))
}
