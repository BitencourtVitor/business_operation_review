package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBTimeDailyReportRepository interface {
	List(ctx context.Context, f domain.QBTimeDailyReportFilters) ([]*domain.QBTimeDailyReport, error)
	Get(ctx context.Context, id string) (*domain.QBTimeDailyReport, error)
	Upsert(ctx context.Context, r *domain.QBTimeDailyReport) (*domain.QBTimeDailyReport, error)
	Delete(ctx context.Context, id string) error
}

type PostgresQBTimeDailyReportRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimeDailyReportRepository(db *pgxpool.Pool) *PostgresQBTimeDailyReportRepository {
	return &PostgresQBTimeDailyReportRepository{db: db}
}

func (r *PostgresQBTimeDailyReportRepository) List(ctx context.Context, f domain.QBTimeDailyReportFilters) ([]*domain.QBTimeDailyReport, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 60
	}
	query := `
		SELECT id, company, date::text, file_name, created_at, created_by_id, created_by_name
		FROM qbtime_daily_reports
		WHERE ($1 = '' OR company = $1)
		ORDER BY date DESC, created_at DESC
		LIMIT $2
	`
	rows, err := r.db.Query(ctx, query, f.Company, limit)
	if err != nil {
		return nil, fmt.Errorf("list qbtime daily reports: %w", err)
	}
	defer rows.Close()

	var out []*domain.QBTimeDailyReport
	for rows.Next() {
		rec := &domain.QBTimeDailyReport{}
		if err := rows.Scan(&rec.ID, &rec.Company, &rec.Date, &rec.FileName,
			&rec.CreatedAt, &rec.CreatedByID, &rec.CreatedByName); err != nil {
			return nil, fmt.Errorf("scan qbtime daily report: %w", err)
		}
		out = append(out, rec)
	}
	return out, nil
}

func (r *PostgresQBTimeDailyReportRepository) Get(ctx context.Context, id string) (*domain.QBTimeDailyReport, error) {
	// Header
	rec := &domain.QBTimeDailyReport{}
	err := r.db.QueryRow(ctx, `
		SELECT id, company, date::text, file_name, created_at, created_by_id, created_by_name
		FROM qbtime_daily_reports WHERE id = $1
	`, id).Scan(&rec.ID, &rec.Company, &rec.Date, &rec.FileName,
		&rec.CreatedAt, &rec.CreatedByID, &rec.CreatedByName)
	if err != nil {
		return nil, fmt.Errorf("get qbtime daily report: %w", err)
	}

	// Entries
	rows, err := r.db.Query(ctx, `
		SELECT id, report_id, employee_raw, employee_display, job_code,
		       regular_hours, overtime_hours, total_hours
		FROM qbtime_daily_report_entries
		WHERE report_id = $1
		ORDER BY employee_display, job_code
	`, id)
	if err != nil {
		return nil, fmt.Errorf("get qbtime daily report entries: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		e := domain.QBTimeDailyReportEntry{}
		if err := rows.Scan(&e.ID, &e.ReportID, &e.EmployeeRaw, &e.EmployeeDisplay,
			&e.JobCode, &e.RegularHours, &e.OvertimeHours, &e.TotalHours); err != nil {
			return nil, fmt.Errorf("scan qbtime daily report entry: %w", err)
		}
		rec.Entries = append(rec.Entries, e)
	}
	return rec, nil
}

func (r *PostgresQBTimeDailyReportRepository) Upsert(ctx context.Context, rec *domain.QBTimeDailyReport) (*domain.QBTimeDailyReport, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Upsert header — on conflict update metadata and refresh created_at
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO qbtime_daily_reports (company, date, file_name, created_by_id, created_by_name)
		VALUES ($1, $2::date, $3, $4, $5)
		ON CONFLICT (company, date) DO UPDATE
		  SET file_name       = EXCLUDED.file_name,
		      created_by_id   = EXCLUDED.created_by_id,
		      created_by_name = EXCLUDED.created_by_name,
		      created_at      = NOW()
		RETURNING id
	`, rec.Company, rec.Date, rec.FileName, rec.CreatedByID, rec.CreatedByName).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("upsert qbtime daily report: %w", err)
	}

	// Clear old entries
	if _, err := tx.Exec(ctx, `DELETE FROM qbtime_daily_report_entries WHERE report_id = $1`, id); err != nil {
		return nil, fmt.Errorf("clear qbtime entries: %w", err)
	}

	// Batch insert new entries
	for _, e := range rec.Entries {
		if _, err := tx.Exec(ctx, `
			INSERT INTO qbtime_daily_report_entries
			  (report_id, employee_raw, employee_display, job_code, regular_hours, overtime_hours, total_hours)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, id, e.EmployeeRaw, e.EmployeeDisplay, e.JobCode, e.RegularHours, e.OvertimeHours, e.TotalHours); err != nil {
			return nil, fmt.Errorf("insert qbtime entry: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit qbtime upsert: %w", err)
	}

	rec.ID = id
	return rec, nil
}

func (r *PostgresQBTimeDailyReportRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM qbtime_daily_reports WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete qbtime daily report: %w", err)
	}
	return nil
}
