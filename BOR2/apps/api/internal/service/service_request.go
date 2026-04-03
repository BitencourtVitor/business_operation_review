package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type ServiceRequestService struct {
	repo repository.ServiceRequestRepository
}

func NewServiceRequestService(repo repository.ServiceRequestRepository) *ServiceRequestService {
	return &ServiceRequestService{repo: repo}
}

func (s *ServiceRequestService) List(ctx context.Context, filters domain.ServiceRequestFilters) ([]*domain.ServiceRequestRow, error) {
	return s.repo.List(ctx, filters)
}

func (s *ServiceRequestService) FindByID(ctx context.Context, id string) (*domain.ServiceRequestRow, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *ServiceRequestService) Create(ctx context.Context, r *domain.ServiceRequestRow) (*domain.ServiceRequestRow, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *ServiceRequestService) Update(ctx context.Context, id string, r *domain.ServiceRequestRow) (*domain.ServiceRequestRow, error) {
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

func (s *ServiceRequestService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
