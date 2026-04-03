package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PayableRepository interface {
	List(ctx context.Context, filters domain.PayableFilters) ([]*domain.PayableAccounting, error)
	FindByID(ctx context.Context, id string) (*domain.PayableAccounting, error)
	Create(ctx context.Context, r *domain.PayableAccounting) error
	Update(ctx context.Context, r *domain.PayableAccounting) error
	Delete(ctx context.Context, id string) error
}

type PostgresPayableRepository struct {
	db *pgxpool.Pool
}

func NewPostgresPayableRepository(db *pgxpool.Pool) *PostgresPayableRepository {
	return &PostgresPayableRepository{db: db}
}

func (r *PostgresPayableRepository) List(ctx context.Context, f domain.PayableFilters) ([]*domain.PayableAccounting, error) {
	query := `
		SELECT id, intern_id, date_field, expense_date, transaction_type,
		       bill_num, vendor_display_name, due_date, open_balance,
		       category, aging_intervals, created_at
		FROM payables_accounting
		WHERE ($1 = '' OR vendor_display_name ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR category = $2)
		ORDER BY date_field DESC
	`
	rows, err := r.db.Query(ctx, query, f.VendorDisplayName, f.Category)
	if err != nil {
		return nil, fmt.Errorf("list payables_accounting: %w", err)
	}
	defer rows.Close()

	var records []*domain.PayableAccounting
	for rows.Next() {
		rec := &domain.PayableAccounting{}
		if err := rows.Scan(
			&rec.ID, &rec.InternID, &rec.DateField, &rec.ExpenseDate, &rec.TransactionType,
			&rec.BillNum, &rec.VendorDisplayName, &rec.DueDate, &rec.OpenBalance,
			&rec.Category, &rec.AgingIntervals, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan payables_accounting: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresPayableRepository) FindByID(ctx context.Context, id string) (*domain.PayableAccounting, error) {
	rec := &domain.PayableAccounting{}
	err := r.db.QueryRow(ctx, `
		SELECT id, intern_id, date_field, expense_date, transaction_type,
		       bill_num, vendor_display_name, due_date, open_balance,
		       category, aging_intervals, created_at
		FROM payables_accounting WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.InternID, &rec.DateField, &rec.ExpenseDate, &rec.TransactionType,
		&rec.BillNum, &rec.VendorDisplayName, &rec.DueDate, &rec.OpenBalance,
		&rec.Category, &rec.AgingIntervals, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find payables_accounting: %w", err)
	}
	return rec, nil
}

func (r *PostgresPayableRepository) Create(ctx context.Context, rec *domain.PayableAccounting) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO payables_accounting
		  (id, intern_id, date_field, expense_date, transaction_type,
		   bill_num, vendor_display_name, due_date, open_balance,
		   category, aging_intervals, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	`, rec.ID, rec.InternID, rec.DateField, rec.ExpenseDate, rec.TransactionType,
		rec.BillNum, rec.VendorDisplayName, rec.DueDate, rec.OpenBalance,
		rec.Category, rec.AgingIntervals, rec.CreatedAt)
	return err
}

func (r *PostgresPayableRepository) Update(ctx context.Context, rec *domain.PayableAccounting) error {
	_, err := r.db.Exec(ctx, `
		UPDATE payables_accounting
		SET intern_id=$1, date_field=$2, expense_date=$3, transaction_type=$4,
		    bill_num=$5, vendor_display_name=$6, due_date=$7, open_balance=$8,
		    category=$9, aging_intervals=$10
		WHERE id=$11
	`, rec.InternID, rec.DateField, rec.ExpenseDate, rec.TransactionType,
		rec.BillNum, rec.VendorDisplayName, rec.DueDate, rec.OpenBalance,
		rec.Category, rec.AgingIntervals, rec.ID)
	return err
}

func (r *PostgresPayableRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM payables_accounting WHERE id=$1", id)
	return err
}
