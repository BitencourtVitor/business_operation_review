package repository

import (
	"context"
	"fmt"
	"time"

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
		INSERT INTO sessions (id, user_id, token, expires_at, created_at, ttl_seconds)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.db.Exec(ctx, query,
		session.ID, session.UserID, session.Token,
		session.ExpiresAt, session.CreatedAt, session.TTLSeconds,
	)
	return err
}

func (r *PostgresSessionRepository) FindByToken(ctx context.Context, token string) (*domain.Session, error) {
	query := `
		SELECT id, user_id, token, expires_at, created_at, ttl_seconds
		FROM sessions WHERE token = $1
	`
	row := r.db.QueryRow(ctx, query, token)

	s := &domain.Session{}
	err := row.Scan(&s.ID, &s.UserID, &s.Token, &s.ExpiresAt, &s.CreatedAt, &s.TTLSeconds)
	if err != nil {
		return nil, fmt.Errorf("scan session: %w", err)
	}
	return s, nil
}

// Touch empurra o vencimento da sessão para frente.
//
// Chamada só quando a sessão já passou da metade da janela, e não a cada
// requisição: renovar sempre daria uma escrita por chamada de API, para adiar um
// prazo que ainda tinha dias de sobra.
func (r *PostgresSessionRepository) Touch(ctx context.Context, token string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx,
		"UPDATE sessions SET expires_at = $2 WHERE token = $1", token, expiresAt)
	return err
}

func (r *PostgresSessionRepository) DeleteByToken(ctx context.Context, token string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM sessions WHERE token = $1", token)
	return err
}

func (r *PostgresSessionRepository) DeleteExpired(ctx context.Context) error {
	_, err := r.db.Exec(ctx, "DELETE FROM sessions WHERE expires_at < NOW()")
	return err
}
