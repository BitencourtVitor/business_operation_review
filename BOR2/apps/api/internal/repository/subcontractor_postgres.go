package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SubcontractorRepository interface {
	List(ctx context.Context, filters domain.SubcontractorFilters) ([]*domain.SubcontractorPerformance, error)
	FindByID(ctx context.Context, id string) (*domain.SubcontractorPerformance, error)
	Create(ctx context.Context, s *domain.SubcontractorPerformance) error
	Update(ctx context.Context, s *domain.SubcontractorPerformance) error
}

type PostgresSubcontractorRepository struct{ db *pgxpool.Pool }

func NewPostgresSubcontractorRepository(db *pgxpool.Pool) *PostgresSubcontractorRepository {
	return &PostgresSubcontractorRepository{db: db}
}

func (r *PostgresSubcontractorRepository) List(ctx context.Context, f domain.SubcontractorFilters) ([]*domain.SubcontractorPerformance, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, company, subcontractor_name, status, performance_score,
		       completed_projects, active_projects, last_event_at, created_at, updated_at
		FROM subcontractor_performance
		WHERE ($1 = '' OR company::text = $1)
		  AND ($2 = '' OR status::text = $2)
		ORDER BY subcontractor_name ASC
	`, f.Company, string(f.Status))
	if err != nil {
		return nil, fmt.Errorf("list subcontractors: %w", err)
	}
	defer rows.Close()

	var list []*domain.SubcontractorPerformance
	for rows.Next() {
		s := &domain.SubcontractorPerformance{}
		if err := rows.Scan(&s.ID, &s.Company, &s.SubcontractorName, &s.Status,
			&s.PerformanceScore, &s.CompletedProjects, &s.ActiveProjects,
			&s.LastEventAt, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan subcontractor: %w", err)
		}
		list = append(list, s)
	}
	return list, nil
}

func (r *PostgresSubcontractorRepository) FindByID(ctx context.Context, id string) (*domain.SubcontractorPerformance, error) {
	s := &domain.SubcontractorPerformance{}
	err := r.db.QueryRow(ctx, `
		SELECT id, company, subcontractor_name, status, performance_score,
		       completed_projects, active_projects, last_event_at, created_at, updated_at
		FROM subcontractor_performance WHERE id=$1
	`, id).Scan(&s.ID, &s.Company, &s.SubcontractorName, &s.Status,
		&s.PerformanceScore, &s.CompletedProjects, &s.ActiveProjects,
		&s.LastEventAt, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("find subcontractor: %w", err)
	}
	return s, nil
}

func (r *PostgresSubcontractorRepository) Create(ctx context.Context, s *domain.SubcontractorPerformance) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO subcontractor_performance
		  (id, company, subcontractor_name, status, performance_score, completed_projects, active_projects, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, s.ID, s.Company, s.SubcontractorName, s.Status,
		s.PerformanceScore, s.CompletedProjects, s.ActiveProjects, s.CreatedAt, s.UpdatedAt)
	return err
}

func (r *PostgresSubcontractorRepository) Update(ctx context.Context, s *domain.SubcontractorPerformance) error {
	_, err := r.db.Exec(ctx, `
		UPDATE subcontractor_performance
		SET status=$1, performance_score=$2, completed_projects=$3,
		    active_projects=$4, last_event_at=$5, updated_at=$6
		WHERE id=$7
	`, s.Status, s.PerformanceScore, s.CompletedProjects,
		s.ActiveProjects, s.LastEventAt, s.UpdatedAt, s.ID)
	return err
}
