package service

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type WexCategorizationService struct {
	repo repository.WexCategorizationRepository
}

func NewWexCategorizationService(repo repository.WexCategorizationRepository) *WexCategorizationService {
	return &WexCategorizationService{repo: repo}
}

// ─── Normalization ────────────────────────────────────────────────────────────

func (s *WexCategorizationService) ListNorm(ctx context.Context, company string) ([]*domain.WexNormEntry, error) {
	return s.repo.ListNorm(ctx, company)
}

func (s *WexCategorizationService) UpsertNorm(ctx context.Context, in *domain.WexNormInput) (*domain.WexNormEntry, error) {
	return s.repo.UpsertNorm(ctx, in)
}

func (s *WexCategorizationService) UpdateNorm(ctx context.Context, id int64, in *domain.WexNormInput) (*domain.WexNormEntry, error) {
	return s.repo.UpdateNorm(ctx, id, in)
}

func (s *WexCategorizationService) DeleteNorm(ctx context.Context, id int64) error {
	return s.repo.DeleteNorm(ctx, id)
}

// ─── Reports ──────────────────────────────────────────────────────────────────

func (s *WexCategorizationService) ListReports(ctx context.Context, company string) ([]*domain.WexReport, error) {
	return s.repo.ListReports(ctx, company)
}

func (s *WexCategorizationService) GetReport(ctx context.Context, id string) (*domain.WexReport, error) {
	return s.repo.GetReport(ctx, id)
}

func (s *WexCategorizationService) CreateReport(ctx context.Context, in *domain.WexReportInput) (*domain.WexReport, error) {
	return s.repo.CreateReport(ctx, in)
}

func (s *WexCategorizationService) DeleteReport(ctx context.Context, id string) error {
	return s.repo.DeleteReport(ctx, id)
}
