package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AbsentEmployee is one person missing from a given work day.
type AbsentEmployee struct {
	QBTUserID    int64
	EmployeeName string
	TeamName     string
}

// AbsenceEventInput is a computed block, ready to be persisted.
type AbsenceEventInput struct {
	QBTUserID    int64
	EmployeeName string
	TeamName     string
	StartDate    time.Time
	EndDate      time.Time
	DaysCount    int
}

type QBTimeAbsenceRepository interface {
	// DaysWithActivity returns, out of the given candidate days, only those the
	// company actually punched on. Used to drop holidays and failed syncs.
	DaysWithActivity(ctx context.Context, company string, days []time.Time) (map[string]bool, error)
	AbsentOn(ctx context.Context, company string, day time.Time) ([]AbsentEmployee, error)
	// ReplaceWindow swaps every event overlapping [from,to] for the computed
	// set, preserving notified_at for blocks that are still the same block.
	ReplaceWindow(ctx context.Context, company string, from, to time.Time, events []AbsenceEventInput) error
	List(ctx context.Context, company string, since time.Time) ([]*domain.QBTimeAbsenceEvent, error)
	// PendingNotification returns events at or over minDays never announced yet.
	PendingNotification(ctx context.Context, company string, minDays int) ([]*domain.QBTimeAbsenceEvent, error)
	MarkNotified(ctx context.Context, ids []string) error
	// RecipientsFor returns user IDs holding the given permission key at any level.
	RecipientsFor(ctx context.Context, permKey string) ([]string, error)
}

type PostgresQBTimeAbsenceRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimeAbsenceRepository(db *pgxpool.Pool) *PostgresQBTimeAbsenceRepository {
	return &PostgresQBTimeAbsenceRepository{db: db}
}

const dateLayout = "2006-01-02"

func (r *PostgresQBTimeAbsenceRepository) DaysWithActivity(ctx context.Context, company string, days []time.Time) (map[string]bool, error) {
	out := make(map[string]bool, len(days))
	if len(days) == 0 {
		return out, nil
	}
	list := make([]time.Time, len(days))
	copy(list, days)

	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT work_date
		FROM qbtime_timesheets
		WHERE LOWER(company) = LOWER($1)
		  AND work_date = ANY($2::date[])
	`, company, list)
	if err != nil {
		return nil, fmt.Errorf("days with activity: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			return nil, fmt.Errorf("scan active day: %w", err)
		}
		out[d.Format(dateLayout)] = true
	}
	return out, nil
}

// AbsentOn is the whole definition of a missed day: on the company roster, no
// timesheet row that date, and not on the Who's Working exception list.
func (r *PostgresQBTimeAbsenceRepository) AbsentOn(ctx context.Context, company string, day time.Time) ([]AbsentEmployee, error) {
	rows, err := r.db.Query(ctx, `
		SELECT et.qbt_user_id,
		       et.employee_name,
		       COALESCE(
		           NULLIF(TRIM(et.override_team_name), ''),
		           NULLIF(TRIM(et.qbt_team_name), ''),
		           'Unassigned'
		       ) AS team_name
		FROM qbtime_employee_teams et
		WHERE LOWER(et.company) = LOWER($1)
		  AND NOT EXISTS (
		      SELECT 1 FROM qbtime_timesheets ts
		      WHERE LOWER(ts.company) = LOWER($1)
		        AND ts.user_id  = et.qbt_user_id
		        AND ts.work_date = $2
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM qbtime_whos_working_exceptions ex
		      WHERE LOWER(ex.company) = LOWER($1)
		        AND LOWER(TRIM(ex.employee_name)) = LOWER(TRIM(et.employee_name))
		  )
		ORDER BY et.employee_name
	`, company, day)
	if err != nil {
		return nil, fmt.Errorf("absent on %s: %w", day.Format(dateLayout), err)
	}
	defer rows.Close()

	var out []AbsentEmployee
	for rows.Next() {
		var a AbsentEmployee
		if err := rows.Scan(&a.QBTUserID, &a.EmployeeName, &a.TeamName); err != nil {
			return nil, fmt.Errorf("scan absent employee: %w", err)
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *PostgresQBTimeAbsenceRepository) ReplaceWindow(ctx context.Context, company string, from, to time.Time, events []AbsenceEventInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		DELETE FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1)
		  AND end_date >= $2
		  AND start_date <= $3
	`, company, from, to); err != nil {
		return fmt.Errorf("clear absence window: %w", err)
	}

	for _, e := range events {
		if _, err := tx.Exec(ctx, `
			INSERT INTO qbtime_absence_events
			  (company, qbt_user_id, employee_name, team_name, start_date, end_date, days_count)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (company, qbt_user_id, start_date) DO UPDATE
			SET employee_name = EXCLUDED.employee_name,
			    team_name     = EXCLUDED.team_name,
			    end_date      = EXCLUDED.end_date,
			    days_count    = EXCLUDED.days_count,
			    updated_at    = NOW()
		`, company, e.QBTUserID, e.EmployeeName, e.TeamName, e.StartDate, e.EndDate, e.DaysCount); err != nil {
			return fmt.Errorf("upsert absence event (user_id=%d): %w", e.QBTUserID, err)
		}
	}
	return tx.Commit(ctx)
}

