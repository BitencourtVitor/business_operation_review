package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReceivableRepository interface {
	List(ctx context.Context, filters domain.ReceivableFilters) ([]*domain.ReceivableAccounting, error)
	FindByID(ctx context.Context, id string) (*domain.ReceivableAccounting, error)
	Create(ctx context.Context, r *domain.ReceivableAccounting) error
	Update(ctx context.Context, r *domain.ReceivableAccounting) error
	Delete(ctx context.Context, id string) error
}

type PostgresReceivableRepository struct {
	db *pgxpool.Pool
}

func NewPostgresReceivableRepository(db *pgxpool.Pool) *PostgresReceivableRepository {
	return &PostgresReceivableRepository{db: db}
}

func (r *PostgresReceivableRepository) List(ctx context.Context, f domain.ReceivableFilters) ([]*domain.ReceivableAccounting, error) {
	query := `
		SELECT id, intern_id, date_field, inv_date, transaction_type,
		       inv_num, customer_full_name, due_date, open_balance,
		       category, aging_intervals, created_at
		FROM receivables_accounting
		WHERE ($1 = '' OR customer_full_name ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR category = $2)
		ORDER BY date_field DESC
	`
	rows, err := r.db.Query(ctx, query, f.CustomerFullName, f.Category)
	if err != nil {
		return nil, fmt.Errorf("list receivables_accounting: %w", err)
	}
	defer rows.Close()

	var records []*domain.ReceivableAccounting
	for rows.Next() {
		rec := &domain.ReceivableAccounting{}
		if err := rows.Scan(
			&rec.ID, &rec.InternID, &rec.DateField, &rec.InvDate, &rec.TransactionType,
			&rec.InvNum, &rec.CustomerFullName, &rec.DueDate, &rec.OpenBalance,
			&rec.Category, &rec.AgingIntervals, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan receivables_accounting: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresReceivableRepository) FindByID(ctx context.Context, id string) (*domain.ReceivableAccounting, error) {
	rec := &domain.ReceivableAccounting{}
	err := r.db.QueryRow(ctx, `
		SELECT id, intern_id, date_field, inv_date, transaction_type,
		       inv_num, customer_full_name, due_date, open_balance,
		       category, aging_intervals, created_at
		FROM receivables_accounting WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.InternID, &rec.DateField, &rec.InvDate, &rec.TransactionType,
		&rec.InvNum, &rec.CustomerFullName, &rec.DueDate, &rec.OpenBalance,
		&rec.Category, &rec.AgingIntervals, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find receivables_accounting: %w", err)
	}
	return rec, nil
}

func (r *PostgresReceivableRepository) Create(ctx context.Context, rec *domain.ReceivableAccounting) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO receivables_accounting
		  (id, intern_id, date_field, inv_date, transaction_type,
		   inv_num, customer_full_name, due_date, open_balance,
		   category, aging_intervals, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	`, rec.ID, rec.InternID, rec.DateField, rec.InvDate, rec.TransactionType,
		rec.InvNum, rec.CustomerFullName, rec.DueDate, rec.OpenBalance,
		rec.Category, rec.AgingIntervals, rec.CreatedAt)
	return err
}

func (r *PostgresReceivableRepository) Update(ctx context.Context, rec *domain.ReceivableAccounting) error {
	_, err := r.db.Exec(ctx, `
		UPDATE receivables_accounting
		SET intern_id=$1, date_field=$2, inv_date=$3, transaction_type=$4,
		    inv_num=$5, customer_full_name=$6, due_date=$7, open_balance=$8,
		    category=$9, aging_intervals=$10
		WHERE id=$11
	`, rec.InternID, rec.DateField, rec.InvDate, rec.TransactionType,
		rec.InvNum, rec.CustomerFullName, rec.DueDate, rec.OpenBalance,
		rec.Category, rec.AgingIntervals, rec.ID)
	return err
}

func (r *PostgresReceivableRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM receivables_accounting WHERE id=$1", id)
	return err
}
