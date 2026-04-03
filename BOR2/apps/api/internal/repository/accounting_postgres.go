package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AccountingRepository interface {
	List(ctx context.Context, filters domain.AccountingFilters) ([]*domain.AccountingRecord, error)
	FindByID(ctx context.Context, id string) (*domain.AccountingRecord, error)
	Create(ctx context.Context, r *domain.AccountingRecord) error
	Update(ctx context.Context, r *domain.AccountingRecord) error
	Delete(ctx context.Context, id string) error
	Summary(ctx context.Context, filters domain.AccountingFilters) (*domain.AccountingSummary, error)
}

type PostgresAccountingRepository struct {
	db *pgxpool.Pool
}

func NewPostgresAccountingRepository(db *pgxpool.Pool) *PostgresAccountingRepository {
	return &PostgresAccountingRepository{db: db}
}

func (r *PostgresAccountingRepository) List(ctx context.Context, f domain.AccountingFilters) ([]*domain.AccountingRecord, error) {
	query := `
		SELECT id, company, type, month, year, amount, description,
		       category, due_date, paid_date, created_at, updated_at
		FROM accounting_records
		WHERE ($1 = '' OR company::text = $1)
		  AND ($2 = '' OR type::text = $2)
		  AND ($3 = '' OR month = $3)
		  AND ($4 = 0 OR year = $4)
		ORDER BY year DESC, month DESC
	`
	rows, err := r.db.Query(ctx, query, f.Company, string(f.Type), f.Month, f.Year)
	if err != nil {
		return nil, fmt.Errorf("list accounting: %w", err)
	}
	defer rows.Close()

	var records []*domain.AccountingRecord
	for rows.Next() {
		rec := &domain.AccountingRecord{}
		if err := rows.Scan(
			&rec.ID, &rec.Company, &rec.Type, &rec.Month, &rec.Year,
			&rec.Amount, &rec.Description, &rec.Category,
			&rec.DueDate, &rec.PaidDate, &rec.CreatedAt, &rec.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan accounting: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresAccountingRepository) FindByID(ctx context.Context, id string) (*domain.AccountingRecord, error) {
	rec := &domain.AccountingRecord{}
	err := r.db.QueryRow(ctx, `
		SELECT id, company, type, month, year, amount, description,
		       category, due_date, paid_date, created_at, updated_at
		FROM accounting_records WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.Company, &rec.Type, &rec.Month, &rec.Year,
		&rec.Amount, &rec.Description, &rec.Category,
		&rec.DueDate, &rec.PaidDate, &rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find accounting: %w", err)
	}
	return rec, nil
}

func (r *PostgresAccountingRepository) Create(ctx context.Context, rec *domain.AccountingRecord) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO accounting_records
		  (id, company, type, month, year, amount, description, category, due_date, paid_date, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	`, rec.ID, rec.Company, rec.Type, rec.Month, rec.Year,
		rec.Amount, rec.Description, rec.Category,
		rec.DueDate, rec.PaidDate, rec.CreatedAt, rec.UpdatedAt)
	return err
}

func (r *PostgresAccountingRepository) Update(ctx context.Context, rec *domain.AccountingRecord) error {
	_, err := r.db.Exec(ctx, `
		UPDATE accounting_records
		SET amount=$1, description=$2, category=$3, due_date=$4, paid_date=$5, updated_at=$6
		WHERE id=$7
	`, rec.Amount, rec.Description, rec.Category,
		rec.DueDate, rec.PaidDate, rec.UpdatedAt, rec.ID)
	return err
}

func (r *PostgresAccountingRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM accounting_records WHERE id=$1", id)
	return err
}

func (r *PostgresAccountingRepository) Summary(ctx context.Context, f domain.AccountingFilters) (*domain.AccountingSummary, error) {
	row := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN type='receivables' THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type='payables'    THEN amount ELSE 0 END), 0)
		FROM accounting_records
		WHERE ($1 = '' OR company::text = $1)
		  AND ($2 = 0 OR year = $2)
	`, f.Company, f.Year)

	s := &domain.AccountingSummary{}
	if err := row.Scan(&s.TotalReceivables, &s.TotalPayables); err != nil {
		return nil, fmt.Errorf("summary accounting: %w", err)
	}
	s.NetBalance = s.TotalReceivables - s.TotalPayables
	return s, nil
}
