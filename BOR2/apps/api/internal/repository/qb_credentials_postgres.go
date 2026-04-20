package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type QBCredentials struct {
	ID              string
	Company         string
	RealmID         string
	AccessToken     string // encrypted
	RefreshToken    string // encrypted
	TokenUpdatedAt  time.Time
}

type QBCredentialsRepository interface {
	Get(ctx context.Context, company string) (*QBCredentials, error)
	Upsert(ctx context.Context, creds *QBCredentials) error
}

type postgresQBCredentialsRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBCredentialsRepository(db *pgxpool.Pool) QBCredentialsRepository {
	return &postgresQBCredentialsRepository{db: db}
}

func (r *postgresQBCredentialsRepository) Get(ctx context.Context, company string) (*QBCredentials, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, company, realm_id, access_token, refresh_token, token_updated_at
		FROM qb_credentials
		WHERE company = $1
	`, company)

	var c QBCredentials
	if err := row.Scan(&c.ID, &c.Company, &c.RealmID, &c.AccessToken, &c.RefreshToken, &c.TokenUpdatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *postgresQBCredentialsRepository) Upsert(ctx context.Context, creds *QBCredentials) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO qb_credentials (company, realm_id, access_token, refresh_token, token_updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (company) DO UPDATE SET
			realm_id         = EXCLUDED.realm_id,
			access_token     = EXCLUDED.access_token,
			refresh_token    = EXCLUDED.refresh_token,
			token_updated_at = now()
	`, creds.Company, creds.RealmID, creds.AccessToken, creds.RefreshToken)
	return err
}