const absenceCols = `id, company, qbt_user_id, employee_name, team_name, start_date, end_date, days_count, notified_at`

func scanAbsenceRows(rows interface {
	Next() bool
	Scan(...any) error
	Close()
}) ([]*domain.QBTimeAbsenceEvent, error) {
	defer rows.Close()
	var out []*domain.QBTimeAbsenceEvent
	for rows.Next() {
		e := &domain.QBTimeAbsenceEvent{}
		var start, end time.Time
		if err := rows.Scan(
			&e.ID, &e.Company, &e.QBTUserID, &e.EmployeeName, &e.TeamName,
			&start, &end, &e.DaysCount, &e.NotifiedAt,
		); err != nil {
			return nil, fmt.Errorf("scan absence event: %w", err)
		}
		e.StartDate = start.Format(dateLayout)
		e.EndDate = end.Format(dateLayout)
		out = append(out, e)
	}
	return out, nil
}

func (r *PostgresQBTimeAbsenceRepository) List(ctx context.Context, company string, since time.Time) ([]*domain.QBTimeAbsenceEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+absenceCols+`
		FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1) AND end_date >= $2
		ORDER BY days_count DESC, end_date DESC, employee_name ASC
	`, company, since)
	if err != nil {
		return nil, fmt.Errorf("list absence events: %w", err)
	}
	return scanAbsenceRows(rows)
}

func (r *PostgresQBTimeAbsenceRepository) PendingNotification(ctx context.Context, company string, minDays int) ([]*domain.QBTimeAbsenceEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+absenceCols+`
		FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1)
		  AND days_count >= $2
		  AND notified_at IS NULL
		ORDER BY days_count DESC, employee_name ASC
	`, company, minDays)
	if err != nil {
		return nil, fmt.Errorf("list pending absence notifications: %w", err)
	}
	return scanAbsenceRows(rows)
}

func (r *PostgresQBTimeAbsenceRepository) MarkNotified(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := r.db.Exec(ctx,
		`UPDATE qbtime_absence_events SET notified_at = NOW(), updated_at = NOW() WHERE id = ANY($1::uuid[])`,
		ids,
	)
	if err != nil {
		return fmt.Errorf("mark absence events notified: %w", err)
	}
	return nil
}

// RecipientsFor keys the alert off the same permission that unlocks the page:
// granting absence_control in Settings is what subscribes someone.
func (r *PostgresQBTimeAbsenceRepository) RecipientsFor(ctx context.Context, permKey string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT user_id FROM user_permissions WHERE permissions ? $1`, permKey,
	)
	if err != nil {
		return nil, fmt.Errorf("list absence alert recipients: %w", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan recipient: %w", err)
		}
		out = append(out, id)
	}
	return out, nil
}
