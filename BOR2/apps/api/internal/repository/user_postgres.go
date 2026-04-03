package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresUserRepository struct {
	db *pgxpool.Pool
}

func NewPostgresUserRepository(db *pgxpool.Pool) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

const userColumns = `id, email, name, role, password_hash, provisional_password, financial_pass, created_at, updated_at`

func (r *PostgresUserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	row := r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	return scanUser(row)
}

func (r *PostgresUserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	row := r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email)
	return scanUser(row)
}

func (r *PostgresUserRepository) Create(ctx context.Context, user *domain.User) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO users (id, email, name, role, password_hash, provisional_password, financial_pass, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, user.ID, user.Email, user.Name, user.Role, user.PasswordHash,
		user.ProvisionalPassword, user.FinancialPass, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *PostgresUserRepository) Update(ctx context.Context, user *domain.User) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users SET name=$1, role=$2, updated_at=$3 WHERE id=$4
	`, user.Name, user.Role, user.UpdatedAt, user.ID)
	return err
}

func (r *PostgresUserRepository) UpdatePassword(ctx context.Context, userID string, hash string, provisional bool) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users SET password_hash=$1, provisional_password=$2, updated_at=NOW() WHERE id=$3
	`, hash, provisional, userID)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(row rowScanner) (*domain.User, error) {
	u := &domain.User{}
	err := row.Scan(
		&u.ID, &u.Email, &u.Name, &u.Role, &u.PasswordHash,
		&u.ProvisionalPassword, &u.FinancialPass, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return u, nil
}
