package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type PayableService struct {
	repo repository.PayableRepository
}

func NewPayableService(repo repository.PayableRepository) *PayableService {
	return &PayableService{repo: repo}
}

func (s *PayableService) List(ctx context.Context, filters domain.PayableFilters) ([]*domain.PayableAccounting, error) {
	return s.repo.List(ctx, filters)
}

func (s *PayableService) FindByID(ctx context.Context, id string) (*domain.PayableAccounting, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *PayableService) Create(ctx context.Context, r *domain.PayableAccounting) (*domain.PayableAccounting, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *PayableService) Update(ctx context.Context, id string, r *domain.PayableAccounting) (*domain.PayableAccounting, error) {
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

func (s *PayableService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
