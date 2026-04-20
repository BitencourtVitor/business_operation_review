package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ServiceRequestRepository interface {
	List(ctx context.Context, filters domain.ServiceRequestFilters) ([]*domain.ServiceRequestRow, error)
	FindByID(ctx context.Context, id string) (*domain.ServiceRequestRow, error)
	Create(ctx context.Context, r *domain.ServiceRequestRow) error
	Update(ctx context.Context, r *domain.ServiceRequestRow) error
	Delete(ctx context.Context, id string) error
	ReplaceAll(ctx context.Context, records []*domain.ServiceRequestRow) (int, error)
}

type PostgresServiceRequestRepository struct {
	db *pgxpool.Pool
}

func NewPostgresServiceRequestRepository(db *pgxpool.Pool) *PostgresServiceRequestRepository {
	return &PostgresServiceRequestRepository{db: db}
}

func (r *PostgresServiceRequestRepository) List(ctx context.Context, f domain.ServiceRequestFilters) ([]*domain.ServiceRequestRow, error) {
	query := `
		SELECT id, contractor, job_site, city, lot, address,
		       close_date, date_received, material_available_date,
		       resident_available_date, date_completed, additional_visits,
		       issue, warranty, tech, created_at
		FROM service_requests
		WHERE ($1 = '' OR contractor ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR job_site ILIKE '%' || $2 || '%')
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, f.Contractor, f.JobSite)
	if err != nil {
		return nil, fmt.Errorf("list service_requests: %w", err)
	}
	defer rows.Close()

	var records []*domain.ServiceRequestRow
	for rows.Next() {
		rec := &domain.ServiceRequestRow{}
		if err := rows.Scan(
			&rec.ID, &rec.Contractor, &rec.JobSite, &rec.City, &rec.Lot, &rec.Address,
			&rec.CloseDate, &rec.DateReceived, &rec.MaterialAvailableDate,
			&rec.ResidentAvailableDate, &rec.DateCompleted, &rec.AdditionalVisits,
			&rec.Issue, &rec.Warranty, &rec.Tech, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan service_requests: %w", err)
		}
		records = append(records, rec)
	}
	return records, nil
}

func (r *PostgresServiceRequestRepository) FindByID(ctx context.Context, id string) (*domain.ServiceRequestRow, error) {
	rec := &domain.ServiceRequestRow{}
	err := r.db.QueryRow(ctx, `
		SELECT id, contractor, job_site, city, lot, address,
		       close_date, date_received, material_available_date,
		       resident_available_date, date_completed, additional_visits,
		       issue, warranty, tech, created_at
		FROM service_requests WHERE id=$1
	`, id).Scan(
		&rec.ID, &rec.Contractor, &rec.JobSite, &rec.City, &rec.Lot, &rec.Address,
		&rec.CloseDate, &rec.DateReceived, &rec.MaterialAvailableDate,
		&rec.ResidentAvailableDate, &rec.DateCompleted, &rec.AdditionalVisits,
		&rec.Issue, &rec.Warranty, &rec.Tech, &rec.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find service_requests: %w", err)
	}
	return rec, nil
}

func (r *PostgresServiceRequestRepository) Create(ctx context.Context, rec *domain.ServiceRequestRow) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO service_requests
		  (id, contractor, job_site, city, lot, address,
		   close_date, date_received, material_available_date,
		   resident_available_date, date_completed, additional_visits,
		   issue, warranty, tech, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
	`, rec.ID, rec.Contractor, rec.JobSite, rec.City, rec.Lot, rec.Address,
		rec.CloseDate, rec.DateReceived, rec.MaterialAvailableDate,
		rec.ResidentAvailableDate, rec.DateCompleted, rec.AdditionalVisits,
		rec.Issue, rec.Warranty, rec.Tech, rec.CreatedAt)
	return err
}

func (r *PostgresServiceRequestRepository) Update(ctx context.Context, rec *domain.ServiceRequestRow) error {
	_, err := r.db.Exec(ctx, `
		UPDATE service_requests
		SET contractor=$1, job_site=$2, city=$3, lot=$4, address=$5,
		    close_date=$6, date_received=$7, material_available_date=$8,
		    resident_available_date=$9, date_completed=$10, additional_visits=$11,
		    issue=$12, warranty=$13, tech=$14
		WHERE id=$15
	`, rec.Contractor, rec.JobSite, rec.City, rec.Lot, rec.Address,
		rec.CloseDate, rec.DateReceived, rec.MaterialAvailableDate,
		rec.ResidentAvailableDate, rec.DateCompleted, rec.AdditionalVisits,
		rec.Issue, rec.Warranty, rec.Tech, rec.ID)
	return err
}

func (r *PostgresServiceRequestRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM service_requests WHERE id=$1", id)
	return err
}

// ReplaceAll deletes every row in service_requests and inserts records atomically.
func (r *PostgresServiceRequestRepository) ReplaceAll(ctx context.Context, records []*domain.ServiceRequestRow) (int, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "DELETE FROM service_requests"); err != nil {
		return 0, fmt.Errorf("delete all service_requests: %w", err)
	}

	count := 0
	for _, rec := range records {
		_, err := tx.Exec(ctx, `
			INSERT INTO service_requests
			  (id, contractor, job_site, city, lot, address,
			   close_date, date_received, material_available_date,
			   resident_available_date, date_completed, additional_visits,
			   issue, warranty, tech, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		`, rec.ID, rec.Contractor, rec.JobSite, rec.City, rec.Lot, rec.Address,
			rec.CloseDate, rec.DateReceived, rec.MaterialAvailableDate,
			rec.ResidentAvailableDate, rec.DateCompleted, rec.AdditionalVisits,
			rec.Issue, rec.Warranty, rec.Tech, rec.CreatedAt)
		if err != nil {
			return count, fmt.Errorf("insert service_request row: %w", err)
		}
		count++
	}

	return count, tx.Commit(ctx)
}
