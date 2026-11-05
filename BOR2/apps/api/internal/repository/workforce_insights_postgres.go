package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WorkforceInsightsRepository interface {
	Settings(ctx context.Context) (*domain.InsightsSettings, error)
	SaveSettings(ctx context.Context, s *domain.InsightsSettings) error
	Hours(ctx context.Context, company, from, to string) ([]domain.HoursRow, error)
	ForecastBuildings(ctx context.Context, any bool) ([]domain.ForecastBuildingRef, error)
	QBTBuildings(ctx context.Context) ([]domain.QBTBuilding, error)
	Employees(ctx context.Context, company string) ([]string, error)
	Worktypes(ctx context.Context) ([]string, error)
	Rates(ctx context.Context, company string) (map[string][]domain.RatePoint, error)
	OvertimeNotes(ctx context.Context, company, employee string) ([]domain.OvertimeNote, error)
	SaveOvertimeNote(ctx context.Context, company string, n domain.OvertimeNote) error
}

type PostgresWorkforceInsightsRepository struct {
	db *pgxpool.Pool
}

func NewPostgresWorkforceInsightsRepository(db *pgxpool.Pool) *PostgresWorkforceInsightsRepository {
	return &PostgresWorkforceInsightsRepository{db: db}
}

func (r *PostgresWorkforceInsightsRepository) Settings(ctx context.Context) (*domain.InsightsSettings, error) {
	s := &domain.InsightsSettings{Supervisors: []string{}, Links: []domain.BuildingLink{}}
	if err := r.db.QueryRow(ctx, `
		SELECT building_budget::float8, ignored_worktypes, non_counting_worktypes,
		       COALESCE((SELECT array_agg(employee_name ORDER BY employee_name) FROM wp_supervisors), '{}')
		FROM wp_insights_settings WHERE id = 1
	`).Scan(&s.BuildingBudget, &s.IgnoredWorktypes, &s.NonCountingWorktypes, &s.Supervisors); err != nil {
		return nil, fmt.Errorf("wp settings: %w", err)
	}
	rows, err := r.db.Query(ctx, `SELECT forecast_id, qbt_jobsite, qbt_building, end_override::text FROM wp_building_links`)
	if err != nil {
		return nil, fmt.Errorf("wp links: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var l domain.BuildingLink
		if err := rows.Scan(&l.ForecastID, &l.Jobsite, &l.Building, &l.EndOverride); err != nil {
			return nil, fmt.Errorf("scan wp link: %w", err)
		}
		s.Links = append(s.Links, l)
	}
	return s, rows.Err()
}

// SaveSettings troca o settings inteiro e, como a lista de work types que não
// fecham as 40 h mexe na conta do overtime, atualiza a view em seguida.
func (r *PostgresWorkforceInsightsRepository) SaveSettings(ctx context.Context, s *domain.InsightsSettings) error {
	if err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			UPDATE wp_insights_settings SET building_budget = $1, ignored_worktypes = $2, non_counting_worktypes = $3 WHERE id = 1
		`, s.BuildingBudget, s.IgnoredWorktypes, s.NonCountingWorktypes); err != nil {
			return fmt.Errorf("update wp settings: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM wp_supervisors`); err != nil {
			return err
		}
		for _, name := range s.Supervisors {
			if _, err := tx.Exec(ctx, `INSERT INTO wp_supervisors (employee_name) VALUES ($1) ON CONFLICT DO NOTHING`, name); err != nil {
				return fmt.Errorf("insert supervisor: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM wp_building_links`); err != nil {
			return err
		}
		for _, l := range s.Links {
			if _, err := tx.Exec(ctx, `
				INSERT INTO wp_building_links (forecast_id, qbt_jobsite, qbt_building, end_override) VALUES ($1, $2, $3, $4::date)
			`, l.ForecastID, l.Jobsite, l.Building, l.EndOverride); err != nil {
				return fmt.Errorf("insert building link: %w", err)
			}
		}
		return nil
	}); err != nil {
		return err
	}
	_, err := r.db.Exec(ctx, `REFRESH MATERIALIZED VIEW mv_wp_hours`)
	return err
}

