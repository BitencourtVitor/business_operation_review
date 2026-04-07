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
	p.ID = id // enforce URL param wins over any body-provided id
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

func (s *ForecastService) ToggleFieldwire(ctx context.Context, fwID int64, status bool) error {
	return s.repo.UpdateFieldwireStatus(ctx, fwID, status)
}

func (s *ForecastService) ToggleMachine(ctx context.Context, machID int64, status string) error {
	return s.repo.UpdateMachineStatus(ctx, machID, status)
}

func (s *ForecastService) UpdateMachineUnit(ctx context.Context, machID int64, unit string) error {
	return s.repo.UpdateMachineUnit(ctx, machID, unit)
}

func (s *ForecastService) ToggleContractStep(ctx context.Context, stepID int64, status bool) error {
	return s.repo.UpdateContractStepStatus(ctx, stepID, status)
}

func (s *ForecastService) CreateContractStep(ctx context.Context, projectID string, team string, step string) (int64, error) {
	return s.repo.CreateContractStep(ctx, projectID, team, step)
}

func (s *ForecastService) DeleteContractTeam(ctx context.Context, projectID string, team string) error {
	return s.repo.DeleteContractTeam(ctx, projectID, team)
}

func (s *ForecastService) AddContractTeam(ctx context.Context, projectID string, team string) error {
	return s.repo.AddContractTeam(ctx, projectID, team)
}
