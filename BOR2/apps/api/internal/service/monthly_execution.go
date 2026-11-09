package service

import (
	"context"
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type MonthlyExecutionService struct {
	repo repository.MonthlyExecutionRepository
}

func NewMonthlyExecutionService(repo repository.MonthlyExecutionRepository) *MonthlyExecutionService {
	return &MonthlyExecutionService{repo: repo}
}

// Groups devolve a configuração com a meta de cada mês do ano já resolvida.
func (s *MonthlyExecutionService) Groups(ctx context.Context, year int) ([]*domain.GoalGroup, error) {
	groups, err := s.repo.ListGroups(ctx)
	if err != nil {
		return nil, err
	}
	for _, g := range groups {
		g.Goals = make([]int, 12)
		for m := 1; m <= 12; m++ {
			g.Goals[m-1] = g.GoalFor(year, m)
		}
	}
	return groups, nil
}

func (s *MonthlyExecutionService) SaveGroups(ctx context.Context, groups []*domain.GoalGroup) error {
	seen := map[domain.GoalSite]bool{}
	for _, g := range groups {
		g.Name = strings.TrimSpace(g.Name)
		if g.Name == "" || len(g.Sites) == 0 {
			return domain.ErrBadRequest
		}
		for _, site := range g.Sites {
			if seen[site] { // um job site só cabe num grupo
				return domain.ErrBadRequest
			}
			seen[site] = true
		}
		for _, c := range g.Checkpoints {
			if c.Month < 1 || c.Month > 12 || c.Goal < 0 {
				return domain.ErrBadRequest
			}
		}
	}
	return s.repo.SaveGroups(ctx, groups)
}

func (s *MonthlyExecutionService) Finished(ctx context.Context, year int) ([]domain.FinishedProject, error) {
	return s.repo.ListFinished(ctx, year)
}

func (s *MonthlyExecutionService) Started(ctx context.Context, year int) ([]domain.StartedProject, error) {
	return s.repo.ListStarted(ctx, year)
}

func (s *MonthlyExecutionService) Points(ctx context.Context, year int) ([]*domain.ImprovementPoint, error) {
	return s.repo.ListPoints(ctx, year)
}

// CreatePoint grava o ponto assinado por quem está na sessão.
func (s *MonthlyExecutionService) CreatePoint(ctx context.Context, p *domain.ImprovementPoint) error {
	p.Body = strings.TrimSpace(p.Body)
	if p.Body == "" || p.Month < 1 || p.Month > 12 || p.Year < 2000 {
		return domain.ErrBadRequest
	}
	if p.GroupIDs == nil {
		p.GroupIDs = []string{}
	}
	p.Replies = []domain.PointReply{}
	return s.repo.CreatePoint(ctx, p)
}

func (s *MonthlyExecutionService) EditPoint(ctx context.Context, id, authorID, body string, groupIDs []string) error {
	body = strings.TrimSpace(body)
	if body == "" {
		return domain.ErrBadRequest
	}
	if groupIDs == nil {
		groupIDs = []string{}
	}
	return found(s.repo.EditPoint(ctx, id, authorID, body, groupIDs))
}

func (s *MonthlyExecutionService) SetPointStatus(ctx context.Context, id string, status domain.PointStatus) error {
	if status != domain.PointPending && status != domain.PointResolved {
		return domain.ErrBadRequest
	}
	return found(s.repo.SetPointStatus(ctx, id, status))
}

func (s *MonthlyExecutionService) DeletePoint(ctx context.Context, id, authorID string) error {
	return found(s.repo.DeletePoint(ctx, id, authorID))
}

func (s *MonthlyExecutionService) AddReply(ctx context.Context, pointID string, r *domain.PointReply) error {
	r.Body = strings.TrimSpace(r.Body)
	if r.Body == "" {
		return domain.ErrBadRequest
	}
	return s.repo.AddReply(ctx, pointID, r)
}

func found(ok bool, err error) error {
	if err == nil && !ok {
		return domain.ErrNotFound
	}
	return err
}
