package unit_test

import (
	"context"
	"testing"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"golang.org/x/crypto/bcrypt"
)

// ── Mock Repositories ─────────────────────────────────────────────────────────

type mockUserRepo struct {
	users map[string]*domain.User
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{users: make(map[string]*domain.User)}
}

func (m *mockUserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	u, ok := m.users[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return u, nil
}

func (m *mockUserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	for _, u := range m.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepo) Create(ctx context.Context, u *domain.User) error {
	m.users[u.ID] = u
	return nil
}

func (m *mockUserRepo) Update(ctx context.Context, u *domain.User) error {
	m.users[u.ID] = u
	return nil
}

type mockSessionRepo struct {
	sessions map[string]*domain.Session
}

func newMockSessionRepo() *mockSessionRepo {
	return &mockSessionRepo{sessions: make(map[string]*domain.Session)}
}

func (m *mockSessionRepo) Create(ctx context.Context, s *domain.Session) error {
	m.sessions[s.Token] = s
	return nil
}

func (m *mockSessionRepo) FindByToken(ctx context.Context, token string) (*domain.Session, error) {
	s, ok := m.sessions[token]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return s, nil
}

func (m *mockSessionRepo) DeleteByToken(ctx context.Context, token string) error {
	delete(m.sessions, token)
	return nil
}

func (m *mockSessionRepo) DeleteExpired(ctx context.Context) error {
	for k, s := range m.sessions {
		if time.Now().After(s.ExpiresAt) {
			delete(m.sessions, k)
		}
	}
	return nil
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestAuthService_Login_Success(t *testing.T) {
	userRepo    := newMockUserRepo()
	sessionRepo := newMockSessionRepo()
	svc         := service.NewAuthService(userRepo, sessionRepo)

	hash, _ := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.DefaultCost)
	userRepo.users["user-1"] = &domain.User{
		ID:           "user-1",
		Email:        "admin@bor2.com",
		Name:         "Admin",
		Role:         domain.RoleAdmin,
		PasswordHash: string(hash),
	}

	result, err := svc.Login(context.Background(), "admin@bor2.com", "secret123")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if result.User.ID != "user-1" {
		t.Errorf("expected user-1, got %s", result.User.ID)
	}
	if result.Token == "" {
		t.Error("expected a token, got empty string")
	}
}

func TestAuthService_Login_WrongPassword(t *testing.T) {
	userRepo    := newMockUserRepo()
	sessionRepo := newMockSessionRepo()
	svc         := service.NewAuthService(userRepo, sessionRepo)

	hash, _ := bcrypt.GenerateFromPassword([]byte("secret123"), bcrypt.DefaultCost)
	userRepo.users["user-1"] = &domain.User{
		ID:           "user-1",
		Email:        "admin@bor2.com",
		PasswordHash: string(hash),
	}

	_, err := svc.Login(context.Background(), "admin@bor2.com", "wrongpassword")
	if err == nil {
		t.Fatal("expected error for wrong password, got nil")
	}
}

func TestAuthService_Login_UserNotFound(t *testing.T) {
	svc := service.NewAuthService(newMockUserRepo(), newMockSessionRepo())

	_, err := svc.Login(context.Background(), "notfound@bor2.com", "any")
	if err == nil {
		t.Fatal("expected error for unknown user, got nil")
	}
}

func TestAuthService_Logout(t *testing.T) {
	userRepo    := newMockUserRepo()
	sessionRepo := newMockSessionRepo()
	svc         := service.NewAuthService(userRepo, sessionRepo)

	sessionRepo.sessions["token-abc"] = &domain.Session{
		ID:        "sess-1",
		UserID:    "user-1",
		Token:     "token-abc",
		ExpiresAt: time.Now().Add(time.Hour),
	}

	if err := svc.Logout(context.Background(), "token-abc"); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if _, ok := sessionRepo.sessions["token-abc"]; ok {
		t.Error("expected session to be deleted")
	}
}
