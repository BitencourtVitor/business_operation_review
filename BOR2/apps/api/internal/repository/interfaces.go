package repository

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
)

type UserRepository interface {
	FindByID(ctx context.Context, id string) (*domain.User, error)
	FindByEmail(ctx context.Context, email string) (*domain.User, error)
	Create(ctx context.Context, user *domain.User) error
	Update(ctx context.Context, user *domain.User) error
	UpdatePassword(ctx context.Context, userID string, hash string, provisional bool) error
}

type SessionRepository interface {
	Create(ctx context.Context, session *domain.Session) error
	FindByToken(ctx context.Context, token string) (*domain.Session, error)
	DeleteByToken(ctx context.Context, token string) error
	DeleteExpired(ctx context.Context) error
}
