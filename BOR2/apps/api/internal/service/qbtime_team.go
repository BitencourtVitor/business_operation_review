package service

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type QBTimeTeamService struct {
	repo repository.QBTimeTeamRepository
}

func NewQBTimeTeamService(repo repository.QBTimeTeamRepository) *QBTimeTeamService {
	return &QBTimeTeamService{repo: repo}
}

func (s *QBTimeTeamService) List(ctx context.Context, company string) ([]*domain.QBTimeTeam, error) {
	return s.repo.List(ctx, company)
}

func (s *QBTimeTeamService) Create(ctx context.Context, t *domain.QBTimeTeam) (*domain.QBTimeTeam, error) {
	return s.repo.Create(ctx, t)
}

func (s *QBTimeTeamService) Update(ctx context.Context, id string, name string, members []string) (*domain.QBTimeTeam, error) {
	return s.repo.Update(ctx, id, name, members)
}

func (s *QBTimeTeamService) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
