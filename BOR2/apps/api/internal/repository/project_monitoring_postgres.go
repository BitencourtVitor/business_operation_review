package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProjectMonitoringHvacRepository interface {
	List(ctx context.Context, filters domain.ProjectMonitoringHvacFilters) ([]*domain.ProjectMonitoringHvac, error)
	FindByID(ctx context.Context, id string) (*domain.ProjectMonitoringHvac, error)
	Create(ctx context.Context, r *domain.ProjectMonitoringHvac) error
	Update(ctx context.Context, r *domain.ProjectMonitoringHvac) error
	Delete(ctx context.Context, id string) error
}

type PostgresProjectMonitoringHvacRepository struct {
	db *pgxpool.Pool
}

func NewPostgresProjectMonitoringHvacRepository(db *pgxpool.Pool) *PostgresProjectMonitoringHvacRepository {
	return &PostgresProjectMonitoringHvacRepository{db: db}
}

func (r *PostgresProjectMonitoringHvacRepository) List(ctx context.Context, f domain.ProjectMonitoringHvacFilters) ([]*domain.ProjectMonitoringHvac, error) {
	query := `
		SELECT id, city, job_site, lot_number, team,
		       start_date, finish_date,
		       s1_rough, s1_date, s2_machines, s2_date,
		       s3_condenser, s3_date, s4_finish, s4_date,
		       percent_completed, last_update, notes, created_at
		FROM project_monitoring_hvac
		WHERE ($1 = '' OR city ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR job_site ILIKE '%' || $2 || '%')
		  AND ($3 = '' OR team ILIKE '%' || $3 || '%')
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, f.City, f.JobSite, f.Team)
	if err != nil {
		return nil, fmt.Errorf("list project_monitoring_hvac: %w", err)
	}
	defer rows.Close()

	var records []*domain.ProjectMonitoringHvac
	for rows.Next() {
		rec := &domain.ProjectMonitoringHvac{}
		if err := rows.Scan(
			&rec.ID, &rec.City, &rec.JobSite, &rec.LotNumber, &rec.Team,
			&rec.StartDate, &rec.FinishDate,
			&rec.S1Rough, &rec.S1Date, &rec.S2Machines, &rec.S2Date,
			&rec.S3Condenser, &rec.S3Date, &rec.S4Finish, &rec.S4Date,
			&rec.PercentCompleted, &rec.LastUpdate, &rec.Notes, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan project_monitoring_hvac: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresProjectMonitoringHvacRepository) FindByID(ctx context.Context, id string) (*domain.ProjectMonitoringHvac, error) {
	rec := &domain.ProjectMonitoringHvac{}
	err := r.db.QueryRow(ctx, `
		SELECT id, city, job_site, lot_number, team,
		       start_date, finish_date,
		       s1_rough, s1_date, s2_machines, s2_date,
		       s3_condenser, s3_date, s4_finish, s4_date,
		       percent_completed, last_update, notes, created_at
		FROM project_monitoring_hvac WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.City, &rec.JobSite, &rec.LotNumber, &rec.Team,
		&rec.StartDate, &rec.FinishDate,
		&rec.S1Rough, &rec.S1Date, &rec.S2Machines, &rec.S2Date,
		&rec.S3Condenser, &rec.S3Date, &rec.S4Finish, &rec.S4Date,
		&rec.PercentCompleted, &rec.LastUpdate, &rec.Notes, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find project_monitoring_hvac: %w", err)
	}
	return rec, nil
}

func (r *PostgresProjectMonitoringHvacRepository) Create(ctx context.Context, rec *domain.ProjectMonitoringHvac) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO project_monitoring_hvac
		  (id, city, job_site, lot_number, team,
		   start_date, finish_date,
		   s1_rough, s1_date, s2_machines, s2_date,
		   s3_condenser, s3_date, s4_finish, s4_date,
		   percent_completed, last_update, notes, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	`, rec.ID, rec.City, rec.JobSite, rec.LotNumber, rec.Team,
		rec.StartDate, rec.FinishDate,
		rec.S1Rough, rec.S1Date, rec.S2Machines, rec.S2Date,
		rec.S3Condenser, rec.S3Date, rec.S4Finish, rec.S4Date,
		rec.PercentCompleted, rec.LastUpdate, rec.Notes, rec.CreatedAt)
	return err
}

func (r *PostgresProjectMonitoringHvacRepository) Update(ctx context.Context, rec *domain.ProjectMonitoringHvac) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_monitoring_hvac
		SET city=$1, job_site=$2, lot_number=$3, team=$4,
		    start_date=$5, finish_date=$6,
		    s1_rough=$7, s1_date=$8, s2_machines=$9, s2_date=$10,
		    s3_condenser=$11, s3_date=$12, s4_finish=$13, s4_date=$14,
		    percent_completed=$15, last_update=$16, notes=$17
		WHERE id=$18
	`, rec.City, rec.JobSite, rec.LotNumber, rec.Team,
		rec.StartDate, rec.FinishDate,
		rec.S1Rough, rec.S1Date, rec.S2Machines, rec.S2Date,
		rec.S3Condenser, rec.S3Date, rec.S4Finish, rec.S4Date,
		rec.PercentCompleted, rec.LastUpdate, rec.Notes, rec.ID)
	return err
}

func (r *PostgresProjectMonitoringHvacRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM project_monitoring_hvac WHERE id=$1", id)
	return err
}
