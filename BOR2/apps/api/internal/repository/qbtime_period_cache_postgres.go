package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBTimePeriodCacheRepository interface {
	ReplaceTimesheets(ctx context.Context, company, startDate, endDate string, rows []domain.QBTimesheetRow) error
	UpsertTimesheets(ctx context.Context, company string, rows []domain.QBTimesheetRow) error
	DeleteTimesheets(ctx context.Context, company string, qbtIDs []int64) error
	GetTimesheets(ctx context.Context, company, startDate, endDate string) ([]domain.QBTimesheetRow, error)
	ReplacePayroll(ctx context.Context, company, periodEnd string, rows []domain.QBPayrollRow) error
	GetPayroll(ctx context.Context, company, periodEnd string) ([]domain.QBPayrollRow, error)
	GetSyncState(ctx context.Context, company string) (*domain.QBSyncState, error)
	RefreshSyncState(ctx context.Context, company, syncedThrough string) error
	Prune(ctx context.Context, company, beforeDate string) error
}

type PostgresQBTimePeriodCacheRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimePeriodCacheRepository(db *pgxpool.Pool) *PostgresQBTimePeriodCacheRepository {
	return &PostgresQBTimePeriodCacheRepository{db: db}
}

func pathToJSON(p []string) string {
	if p == nil {
		p = []string{}
	}
	b, _ := json.Marshal(p)
	return string(b)
}

