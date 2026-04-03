package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type TimesheetRowService struct {
	repo repository.TimesheetRowRepository
}

func NewTimesheetRowService(repo repository.TimesheetRowRepository) *TimesheetRowService {
	return &TimesheetRowService{repo: repo}
}

func (s *TimesheetRowService) List(ctx context.Context, filters domain.TimesheetRowFilters) ([]*domain.TimesheetRow, error) {
	return s.repo.List(ctx, filters)
}

func (s *TimesheetRowService) FindByID(ctx context.Context, id string) (*domain.TimesheetRow, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *TimesheetRowService) Create(ctx context.Context, r *domain.TimesheetRow) (*domain.TimesheetRow, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *TimesheetRowService) Update(ctx context.Context, id string, r *domain.TimesheetRow) (*domain.TimesheetRow, error) {
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

func (s *TimesheetRowService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
