package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type ProjectMonitoringHvacService struct {
	repo repository.ProjectMonitoringHvacRepository
}

func NewProjectMonitoringHvacService(repo repository.ProjectMonitoringHvacRepository) *ProjectMonitoringHvacService {
	return &ProjectMonitoringHvacService{repo: repo}
}

func (s *ProjectMonitoringHvacService) List(ctx context.Context, filters domain.ProjectMonitoringHvacFilters) ([]*domain.ProjectMonitoringHvac, error) {
	return s.repo.List(ctx, filters)
}

func (s *ProjectMonitoringHvacService) FindByID(ctx context.Context, id string) (*domain.ProjectMonitoringHvac, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *ProjectMonitoringHvacService) Create(ctx context.Context, r *domain.ProjectMonitoringHvac) (*domain.ProjectMonitoringHvac, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *ProjectMonitoringHvacService) Update(ctx context.Context, id string, r *domain.ProjectMonitoringHvac) (*domain.ProjectMonitoringHvac, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	r.ID = existing.ID
	r.CreatedAt = existing.CreatedAt
	if err := s.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *ProjectMonitoringHvacService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
