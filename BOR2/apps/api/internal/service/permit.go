package service

import (
	"context"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

// parseDateUS parses M/D/YYYY or MM/DD/YYYY dates (service requests sheet).
func parseDateUS(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{"01/02/2006", "1/2/2006", "1/02/2006", "01/2/2006"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

type PermitRowService struct {
	repo repository.PermitRowRepository
}

func NewPermitRowService(repo repository.PermitRowRepository) *PermitRowService {
	return &PermitRowService{repo: repo}
}

func (s *PermitRowService) List(ctx context.Context, filters domain.PermitRowFilters) ([]*domain.PermitRow, error) {
	return s.repo.List(ctx, filters)
}

func (s *PermitRowService) FindByID(ctx context.Context, id string) (*domain.PermitRow, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *PermitRowService) Create(ctx context.Context, r *domain.PermitRow) (*domain.PermitRow, error) {
	r.ID = uuid.NewString()
	r.CreatedAt = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *PermitRowService) Update(ctx context.Context, id string, r *domain.PermitRow) (*domain.PermitRow, error) {
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

func (s *PermitRowService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}

func (s *PermitRowService) LinkProject(ctx context.Context, projectID string, permitID *string) error {
	return s.repo.LinkProject(ctx, projectID, permitID)
}