func (r *PostgresWorkforceInsightsRepository) Hours(ctx context.Context, company, from, to string) ([]domain.HoursRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT employee, work_date::text, client, jobsite, lot, building, worktype,
		       sum(regular)::float8, sum(overtime)::float8
		FROM mv_wp_hours
		WHERE company = $1 AND work_date BETWEEN $2 AND $3 AND counted
		GROUP BY 1, 2, 3, 4, 5, 6, 7
	`, company, from, to)
	if err != nil {
		return nil, fmt.Errorf("wp hours: %w", err)
	}
	defer rows.Close()
	out := []domain.HoursRow{}
	for rows.Next() {
		var h domain.HoursRow
		if err := rows.Scan(&h.Employee, &h.Date, &h.Client, &h.Jobsite, &h.Lot, &h.Building, &h.Worktype, &h.Regular, &h.Overtime); err != nil {
			return nil, fmt.Errorf("scan wp hours: %w", err)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ForecastBuildings lista os prédios da Framing no Forecast mais qualquer obra já vinculada
// a um prédio do QB Time (mesmo que não esteja marcada como Building). Com any, lista
// toda obra da Framing: são as opções do vínculo no settings.
func (r *PostgresWorkforceInsightsRepository) ForecastBuildings(ctx context.Context, any bool) ([]domain.ForecastBuildingRef, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, COALESCE(cliente, ''), COALESCE(job_site, ''), COALESCE(lote_bld, ''), COALESCE(status, ''),
		       COALESCE(type, ''), previous_start_date::text, previous_end_date::text
		FROM forecast_core
		WHERE company = 'framing'
		  AND ($1 OR type = 'Building' OR id::text IN (SELECT forecast_id::text FROM wp_building_links))
		ORDER BY job_site, lote_bld
	`, any)
	if err != nil {
		return nil, fmt.Errorf("forecast buildings: %w", err)
	}
	defer rows.Close()
	out := []domain.ForecastBuildingRef{}
	for rows.Next() {
		var b domain.ForecastBuildingRef
		if err := rows.Scan(&b.ID, &b.Cliente, &b.JobSite, &b.Lot, &b.Status, &b.Type, &b.Start, &b.End); err != nil {
			return nil, fmt.Errorf("scan forecast building: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// QBTBuildings lista toda obra do QB Time (prédio ou lote): qualquer uma pode ser o par de um prédio do Forecast.
func (r *PostgresWorkforceInsightsRepository) QBTBuildings(ctx context.Context) ([]domain.QBTBuilding, error) {
	rows, err := r.db.Query(ctx, `
		SELECT jobsite, coalesce(nullif(building, ''), lot), round(sum(hours)::numeric, 1)::float8
		FROM mv_wp_hours WHERE company = 'Framing' AND jobsite <> '' AND coalesce(nullif(building, ''), lot) <> ''
		GROUP BY 1, 2 ORDER BY 1, 2
	`)
	if err != nil {
		return nil, fmt.Errorf("qbt buildings: %w", err)
	}
	defer rows.Close()
	out := []domain.QBTBuilding{}
	for rows.Next() {
		var b domain.QBTBuilding
		if err := rows.Scan(&b.Jobsite, &b.Building, &b.Hours); err != nil {
			return nil, fmt.Errorf("scan qbt building: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *PostgresWorkforceInsightsRepository) Employees(ctx context.Context, company string) ([]string, error) {
	return r.strings(ctx, `SELECT DISTINCT employee FROM mv_wp_hours WHERE company = $1 ORDER BY 1`, company)
}

func (r *PostgresWorkforceInsightsRepository) Worktypes(ctx context.Context) ([]string, error) {
	return r.strings(ctx, `SELECT DISTINCT worktype FROM mv_wp_hours WHERE worktype <> '' ORDER BY 1`)
}

func (r *PostgresWorkforceInsightsRepository) strings(ctx context.Context, q string, args ...any) ([]string, error) {
	rows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Rates devolve o rate de cada funcionário por pay period, pela chave de
// pessoa (o payroll escreve "Corado, Juan Carlos"). Nunca sai para a tela.
func (r *PostgresWorkforceInsightsRepository) Rates(ctx context.Context, company string) (map[string][]domain.RatePoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT user_name, period_end::text, max(pay_rate)::float8
		FROM qbtime_payroll WHERE company = $1 AND pay_rate > 0
		GROUP BY 1, 2 ORDER BY 1, 2
	`, company)
	if err != nil {
		return nil, fmt.Errorf("wp rates: %w", err)
	}
	defer rows.Close()
	out := map[string][]domain.RatePoint{}
	for rows.Next() {
		var name string
		var p domain.RatePoint
		if err := rows.Scan(&name, &p.PeriodEnd, &p.Rate); err != nil {
			return nil, fmt.Errorf("scan wp rate: %w", err)
		}
		k := domain.PersonKey(name)
		out[k] = append(out[k], p)
	}
	return out, rows.Err()
}

func (r *PostgresWorkforceInsightsRepository) OvertimeNotes(ctx context.Context, company, employee string) ([]domain.OvertimeNote, error) {
	rows, err := r.db.Query(ctx, `
		SELECT employee, week_start::text, note, author, updated_at::text
		FROM wp_overtime_notes WHERE company = $1 AND employee = $2 ORDER BY week_start
	`, company, employee)
	if err != nil {
		return nil, fmt.Errorf("wp overtime notes: %w", err)
	}
	defer rows.Close()
	out := []domain.OvertimeNote{}
	for rows.Next() {
		var n domain.OvertimeNote
		if err := rows.Scan(&n.Employee, &n.WeekStart, &n.Note, &n.Author, &n.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan overtime note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// SaveOvertimeNote grava a anotação da semana; texto vazio apaga.
func (r *PostgresWorkforceInsightsRepository) SaveOvertimeNote(ctx context.Context, company string, n domain.OvertimeNote) error {
	if n.Note == "" {
		_, err := r.db.Exec(ctx, `DELETE FROM wp_overtime_notes WHERE company = $1 AND employee = $2 AND week_start = $3::date`, company, n.Employee, n.WeekStart)
		return err
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO wp_overtime_notes (company, employee, week_start, note, author) VALUES ($1, $2, $3::date, $4, $5)
		ON CONFLICT (company, employee, week_start) DO UPDATE SET note = EXCLUDED.note, author = EXCLUDED.author, updated_at = now()
	`, company, n.Employee, n.WeekStart, n.Note, n.Author)
	return err
}
