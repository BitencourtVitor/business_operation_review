package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// QBTimeEmployeeTeamSyncRow is one employee's QB Time state as of the last
// sync — never touches the override columns.
type QBTimeEmployeeTeamSyncRow struct {
	QBTUserID    int
	EmployeeName string
	QBTeamID     *int
	QBTeamName   *string
}

type QBTimeEmployeeTeamRepository interface {
	List(ctx context.Context, company string) ([]*domain.QBTimeEmployeeTeam, error)
	UpsertFromSync(ctx context.Context, company string, rows []QBTimeEmployeeTeamSyncRow) error
	SetOverride(ctx context.Context, id, overrideTeamName, overriddenBy string) (*domain.QBTimeEmployeeTeam, error)
	ClearOverride(ctx context.Context, id string) (*domain.QBTimeEmployeeTeam, error)
}

type PostgresQBTimeEmployeeTeamRepository struct {
	db *pgxpool.Pool
}

func NewPostgresQBTimeEmployeeTeamRepository(db *pgxpool.Pool) *PostgresQBTimeEmployeeTeamRepository {
	return &PostgresQBTimeEmployeeTeamRepository{db: db}
}

const employeeTeamCols = `id, company, qbt_user_id, employee_name, qbt_team_id, qbt_team_name, override_team_name, overridden_by, overridden_at, last_synced_at`

func scanEmployeeTeam(row pgx.Row) (*domain.QBTimeEmployeeTeam, error) {
	t := &domain.QBTimeEmployeeTeam{}
	if err := row.Scan(
		&t.ID, &t.Company, &t.QBTUserID, &t.EmployeeName,
		&t.QBTeamID, &t.QBTeamName,
		&t.OverrideTeamName, &t.OverriddenBy, &t.OverriddenAt,
		&t.LastSyncedAt,
	); err != nil {
		return nil, err
	}
	switch {
	case t.OverrideTeamName != nil && *t.OverrideTeamName != "":
		t.EffectiveTeamName = *t.OverrideTeamName
		t.IsOverridden = true
	case t.QBTeamName != nil && *t.QBTeamName != "":
		t.EffectiveTeamName = *t.QBTeamName
	default:
		t.EffectiveTeamName = "Unassigned"
	}
	return t, nil
}

func (r *PostgresQBTimeEmployeeTeamRepository) List(ctx context.Context, company string) ([]*domain.QBTimeEmployeeTeam, error) {
	rows, err := r.db.Query(ctx, `
		SELECT `+employeeTeamCols+`
		FROM qbtime_employee_teams
		WHERE LOWER(company) = $1
		ORDER BY employee_name ASC
	`, company)
	if err != nil {
		return nil, fmt.Errorf("list qbtime employee teams: %w", err)
	}
	defer rows.Close()

	var out []*domain.QBTimeEmployeeTeam
	for rows.Next() {
		t, err := scanEmployeeTeam(rows)
		if err != nil {
			return nil, fmt.Errorf("scan qbtime employee team: %w", err)
		}
		out = append(out, t)
	}
	return out, nil
}

// UpsertFromSync replaces the QB-side snapshot (employee_name, qbt_team_id,
// qbt_team_name, last_synced_at) for every row while leaving any manual
// override untouched — a sync must never silently clear a divergence flag.
func (r *PostgresQBTimeEmployeeTeamRepository) UpsertFromSync(ctx context.Context, company string, rows []QBTimeEmployeeTeamSyncRow) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	for _, row := range rows {
		_, err := tx.Exec(ctx, `
			INSERT INTO qbtime_employee_teams (company, qbt_user_id, employee_name, qbt_team_id, qbt_team_name, last_synced_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (company, qbt_user_id) DO UPDATE
			SET employee_name  = EXCLUDED.employee_name,
			    qbt_team_id    = EXCLUDED.qbt_team_id,
			    qbt_team_name  = EXCLUDED.qbt_team_name,
			    last_synced_at = EXCLUDED.last_synced_at
		`, company, row.QBTUserID, row.EmployeeName, row.QBTeamID, row.QBTeamName, now)
		if err != nil {
			return fmt.Errorf("upsert qbtime employee team (user_id=%d): %w", row.QBTUserID, err)
		}
	}
	return tx.Commit(ctx)
}

func (r *PostgresQBTimeEmployeeTeamRepository) SetOverride(ctx context.Context, id, overrideTeamName, overriddenBy string) (*domain.QBTimeEmployeeTeam, error) {
	row := r.db.QueryRow(ctx, `
		UPDATE qbtime_employee_teams
		SET override_team_name = $2, overridden_by = $3, overridden_at = NOW()
		WHERE id = $1
		RETURNING `+employeeTeamCols+`
	`, id, overrideTeamName, overriddenBy)
	t, err := scanEmployeeTeam(row)
	if err != nil {
		return nil, fmt.Errorf("set override: %w", err)
	}
	return t, nil
}

func (r *PostgresQBTimeEmployeeTeamRepository) ClearOverride(ctx context.Context, id string) (*domain.QBTimeEmployeeTeam, error) {
	row := r.db.QueryRow(ctx, `
		UPDATE qbtime_employee_teams
		SET override_team_name = NULL, overridden_by = NULL, overridden_at = NULL
		WHERE id = $1
		RETURNING `+employeeTeamCols+`
	`, id)
	t, err := scanEmployeeTeam(row)
	if err != nil {
		return nil, fmt.Errorf("clear override: %w", err)
	}
	return t, nil
}
