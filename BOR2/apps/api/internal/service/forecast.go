package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type ForecastService struct {
	repo repository.ForecastRepository
}

func NewForecastService(repo repository.ForecastRepository) *ForecastService {
	return &ForecastService{repo: repo}
}

func (s *ForecastService) List(ctx context.Context, filters domain.ForecastFilters) ([]*domain.ForecastProject, error) {
	return s.repo.List(ctx, filters)
}

func (s *ForecastService) FindByID(ctx context.Context, id string) (*domain.ForecastProject, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *ForecastService) Create(ctx context.Context, p *domain.ForecastProject) (*domain.ForecastProject, error) {
	p.ID = uuid.NewString()
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *ForecastService) Update(ctx context.Context, id string, p *domain.ForecastProject) (*domain.ForecastProject, error) {
	p.UpdatedAt = time.Now()
	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *ForecastService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
