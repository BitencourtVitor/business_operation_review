package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type SubcontractorService struct {
	repo repository.SubcontractorRepository
}

func NewSubcontractorService(repo repository.SubcontractorRepository) *SubcontractorService {
	return &SubcontractorService{repo: repo}
}

func (s *SubcontractorService) List(ctx context.Context, filters domain.SubcontractorFilters) ([]*domain.SubcontractorPerformance, error) {
	return s.repo.List(ctx, filters)
}

func (s *SubcontractorService) FindByID(ctx context.Context, id string) (*domain.SubcontractorPerformance, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *SubcontractorService) Create(ctx context.Context, sub *domain.SubcontractorPerformance) (*domain.SubcontractorPerformance, error) {
	sub.ID = uuid.NewString()
	sub.CreatedAt = time.Now()
	sub.UpdatedAt = time.Now()
	if err := s.repo.Create(ctx, sub); err != nil {
		return nil, err
	}
	return sub, nil
}

func (s *SubcontractorService) UpdateStatus(ctx context.Context, id string, status domain.SubcontractorStatus) (*domain.SubcontractorPerformance, error) {
	sub, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	now := time.Now()
	sub.Status = status
	sub.LastEventAt = &now
	sub.UpdatedAt = now
	if err := s.repo.Update(ctx, sub); err != nil {
		return nil, err
	}
	return sub, nil
}
