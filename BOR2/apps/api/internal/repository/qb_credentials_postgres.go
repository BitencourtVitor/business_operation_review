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
	WithCompanyLock(ctx context.Context, company string, fn func(ctx context.Context, locked *QBCredentials) (updated *QBCredentials, err error)) (*QBCredentials, error)
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

// WithCompanyLock runs fn while holding a row lock on the company's
// qb_credentials row (SELECT ... FOR UPDATE), serializing every reader/writer —
// including two overlapping refresh attempts — behind a single Postgres
// transaction. If fn returns a non-nil updated, it is persisted (with
// token_updated_at set to the DB's now()) before commit; a nil updated means
// "no change needed" and the originally-locked row is returned as-is.
func (r *postgresQBCredentialsRepository) WithCompanyLock(
	ctx context.Context, company string,
	fn func(ctx context.Context, locked *QBCredentials) (updated *QBCredentials, err error),
) (*QBCredentials, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) // no-op once Commit succeeds

	row := tx.QueryRow(ctx, `
		SELECT id, company, realm_id, access_token, refresh_token, token_updated_at
		FROM qb_credentials
		WHERE company = $1
		FOR UPDATE
	`, company)

	var locked QBCredentials
	if err := row.Scan(&locked.ID, &locked.Company, &locked.RealmID, &locked.AccessToken, &locked.RefreshToken, &locked.TokenUpdatedAt); err != nil {
		return nil, err
	}

	updated, err := fn(ctx, &locked)
	if err != nil {
		return nil, err
	}

	result := locked
	if updated != nil {
		updateRow := tx.QueryRow(ctx, `
			UPDATE qb_credentials
			SET realm_id = $2, access_token = $3, refresh_token = $4, token_updated_at = now()
			WHERE company = $1
			RETURNING token_updated_at
		`, company, updated.RealmID, updated.AccessToken, updated.RefreshToken)
		if err := updateRow.Scan(&updated.TokenUpdatedAt); err != nil {
			return nil, err
		}
		updated.ID, updated.Company = locked.ID, locked.Company
		result = *updated
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &result, nil
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
