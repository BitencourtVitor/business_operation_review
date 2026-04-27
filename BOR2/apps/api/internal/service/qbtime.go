package service

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type QBTimeDailyReportService struct {
	repo repository.QBTimeDailyReportRepository
}

func NewQBTimeDailyReportService(repo repository.QBTimeDailyReportRepository) *QBTimeDailyReportService {
	return &QBTimeDailyReportService{repo: repo}
}

func (s *QBTimeDailyReportService) List(ctx context.Context, f domain.QBTimeDailyReportFilters) ([]*domain.QBTimeDailyReport, error) {
	return s.repo.List(ctx, f)
}

func (s *QBTimeDailyReportService) Get(ctx context.Context, id string) (*domain.QBTimeDailyReport, error) {
	return s.repo.Get(ctx, id)
}

func (s *QBTimeDailyReportService) Upsert(ctx context.Context, r *domain.QBTimeDailyReport) (*domain.QBTimeDailyReport, error) {
	return s.repo.Upsert(ctx, r)
}

func (s *QBTimeDailyReportService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
