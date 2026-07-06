package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WorkforceUploadRepository interface {
	List(ctx context.Context) ([]*domain.WorkforceUpload, error)
	FindByID(ctx context.Context, id string) (*domain.WorkforceUpload, error)
	FindByMonthAndCompany(ctx context.Context, month, company string) (*domain.WorkforceUpload, error)
	Create(ctx context.Context, u *domain.WorkforceUpload) error
	Delete(ctx context.Context, id string) error
	BulkInsertRows(ctx context.Context, rows []*domain.WorkforceProductivityRow) error
}

type PostgresWorkforceUploadRepository struct {
	db *pgxpool.Pool
}

func NewPostgresWorkforceUploadRepository(db *pgxpool.Pool) *PostgresWorkforceUploadRepository {
	return &PostgresWorkforceUploadRepository{db: db}
}

func (r *PostgresWorkforceUploadRepository) List(ctx context.Context) ([]*domain.WorkforceUpload, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, reference_month, company, file_name, record_count, total_hours,
		       COALESCE(uploaded_by, ''), uploaded_at, status
		FROM workforce_uploads
		ORDER BY reference_month DESC, company ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list workforce uploads: %w", err)
	}
	defer rows.Close()

	var results []*domain.WorkforceUpload
	for rows.Next() {
		u := &domain.WorkforceUpload{}
		if err := rows.Scan(&u.ID, &u.ReferenceMonth, &u.Company, &u.FileName,
			&u.RecordCount, &u.TotalHours, &u.UploadedBy, &u.UploadedAt, &u.Status); err != nil {
			continue
		}
		results = append(results, u)
	}
	return results, nil
}

func (r *PostgresWorkforceUploadRepository) FindByID(ctx context.Context, id string) (*domain.WorkforceUpload, error) {
	u := &domain.WorkforceUpload{}
	err := r.db.QueryRow(ctx, `
		SELECT id, reference_month, company, file_name, record_count, total_hours,
		       COALESCE(uploaded_by, ''), uploaded_at, status
		FROM workforce_uploads WHERE id = $1
	`, id).Scan(&u.ID, &u.ReferenceMonth, &u.Company, &u.FileName,
		&u.RecordCount, &u.TotalHours, &u.UploadedBy, &u.UploadedAt, &u.Status)
	if err != nil {
		return nil, fmt.Errorf("find workforce upload: %w", err)
	}
	return u, nil
}

func (r *PostgresWorkforceUploadRepository) FindByMonthAndCompany(ctx context.Context, month, company string) (*domain.WorkforceUpload, error) {
	u := &domain.WorkforceUpload{}
	err := r.db.QueryRow(ctx, `
		SELECT id, reference_month, company, file_name, record_count, total_hours,
		       COALESCE(uploaded_by, ''), uploaded_at, status
		FROM workforce_uploads WHERE reference_month = $1 AND company = $2
	`, month, company).Scan(&u.ID, &u.ReferenceMonth, &u.Company, &u.FileName,
		&u.RecordCount, &u.TotalHours, &u.UploadedBy, &u.UploadedAt, &u.Status)
	if err != nil {
		return nil, nil // not found — no conflict
	}
	return u, nil
}

func (r *PostgresWorkforceUploadRepository) Create(ctx context.Context, u *domain.WorkforceUpload) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO workforce_uploads (id, reference_month, company, file_name, record_count, total_hours, uploaded_by, status)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8)
	`, u.ID, u.ReferenceMonth, u.Company, u.FileName, u.RecordCount, u.TotalHours, u.UploadedBy, u.Status)
	return err
}

func (r *PostgresWorkforceUploadRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM workforce_uploads WHERE id = $1`, id)
	return err
}

func (r *PostgresWorkforceUploadRepository) BulkInsertRows(ctx context.Context, rows []*domain.WorkforceProductivityRow) error {
	if len(rows) == 0 {
		return nil
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, row := range rows {
		_, err := tx.Exec(ctx, `
			INSERT INTO workforce_productivity
				(id, upload_id, client, jobsite, lot_building, worktype, employee_name, regular_rate, regular_hours, reference_month, company, work_date)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NULLIF($12,'')::date)
		`, row.ID, row.UploadID, row.Client, row.Jobsite, row.LotBuilding, row.Worktype,
			row.EmployeeName, row.RegularRate, row.RegularHours, row.ReferenceMonth, row.Company, row.WorkDate)
		if err != nil {
			return fmt.Errorf("insert row: %w", err)
		}
	}
	return tx.Commit(ctx)
}
