package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type EmployeeNameService struct {
	repo repository.EmployeeNameRepository
}

func NewEmployeeNameService(repo repository.EmployeeNameRepository) *EmployeeNameService {
	return &EmployeeNameService{repo: repo}
}

func (s *EmployeeNameService) List(ctx context.Context, filters domain.EmployeeNameFilters) ([]*domain.EmployeeName, error) {
	return s.repo.List(ctx, filters)
}

func (s *EmployeeNameService) FindByID(ctx context.Context, id string) (*domain.EmployeeName, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *EmployeeNameService) Create(ctx context.Context, r *domain.EmployeeName) (*domain.EmployeeName, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *EmployeeNameService) Update(ctx context.Context, id string, r *domain.EmployeeName) (*domain.EmployeeName, error) {
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

func (s *EmployeeNameService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
