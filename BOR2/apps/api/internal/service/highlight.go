package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/google/uuid"
)

// ── DestaqueService ─────────────────────────────────────────────────────────────

type DestaqueService struct {
	repo repository.DestaqueRepository
}

func NewDestaqueService(repo repository.DestaqueRepository) *DestaqueService {
	return &DestaqueService{repo: repo}
}

func (s *DestaqueService) List(ctx context.Context, filters domain.DestaqueFilters) ([]*domain.Destaque, error) {
	return s.repo.List(ctx, filters)
}

func (s *DestaqueService) FindByID(ctx context.Context, id string) (*domain.Destaque, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *DestaqueService) Create(ctx context.Context, r *domain.Destaque) (*domain.Destaque, error) {
	r.ID = uuid.NewString()
	r.CriadoEm = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *DestaqueService) Update(ctx context.Context, id string, r *domain.Destaque) (*domain.Destaque, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	r.ID = existing.ID
	r.UsuarioID = existing.UsuarioID
	r.TelaID = existing.TelaID
	r.CriadoEm = existing.CriadoEm
	if err := s.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *DestaqueService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}

// ── OportunidadeService ─────────────────────────────────────────────────────────

type OportunidadeService struct {
	repo repository.OportunidadeRepository
}

func NewOportunidadeService(repo repository.OportunidadeRepository) *OportunidadeService {
	return &OportunidadeService{repo: repo}
}

func (s *OportunidadeService) List(ctx context.Context, filters domain.OportunidadeFilters) ([]*domain.Oportunidade, error) {
	return s.repo.List(ctx, filters)
}

func (s *OportunidadeService) FindByID(ctx context.Context, id string) (*domain.Oportunidade, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *OportunidadeService) Create(ctx context.Context, r *domain.Oportunidade) (*domain.Oportunidade, error) {
	r.ID = uuid.NewString()
	r.CriadoEm = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *OportunidadeService) Update(ctx context.Context, id string, r *domain.Oportunidade) (*domain.Oportunidade, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	r.ID = existing.ID
	r.UsuarioID = existing.UsuarioID
	r.TelaID = existing.TelaID
	r.CriadoEm = existing.CriadoEm
	if err := s.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *OportunidadeService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}

// ── PlanoDeAcaoService ──────────────────────────────────────────────────────────

type PlanoDeAcaoService struct {
	repo repository.PlanoDeAcaoRepository
}

func NewPlanoDeAcaoService(repo repository.PlanoDeAcaoRepository) *PlanoDeAcaoService {
	return &PlanoDeAcaoService{repo: repo}
}

func (s *PlanoDeAcaoService) List(ctx context.Context, filters domain.PlanoDeAcaoFilters) ([]*domain.PlanoDeAcao, error) {
	return s.repo.List(ctx, filters)
}

func (s *PlanoDeAcaoService) FindByID(ctx context.Context, id string) (*domain.PlanoDeAcao, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *PlanoDeAcaoService) Create(ctx context.Context, r *domain.PlanoDeAcao) (*domain.PlanoDeAcao, error) {
	r.ID = uuid.NewString()
	r.CriadoEm = time.Now()
	if err := s.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *PlanoDeAcaoService) Update(ctx context.Context, id string, r *domain.PlanoDeAcao) (*domain.PlanoDeAcao, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	r.ID = existing.ID
	r.UsuarioID = existing.UsuarioID
	r.TelaID = existing.TelaID
	r.CriadoEm = existing.CriadoEm
	if err := s.repo.Update(ctx, r); err != nil {
		return nil, err
	}
	return r, nil
}

func (s *PlanoDeAcaoService) Delete(ctx context.Context, id string) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return domain.ErrNotFound
	}
	return s.repo.Delete(ctx, id)
}