// ReplaceTimesheets swaps every cached block in [startDate, endDate] for the
// given rows in one transaction, so QB Time edits and deletions are reflected.
func (r *PostgresQBTimePeriodCacheRepository) ReplaceTimesheets(ctx context.Context, company, startDate, endDate string, rows []domain.QBTimesheetRow) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM qbtime_timesheets WHERE company = $1 AND work_date >= $2 AND work_date <= $3`,
		company, startDate, endDate,
	); err != nil {
		return fmt.Errorf("clear timesheets: %w", err)
	}

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`
			INSERT INTO qbtime_timesheets
			  (company, qbt_id, user_id, user_name, jobcode_id, jobcode_path, work_date, start_ts, end_ts, duration_min, type, is_paid, synced_at)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12, now())
			ON CONFLICT (company, qbt_id) DO UPDATE SET
			  user_id=EXCLUDED.user_id, user_name=EXCLUDED.user_name,
			  jobcode_id=EXCLUDED.jobcode_id, jobcode_path=EXCLUDED.jobcode_path,
			  work_date=EXCLUDED.work_date, start_ts=EXCLUDED.start_ts, end_ts=EXCLUDED.end_ts,
			  duration_min=EXCLUDED.duration_min, type=EXCLUDED.type, is_paid=EXCLUDED.is_paid, synced_at=now()
		`, row.Company, row.QBTID, row.UserID, row.UserName, row.JobcodeID, pathToJSON(row.JobcodePath),
			row.WorkDate, row.Start, row.End, row.DurationMin, row.Type, row.IsPaid)
	}
	if batch.Len() > 0 {
		br := tx.SendBatch(ctx, batch)
		for range rows {
			if _, err := br.Exec(); err != nil {
				br.Close()
				return fmt.Errorf("insert timesheet: %w", err)
			}
		}
		if err := br.Close(); err != nil {
			return fmt.Errorf("close timesheet batch: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// UpsertTimesheets inserts or updates individual timesheet rows without
// touching the rest of the cache — used by delta sync.
func (r *PostgresQBTimePeriodCacheRepository) UpsertTimesheets(ctx context.Context, company string, rows []domain.QBTimesheetRow) error {
	if len(rows) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`
			INSERT INTO qbtime_timesheets
			  (company, qbt_id, user_id, user_name, jobcode_id, jobcode_path, work_date, start_ts, end_ts, duration_min, type, is_paid, synced_at)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12, now())
			ON CONFLICT (company, qbt_id) DO UPDATE SET
			  user_id=EXCLUDED.user_id, user_name=EXCLUDED.user_name,
			  jobcode_id=EXCLUDED.jobcode_id, jobcode_path=EXCLUDED.jobcode_path,
			  work_date=EXCLUDED.work_date, start_ts=EXCLUDED.start_ts, end_ts=EXCLUDED.end_ts,
			  duration_min=EXCLUDED.duration_min, type=EXCLUDED.type, is_paid=EXCLUDED.is_paid, synced_at=now()
		`, row.Company, row.QBTID, row.UserID, row.UserName, row.JobcodeID, pathToJSON(row.JobcodePath),
			row.WorkDate, row.Start, row.End, row.DurationMin, row.Type, row.IsPaid)
	}
	br := r.db.SendBatch(ctx, batch)
	defer br.Close()
	for range rows {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upsert timesheet: %w", err)
		}
	}
	return br.Close()
}

// DeleteTimesheets removes individual timesheet rows by QB Time ID — used
// to reflect deletions discovered during a delta sync (active=false).
func (r *PostgresQBTimePeriodCacheRepository) DeleteTimesheets(ctx context.Context, company string, qbtIDs []int64) error {
	if len(qbtIDs) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, id := range qbtIDs {
		batch.Queue(`DELETE FROM qbtime_timesheets WHERE company = $1 AND qbt_id = $2`, company, id)
	}
	br := r.db.SendBatch(ctx, batch)
	defer br.Close()
	for range qbtIDs {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("delete timesheet: %w", err)
		}
	}
	return br.Close()
}

func (r *PostgresQBTimePeriodCacheRepository) GetTimesheets(ctx context.Context, company, startDate, endDate string) ([]domain.QBTimesheetRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT company, qbt_id, user_id, user_name, jobcode_id, jobcode_path::text,
		       to_char(work_date, 'YYYY-MM-DD'), start_ts, end_ts, duration_min, type, is_paid
		FROM qbtime_timesheets
		WHERE company = $1 AND work_date >= $2 AND work_date <= $3
	`, company, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("get timesheets: %w", err)
	}
	defer rows.Close()

	var out []domain.QBTimesheetRow
	for rows.Next() {
		var ts domain.QBTimesheetRow
		var pathJSON string
		if err := rows.Scan(&ts.Company, &ts.QBTID, &ts.UserID, &ts.UserName, &ts.JobcodeID,
			&pathJSON, &ts.WorkDate, &ts.Start, &ts.End, &ts.DurationMin, &ts.Type, &ts.IsPaid); err != nil {
			return nil, fmt.Errorf("scan timesheet: %w", err)
		}
		_ = json.Unmarshal([]byte(pathJSON), &ts.JobcodePath)
		out = append(out, ts)
	}
	return out, nil
}

