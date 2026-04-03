package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TimesheetRowRepository interface {
	List(ctx context.Context, filters domain.TimesheetRowFilters) ([]*domain.TimesheetRow, error)
	FindByID(ctx context.Context, id string) (*domain.TimesheetRow, error)
	Create(ctx context.Context, r *domain.TimesheetRow) error
	Update(ctx context.Context, r *domain.TimesheetRow) error
	Delete(ctx context.Context, id string) error
}

type PostgresTimesheetRowRepository struct {
	db *pgxpool.Pool
}

func NewPostgresTimesheetRowRepository(db *pgxpool.Pool) *PostgresTimesheetRowRepository {
	return &PostgresTimesheetRowRepository{db: db}
}

func (r *PostgresTimesheetRowRepository) List(ctx context.Context, f domain.TimesheetRowFilters) ([]*domain.TimesheetRow, error) {
	query := `
		SELECT id, date, nome, error, team, corporation,
		       payrate, add_time_hour, remove_time_hour,
		       add_dollar, remove_dollar, total,
		       jobsite, lot_building, worktype, regular_hours, created_at
		FROM timesheet_analysis
		WHERE ($1 = '' OR team ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR corporation ILIKE '%' || $2 || '%')
		  AND ($3 = '' OR nome ILIKE '%' || $3 || '%')
		ORDER BY date DESC
	`
	rows, err := r.db.Query(ctx, query, f.Team, f.Corporation, f.Nome)
	if err != nil {
		return nil, fmt.Errorf("list timesheet_analysis: %w", err)
	}
	defer rows.Close()

	var records []*domain.TimesheetRow
	for rows.Next() {
		rec := &domain.TimesheetRow{}
		if err := rows.Scan(
			&rec.ID, &rec.Date, &rec.Nome, &rec.Error, &rec.Team, &rec.Corporation,
			&rec.Payrate, &rec.AddTimeHour, &rec.RemoveTimeHour,
			&rec.AddDollar, &rec.RemoveDollar, &rec.Total,
			&rec.Jobsite, &rec.LotBuilding, &rec.Worktype, &rec.RegularHours, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan timesheet_analysis: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresTimesheetRowRepository) FindByID(ctx context.Context, id string) (*domain.TimesheetRow, error) {
	rec := &domain.TimesheetRow{}
	err := r.db.QueryRow(ctx, `
		SELECT id, date, nome, error, team, corporation,
		       payrate, add_time_hour, remove_time_hour,
		       add_dollar, remove_dollar, total,
		       jobsite, lot_building, worktype, regular_hours, created_at
		FROM timesheet_analysis WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.Date, &rec.Nome, &rec.Error, &rec.Team, &rec.Corporation,
		&rec.Payrate, &rec.AddTimeHour, &rec.RemoveTimeHour,
		&rec.AddDollar, &rec.RemoveDollar, &rec.Total,
		&rec.Jobsite, &rec.LotBuilding, &rec.Worktype, &rec.RegularHours, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find timesheet_analysis: %w", err)
	}
	return rec, nil
}

func (r *PostgresTimesheetRowRepository) Create(ctx context.Context, rec *domain.TimesheetRow) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO timesheet_analysis
		  (id, date, nome, error, team, corporation,
		   payrate, add_time_hour, remove_time_hour,
		   add_dollar, remove_dollar, total,
		   jobsite, lot_building, worktype, regular_hours, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
	`, rec.ID, rec.Date, rec.Nome, rec.Error, rec.Team, rec.Corporation,
		rec.Payrate, rec.AddTimeHour, rec.RemoveTimeHour,
		rec.AddDollar, rec.RemoveDollar, rec.Total,
		rec.Jobsite, rec.LotBuilding, rec.Worktype, rec.RegularHours, rec.CreatedAt)
	return err
}

func (r *PostgresTimesheetRowRepository) Update(ctx context.Context, rec *domain.TimesheetRow) error {
	_, err := r.db.Exec(ctx, `
		UPDATE timesheet_analysis
		SET date=$1, nome=$2, error=$3, team=$4, corporation=$5,
		    payrate=$6, add_time_hour=$7, remove_time_hour=$8,
		    add_dollar=$9, remove_dollar=$10, total=$11,
		    jobsite=$12, lot_building=$13, worktype=$14, regular_hours=$15
		WHERE id=$16
	`, rec.Date, rec.Nome, rec.Error, rec.Team, rec.Corporation,
		rec.Payrate, rec.AddTimeHour, rec.RemoveTimeHour,
		rec.AddDollar, rec.RemoveDollar, rec.Total,
		rec.Jobsite, rec.LotBuilding, rec.Worktype, rec.RegularHours, rec.ID)
	return err
}

func (r *PostgresTimesheetRowRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM timesheet_analysis WHERE id=$1", id)
	return err
}
