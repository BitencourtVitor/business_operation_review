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
	// Roster is everyone on the company's QB Time roster, minus the archived
	// (terminated) and the exception list — the people the grid always shows,
	// punched or not.
	Roster(ctx context.Context, company string) ([]AbsentEmployee, error)
	// PunchedDays maps qbt_user_id → set of YYYY-MM-DD they clocked in on.
	PunchedDays(ctx context.Context, company string, from, to time.Time) (map[int64]map[string]bool, error)
	// ReplaceWindow swaps every event overlapping [from,to] for the computed
	// set, preserving notified_at for blocks that are still the same block.
	ReplaceWindow(ctx context.Context, company string, from, to time.Time, events []AbsenceEventInput) error
	List(ctx context.Context, company string, since time.Time) ([]*domain.QBTimeAbsenceEvent, error)
	// PendingNotification returns events at or over minDays never announced yet.
	PendingNotification(ctx context.Context, company string, minDays int) ([]*domain.QBTimeAbsenceEvent, error)
	// OpenAtOrOver returns the absences still running on the last evaluated day
	// and already at or over minDays — the people who are missing right now,
	// announced or not. It is what the daily e-mail reports.
	OpenAtOrOver(ctx context.Context, company string, minDays int, lastEvaluated time.Time) ([]*domain.QBTimeAbsenceEvent, error)
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

func (r *PostgresQBTimeAbsenceRepository) Pool() *pgxpool.Pool { return r.db }

const dateLayout = "2006-01-02"

// countBusinessDays counts the weekdays in [from,to] inclusive. Used to extend
// a rebuilt block back over the days that fell out of the detection window.
func countBusinessDays(from, to time.Time) int {
	count := 0
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		switch d.Weekday() {
		case time.Saturday, time.Sunday:
			continue
		}
		count++
	}
	return count
}

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

// AbsentOn is the whole definition of a missed day: on the company roster, not
// archived, no timesheet row that date, and not on the Who's Working exception
// list. Somebody who was let go is archived in QB Time and stops being a person
// who could have shown up — they are not absent, they are gone.
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
		  AND NOT et.archived
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

func (r *PostgresQBTimeAbsenceRepository) Roster(ctx context.Context, company string) ([]AbsentEmployee, error) {
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
		  AND NOT et.archived
		  AND NOT EXISTS (
		      SELECT 1 FROM qbtime_whos_working_exceptions ex
		      WHERE LOWER(ex.company) = LOWER($1)
		        AND LOWER(TRIM(ex.employee_name)) = LOWER(TRIM(et.employee_name))
		  )
		ORDER BY et.employee_name
	`, company)
	if err != nil {
		return nil, fmt.Errorf("roster: %w", err)
	}
	defer rows.Close()

	var out []AbsentEmployee
	for rows.Next() {
		var a AbsentEmployee
		if err := rows.Scan(&a.QBTUserID, &a.EmployeeName, &a.TeamName); err != nil {
			return nil, fmt.Errorf("scan roster row: %w", err)
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *PostgresQBTimeAbsenceRepository) PunchedDays(ctx context.Context, company string, from, to time.Time) (map[int64]map[string]bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT user_id, work_date
		FROM qbtime_timesheets
		WHERE LOWER(company) = LOWER($1)
		  AND work_date >= $2
		  AND work_date <= $3
	`, company, from, to)
	if err != nil {
		return nil, fmt.Errorf("punched days: %w", err)
	}
	defer rows.Close()

	out := map[int64]map[string]bool{}
	for rows.Next() {
		var userID int64
		var day time.Time
		if err := rows.Scan(&userID, &day); err != nil {
			return nil, fmt.Errorf("scan punched day: %w", err)
		}
		if out[userID] == nil {
			out[userID] = map[string]bool{}
		}
		out[userID][day.Format(dateLayout)] = true
	}
	return out, nil
}

