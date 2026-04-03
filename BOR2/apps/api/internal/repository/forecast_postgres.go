package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ForecastRepository interface {
	List(ctx context.Context, filters domain.ForecastFilters) ([]*domain.ForecastProject, error)
	FindByID(ctx context.Context, id string) (*domain.ForecastProject, error)
	Create(ctx context.Context, p *domain.ForecastProject) error
	Update(ctx context.Context, p *domain.ForecastProject) error
	Delete(ctx context.Context, id string) error
}

type PostgresForecastRepository struct {
	db *pgxpool.Pool
}

func NewPostgresForecastRepository(db *pgxpool.Pool) *PostgresForecastRepository {
	return &PostgresForecastRepository{db: db}
}

func (r *PostgresForecastRepository) List(ctx context.Context, f domain.ForecastFilters) ([]*domain.ForecastProject, error) {
	query := `
		SELECT id, company, name, status, start_date, end_date,
		       contract_value, team, qb_time, created_at, updated_at
		FROM forecast_projects
		WHERE ($1 = '' OR company::text = $1)
		  AND ($2 = '' OR status::text = $2)
		  AND ($3 = 0 OR EXTRACT(YEAR FROM start_date) = $3)
		ORDER BY start_date DESC
	`
	rows, err := r.db.Query(ctx, query, f.Company, string(f.Status), f.Year)
	if err != nil {
		return nil, fmt.Errorf("list forecast: %w", err)
	}
	defer rows.Close()

	var projects []*domain.ForecastProject
	for rows.Next() {
		p := &domain.ForecastProject{}
		if err := rows.Scan(
			&p.ID, &p.Company, &p.Name, &p.Status,
			&p.StartDate, &p.EndDate, &p.ContractValue,
			&p.Team, &p.QBTime, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan forecast: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func (r *PostgresForecastRepository) FindByID(ctx context.Context, id string) (*domain.ForecastProject, error) {
	query := `
		SELECT id, company, name, status, start_date, end_date,
		       contract_value, team, qb_time, created_at, updated_at
		FROM forecast_projects WHERE id = $1
	`
	p := &domain.ForecastProject{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.Company, &p.Name, &p.Status,
		&p.StartDate, &p.EndDate, &p.ContractValue,
		&p.Team, &p.QBTime, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("find forecast: %w", err)
	}
	return p, nil
}

func (r *PostgresForecastRepository) Create(ctx context.Context, p *domain.ForecastProject) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO forecast_projects
		  (id, company, name, status, start_date, end_date, contract_value, team, qb_time, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, p.ID, p.Company, p.Name, p.Status, p.StartDate, p.EndDate,
		p.ContractValue, p.Team, p.QBTime, p.CreatedAt, p.UpdatedAt)
	return err
}

func (r *PostgresForecastRepository) Update(ctx context.Context, p *domain.ForecastProject) error {
	_, err := r.db.Exec(ctx, `
		UPDATE forecast_projects
		SET name=$1, status=$2, start_date=$3, end_date=$4,
		    contract_value=$5, team=$6, qb_time=$7, updated_at=$8
		WHERE id=$9
	`, p.Name, p.Status, p.StartDate, p.EndDate,
		p.ContractValue, p.Team, p.QBTime, p.UpdatedAt, p.ID)
	return err
}

func (r *PostgresForecastRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM forecast_projects WHERE id=$1", id)
	return err
}
