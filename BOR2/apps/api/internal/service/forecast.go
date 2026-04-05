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
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	// Merge seletivo: se um campo está vazio, mantém o valor existente
	if p.Type == "" {
		p.Type = existing.Type
	}
	if p.LoteBld == "" {
		p.LoteBld = existing.LoteBld
	}
	if p.Cliente == "" {
		p.Cliente = existing.Cliente
	}
	if p.JobSite == "" {
		p.JobSite = existing.JobSite
	}
	if p.Address == "" {
		p.Address = existing.Address
	}
	if p.Obs == "" {
		p.Obs = existing.Obs
	}
	if p.Team == "" {
		p.Team = existing.Team
	}
	if p.MachineProvider == "" {
		p.MachineProvider = existing.MachineProvider
	}
	if p.Name == "" {
		p.Name = existing.Name
	}

	p.ID = existing.ID
	p.Company = existing.Company
	p.CreatedAt = existing.CreatedAt
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