func (r *PostgresQBTimeAbsenceRepository) ReplaceWindow(ctx context.Context, company string, from, to time.Time, events []AbsenceEventInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// The window is deleted and rebuilt every run, so an ongoing absence comes
	// back as a brand new row. Without carrying notified_at across, the same
	// person would be announced again every single day they keep missing.
	// Keyed by the start date: a longer streak is the same absence, while a
	// new absence starts on a new date and is news worth sending.
	// An absence older than the window would restart on the window's first day
	// every run: the edge moves daily, so the block got a new start date, a new
	// key, and was announced all over again — while its "since" date lied by
	// naming the edge instead of the day the person actually stopped punching.
	// Whatever start we already recorded for a block that crosses the edge is
	// carried into the rebuilt one, which pins it for good.
	carried := map[int64]time.Time{}
	carryRows, err := tx.Query(ctx, `
		SELECT qbt_user_id, MIN(start_date)
		FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1)
		  AND end_date >= $2
		  AND start_date < $2
		GROUP BY qbt_user_id
	`, company, from)
	if err != nil {
		return fmt.Errorf("read absences crossing the window edge: %w", err)
	}
	for carryRows.Next() {
		var userID int64
		var start time.Time
		if err := carryRows.Scan(&userID, &start); err != nil {
			carryRows.Close()
			return fmt.Errorf("scan carried absence start: %w", err)
		}
		carried[userID] = start
	}
	carryRows.Close()

	notified := map[string]time.Time{}
	announcedRows, err := tx.Query(ctx, `
		SELECT qbt_user_id, start_date, notified_at
		FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1)
		  AND end_date >= $2
		  AND start_date <= $3
		  AND notified_at IS NOT NULL
	`, company, from, to)
	if err != nil {
		return fmt.Errorf("read announced absences: %w", err)
	}
	for announcedRows.Next() {
		var userID int64
		var start, at time.Time
		if err := announcedRows.Scan(&userID, &start, &at); err != nil {
			announcedRows.Close()
			return fmt.Errorf("scan announced absence: %w", err)
		}
		notified[fmt.Sprintf("%d|%s", userID, start.Format("2006-01-02"))] = at
	}
	announcedRows.Close()

	if _, err := tx.Exec(ctx, `
		DELETE FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1)
		  AND end_date >= $2
		  AND start_date <= $3
	`, company, from, to); err != nil {
		return fmt.Errorf("clear absence window: %w", err)
	}

	for _, e := range events {
		// Only a block that opens on the window's first day can be the tail of
		// an older absence; anything starting later began inside the window and
		// already carries its true date.
		if start, ok := carried[e.QBTUserID]; ok && e.StartDate.Equal(from) {
			e.DaysCount += countBusinessDays(start, from.AddDate(0, 0, -1))
			e.StartDate = start
		}
		var announcedAt any
		if at, ok := notified[fmt.Sprintf("%d|%s", e.QBTUserID, e.StartDate.Format("2006-01-02"))]; ok {
			announcedAt = at
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO qbtime_absence_events
			  (company, qbt_user_id, employee_name, team_name, start_date, end_date, days_count, notified_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (company, qbt_user_id, start_date) DO UPDATE
			SET employee_name = EXCLUDED.employee_name,
			    team_name     = EXCLUDED.team_name,
			    end_date      = EXCLUDED.end_date,
			    days_count    = EXCLUDED.days_count,
			    notified_at   = COALESCE(qbtime_absence_events.notified_at, EXCLUDED.notified_at),
			    updated_at    = NOW()
		`, company, e.QBTUserID, e.EmployeeName, e.TeamName, e.StartDate, e.EndDate, e.DaysCount, announcedAt); err != nil {
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

func (r *PostgresQBTimeAbsenceRepository) OpenAtOrOver(ctx context.Context, company string, minDays int, lastEvaluated time.Time) ([]*domain.QBTimeAbsenceEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+absenceCols+`
		FROM qbtime_absence_events
		WHERE LOWER(company) = LOWER($1)
		  AND days_count >= $2
		  AND end_date >= $3
		ORDER BY team_name ASC, employee_name ASC
	`, company, minDays, lastEvaluated)
	if err != nil {
		return nil, fmt.Errorf("list open absences: %w", err)
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
