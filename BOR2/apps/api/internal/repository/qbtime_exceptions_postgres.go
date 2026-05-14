package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBTimeExceptionsRepository interface {
	List(ctx context.Context, company string) ([]*domain.WhosWorkingException, error)
	Upsert(ctx context.Context, company, name string) (*domain.WhosWorkingException, error)
	Delete(ctx context.Context, id string) error
}

type PostgresQBTimeExceptionsRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimeExceptionsRepository(db *pgxpool.Pool) *PostgresQBTimeExceptionsRepository {
	return &PostgresQBTimeExceptionsRepository{db: db}
}

func (r *PostgresQBTimeExceptionsRepository) List(ctx context.Context, company string) ([]*domain.WhosWorkingException, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, company, employee_name, created_at
		FROM qbtime_exceptions
		WHERE LOWER(company) = $1
		ORDER BY employee_name ASC
	`, company)
	if err != nil {
		return nil, fmt.Errorf("list qbtime exceptions: %w", err)
	}
	defer rows.Close()

	var out []*domain.WhosWorkingException
	for rows.Next() {
		e := &domain.WhosWorkingException{}
		if err := rows.Scan(&e.ID, &e.Company, &e.EmployeeName, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan qbtime exception: %w", err)
		}
		out = append(out, e)
	}
	return out, nil
}

func (r *PostgresQBTimeExceptionsRepository) Upsert(ctx context.Context, company, name string) (*domain.WhosWorkingException, error) {
	e := &domain.WhosWorkingException{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO qbtime_exceptions (company, employee_name)
		VALUES ($1, $2)
		ON CONFLICT (company, employee_name) DO UPDATE
		  SET employee_name = EXCLUDED.employee_name
		RETURNING id, company, employee_name, created_at
	`, company, name).Scan(&e.ID, &e.Company, &e.EmployeeName, &e.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert qbtime exception: %w", err)
	}
	return e, nil
}

func (r *PostgresQBTimeExceptionsRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM qbtime_exceptions WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete qbtime exception: %w", err)
	}
	return nil
}
