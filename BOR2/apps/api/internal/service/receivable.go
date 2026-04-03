package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type ReceivableService struct {
	repo repository.ReceivableRepository
}

func NewReceivableService(repo repository.ReceivableRepository) *ReceivableService {
	return &ReceivableService{repo: repo}
}

func (s *ReceivableService) List(ctx context.Context, filters domain.ReceivableFilters) ([]*domain.ReceivableAccounting, error) {
	return s.repo.List(ctx, filters)
}

func (s *ReceivableService) FindByID(ctx context.Context, id string) (*domain.ReceivableAccounting, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *ReceivableService) Create(ctx context.Context, r *domain.ReceivableAccounting) (*domain.ReceivableAccounting, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *ReceivableService) Update(ctx context.Context, id string, r *domain.ReceivableAccounting) (*domain.ReceivableAccounting, error) {
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

func (s *ReceivableService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
