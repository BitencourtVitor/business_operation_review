package service

import (
	"context"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

type WorkforceAttributionRuleService struct {
	repo repository.WorkforceAttributionRuleRepository
}

func NewWorkforceAttributionRuleService(repo repository.WorkforceAttributionRuleRepository) *WorkforceAttributionRuleService {
	return &WorkforceAttributionRuleService{repo: repo}
}

func (s *WorkforceAttributionRuleService) List(ctx context.Context) ([]*domain.WorkforceAttributionRule, error) {
	return s.repo.List(ctx)
}

func (s *WorkforceAttributionRuleService) FindByID(ctx context.Context, id string) (*domain.WorkforceAttributionRule, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *WorkforceAttributionRuleService) Create(ctx context.Context, r *domain.WorkforceAttributionRule, createdBy string) (*domain.WorkforceAttributionRule, error) {
	if err := validate(r); err != nil {
		return nil, err
	}
	now := time.Now()
	r.ID        = uuid.New().String()
	r.CreatedBy = createdBy
	r.CreatedAt = now
	r.UpdatedAt = now
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, fmt.Errorf("create attribution rule: %w", err)
	}
	return r, nil
}

func (s *WorkforceAttributionRuleService) Update(ctx context.Context, id string, r *domain.WorkforceAttributionRule) (*domain.WorkforceAttributionRule, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("attribution rule not found: %w", err)
	}
	existing.Name          = r.Name
	existing.Conditions    = r.Conditions
	existing.TargetCompany = r.TargetCompany
	if err := validate(existing); err != nil {
		return nil, err
	}
	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, fmt.Errorf("update attribution rule: %w", err)
	}
	return existing, nil
}

func (s *WorkforceAttributionRuleService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

func validate(r *domain.WorkforceAttributionRule) error {
	if r.Name == "" {
		return fmt.Errorf("name is required")
	}
	if r.TargetCompany == "" {
		return fmt.Errorf("targetCompany is required")
	}
	c := r.Conditions
	if c.Company == "" && c.Client == "" && c.Jobsite == "" && c.Worktype == "" {
		return fmt.Errorf("at least one condition is required")
	}
	return nil
}
