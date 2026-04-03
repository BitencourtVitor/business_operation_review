package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type TakeoffWorkService struct {
	repo repository.TakeoffWorkRepository
}

func NewTakeoffWorkService(repo repository.TakeoffWorkRepository) *TakeoffWorkService {
	return &TakeoffWorkService{repo: repo}
}

func (s *TakeoffWorkService) List(ctx context.Context, filters domain.TakeoffWorkFilters) ([]*domain.TakeoffWork, error) {
	return s.repo.List(ctx, filters)
}

func (s *TakeoffWorkService) FindByID(ctx context.Context, id string) (*domain.TakeoffWork, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *TakeoffWorkService) Create(ctx context.Context, r *domain.TakeoffWork) (*domain.TakeoffWork, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *TakeoffWorkService) Update(ctx context.Context, id string, r *domain.TakeoffWork) (*domain.TakeoffWork, error) {
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

func (s *TakeoffWorkService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