func (r *PostgresQBTimePeriodCacheRepository) ReplacePayroll(ctx context.Context, company, periodEnd string, rows []domain.QBPayrollRow) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM qbtime_payroll WHERE company = $1 AND period_end = $2`,
		company, periodEnd,
	); err != nil {
		return fmt.Errorf("clear payroll: %w", err)
	}

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`
			INSERT INTO qbtime_payroll
			  (company, period_end, user_id, user_name, pay_rate, jobcode_id, jobcode_path, reg_seconds, ot_seconds, synced_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9, now())
			ON CONFLICT (company, period_end, user_id, jobcode_id) DO UPDATE SET
			  user_name=EXCLUDED.user_name, pay_rate=EXCLUDED.pay_rate, jobcode_path=EXCLUDED.jobcode_path,
			  reg_seconds=EXCLUDED.reg_seconds, ot_seconds=EXCLUDED.ot_seconds, synced_at=now()
		`, row.Company, periodEnd, row.UserID, row.UserName, row.PayRate, row.JobcodeID,
			pathToJSON(row.JobcodePath), row.RegSeconds, row.OTSeconds)
	}
	if batch.Len() > 0 {
		br := tx.SendBatch(ctx, batch)
		for range rows {
			if _, err := br.Exec(); err != nil {
				br.Close()
				return fmt.Errorf("insert payroll: %w", err)
			}
		}
		if err := br.Close(); err != nil {
			return fmt.Errorf("close payroll batch: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func (r *PostgresQBTimePeriodCacheRepository) GetPayroll(ctx context.Context, company, periodEnd string) ([]domain.QBPayrollRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT company, to_char(period_end, 'YYYY-MM-DD'), user_id, user_name, pay_rate,
		       jobcode_id, jobcode_path::text, reg_seconds, ot_seconds
		FROM qbtime_payroll
		WHERE company = $1 AND period_end = $2
	`, company, periodEnd)
	if err != nil {
		return nil, fmt.Errorf("get payroll: %w", err)
	}
	defer rows.Close()

	var out []domain.QBPayrollRow
	for rows.Next() {
		var p domain.QBPayrollRow
		var pathJSON string
		if err := rows.Scan(&p.Company, &p.PeriodEnd, &p.UserID, &p.UserName, &p.PayRate,
			&p.JobcodeID, &pathJSON, &p.RegSeconds, &p.OTSeconds); err != nil {
			return nil, fmt.Errorf("scan payroll: %w", err)
		}
		_ = json.Unmarshal([]byte(pathJSON), &p.JobcodePath)
		out = append(out, p)
	}
	return out, nil
}

func (r *PostgresQBTimePeriodCacheRepository) GetSyncState(ctx context.Context, company string) (*domain.QBSyncState, error) {
	var st domain.QBSyncState
	var minDate, maxDate *string
	err := r.db.QueryRow(ctx, `
		SELECT company,
		       to_char(min_date, 'YYYY-MM-DD'),
		       to_char(max_date, 'YYYY-MM-DD'),
		       last_run_at
		FROM qbtime_sync_state WHERE company = $1
	`, company).Scan(&st.Company, &minDate, &maxDate, &st.LastRunAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get sync state: %w", err)
	}
	if minDate != nil {
		st.MinDate = *minDate
	}
	if maxDate != nil {
		st.MaxDate = *maxDate
	}
	return &st, nil
}

// RefreshSyncState records the cached coverage window: min_date follows the data
// actually present (kept in step with pruning), while max_date is the date the
// sync ran THROUGH (≈ today) — not the last day with a punch. Using the synced-
// through date lets reads serve in-progress periods whose end is in the future
// and periods that simply start after the most recent punch.
func (r *PostgresQBTimePeriodCacheRepository) RefreshSyncState(ctx context.Context, company, syncedThrough string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO qbtime_sync_state (company, min_date, max_date, last_run_at)
		VALUES ($1,
		        (SELECT MIN(work_date) FROM qbtime_timesheets WHERE company = $1),
		        COALESCE((SELECT MAX(work_date) FROM qbtime_timesheets WHERE company = $1), $2::date),
		        now())
		ON CONFLICT (company) DO UPDATE SET
		  min_date    = EXCLUDED.min_date,
		  max_date    = EXCLUDED.max_date,
		  last_run_at = now()
	`, company, syncedThrough)
	if err != nil {
		return fmt.Errorf("refresh sync state: %w", err)
	}
	return nil
}

func (r *PostgresQBTimePeriodCacheRepository) Prune(ctx context.Context, company, beforeDate string) error {
	if _, err := r.db.Exec(ctx,
		`DELETE FROM qbtime_timesheets WHERE company = $1 AND work_date < $2`, company, beforeDate,
	); err != nil {
		return fmt.Errorf("prune timesheets: %w", err)
	}
	if _, err := r.db.Exec(ctx,
		`DELETE FROM qbtime_payroll WHERE company = $1 AND period_end < $2`, company, beforeDate,
	); err != nil {
		return fmt.Errorf("prune payroll: %w", err)
	}
	return nil
}
