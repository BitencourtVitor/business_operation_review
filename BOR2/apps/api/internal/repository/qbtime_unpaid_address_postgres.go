package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type QBTimeUnpaidAddressRepository interface {
	List(ctx context.Context, company string) ([]string, error)
	Set(ctx context.Context, company, address string) error
	Unset(ctx context.Context, company, address string) error
}

type PostgresQBTimeUnpaidAddressRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimeUnpaidAddressRepository(db *pgxpool.Pool) *PostgresQBTimeUnpaidAddressRepository {
	return &PostgresQBTimeUnpaidAddressRepository{db: db}
}

func (r *PostgresQBTimeUnpaidAddressRepository) List(ctx context.Context, company string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT address FROM qbtime_unpaid_addresses WHERE LOWER(company) = LOWER($1)`,
		company,
	)
	if err != nil {
		return nil, fmt.Errorf("list unpaid addresses: %w", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var a string
		if err := rows.Scan(&a); err != nil {
			return nil, fmt.Errorf("scan unpaid address: %w", err)
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *PostgresQBTimeUnpaidAddressRepository) Set(ctx context.Context, company, address string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO qbtime_unpaid_addresses (company, address)
		VALUES (LOWER($1), $2)
		ON CONFLICT (company, address) DO NOTHING
	`, company, strings.TrimSpace(address))
	if err != nil {
		return fmt.Errorf("set unpaid address: %w", err)
	}
	return nil
}

func (r *PostgresQBTimeUnpaidAddressRepository) Unset(ctx context.Context, company, address string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM qbtime_unpaid_addresses WHERE LOWER(company) = LOWER($1) AND address = $2`,
		company, strings.TrimSpace(address),
	)
	if err != nil {
		return fmt.Errorf("unset unpaid address: %w", err)
	}
	return nil
}
