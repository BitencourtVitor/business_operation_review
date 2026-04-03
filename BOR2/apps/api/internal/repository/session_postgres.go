package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresSessionRepository struct {
	db *pgxpool.Pool
}

func NewPostgresSessionRepository(db *pgxpool.Pool) *PostgresSessionRepository {
	return &PostgresSessionRepository{db: db}
}

func (r *PostgresSessionRepository) Create(ctx context.Context, session *domain.Session) error {
	query := `
		INSERT INTO sessions (id, user_id, token, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.Exec(ctx, query,
		session.ID, session.UserID, session.Token,
		session.ExpiresAt, session.CreatedAt,
	)
	return err
}

func (r *PostgresSessionRepository) FindByToken(ctx context.Context, token string) (*domain.Session, error) {
	query := `
		SELECT id, user_id, token, expires_at, created_at
		FROM sessions WHERE token = $1
	`
	row := r.db.QueryRow(ctx, query, token)

	s := &domain.Session{}
	err := row.Scan(&s.ID, &s.UserID, &s.Token, &s.ExpiresAt, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("scan session: %w", err)
	}
	return s, nil
}

func (r *PostgresSessionRepository) DeleteByToken(ctx context.Context, token string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM sessions WHERE token = $1", token)
	return err
}

func (r *PostgresSessionRepository) DeleteExpired(ctx context.Context) error {
	_, err := r.db.Exec(ctx, "DELETE FROM sessions WHERE expires_at < NOW()")
	return err
}
