package service

import (
	"context"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type MaintenanceContractService struct {
	repo repository.MaintenanceContractRepository
}

func NewMaintenanceContractService(repo repository.MaintenanceContractRepository) *MaintenanceContractService {
	return &MaintenanceContractService{repo: repo}
}

// List classifica pelo dia de Massachusetts, onde as visitas acontecem.
func (s *MaintenanceContractService) List(ctx context.Context) ([]*domain.MaintenanceContract, error) {
	list, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	today := time.Now().In(loc).Format("2006-01-02")
	for _, m := range list {
		m.Classify(today)
	}
	return list, nil
}

func (s *MaintenanceContractService) SearchInvoices(ctx context.Context, q string) ([]domain.MaintenanceInvoice, error) {
	return s.repo.SearchInvoices(ctx, strings.TrimSpace(q))
}

func (s *MaintenanceContractService) Save(ctx context.Context, m *domain.MaintenanceContract) error {
	m.ClientName = strings.TrimSpace(m.ClientName)
	if m.ClientName == "" {
		return domain.ErrBadRequest
	}
	invoices := []string{}
	for _, n := range m.Invoices {
		if n = strings.TrimSpace(n); n != "" {
			invoices = append(invoices, n)
		}
	}
	m.Invoices = invoices
	if m.ID == "" {
		id, err := s.repo.Create(ctx, m)
		m.ID = id
		return err
	}
	ok, err := s.repo.Update(ctx, m)
	if err == nil && !ok {
		return domain.ErrNotFound
	}
	return err
}

func (s *MaintenanceContractService) Delete(ctx context.Context, id string) error {
	ok, err := s.repo.Delete(ctx, id)
	if err == nil && !ok {
		return domain.ErrNotFound
	}
	return err
}

func (s *MaintenanceContractService) ListComments(ctx context.Context, contractID string) ([]domain.MaintenanceComment, error) {
	return s.repo.ListComments(ctx, contractID)
}

// AddComment grava o comentário assinado por quem está na sessão.
func (s *MaintenanceContractService) AddComment(ctx context.Context, contractID string, c *domain.MaintenanceComment) error {
	c.Body = strings.TrimSpace(c.Body)
	if c.Body == "" {
		return domain.ErrBadRequest
	}
	return s.repo.AddComment(ctx, contractID, c)
}

func (s *MaintenanceContractService) UpdateComment(ctx context.Context, contractID string, commentID int64, authorID, body string) error {
	body = strings.TrimSpace(body)
	if body == "" {
		return domain.ErrBadRequest
	}
	ok, err := s.repo.UpdateComment(ctx, contractID, commentID, authorID, body)
	if err == nil && !ok {
		return domain.ErrNotFound
	}
	return err
}

func (s *MaintenanceContractService) DeleteComment(ctx context.Context, contractID string, commentID int64, authorID string) error {
	ok, err := s.repo.DeleteComment(ctx, contractID, commentID, authorID)
	if err == nil && !ok {
		return domain.ErrNotFound
	}
	return err
}
