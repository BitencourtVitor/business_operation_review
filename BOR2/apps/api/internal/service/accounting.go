package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type AccountingService struct {
	repo repository.AccountingRepository
}

func NewAccountingService(repo repository.AccountingRepository) *AccountingService {
	return &AccountingService{repo: repo}
}

func (s *AccountingService) List(ctx context.Context, filters domain.AccountingFilters) ([]*domain.AccountingRecord, error) {
	return s.repo.List(ctx, filters)
}

func (s *AccountingService) FindByID(ctx context.Context, id string) (*domain.AccountingRecord, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *AccountingService) Create(ctx context.Context, r *domain.AccountingRecord) (*domain.AccountingRecord, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	r.UpdatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *AccountingService) Update(ctx context.Context, id string, r *domain.AccountingRecord) (*domain.AccountingRecord, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	r.ID = existing.ID
	r.Company = existing.Company
	r.Type = existing.Type
	r.CreatedAt = existing.CreatedAt
	r.UpdatedAt = time.Now()
	if err := s.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *AccountingService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}

func (s *AccountingService) Summary(ctx context.Context, filters domain.AccountingFilters) (*domain.AccountingSummary, error) {
	return s.repo.Summary(ctx, filters)
}
