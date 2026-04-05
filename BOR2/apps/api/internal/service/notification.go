package service

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type NotificationService struct {
	repo repository.NotificationRepository
}

func NewNotificationService(repo repository.NotificationRepository) *NotificationService {
	return &NotificationService{repo: repo}
}

func (s *NotificationService) List(ctx context.Context, userID string) ([]*domain.Notification, error) {
	return s.repo.List(ctx, userID)
}

func (s *NotificationService) ListAll(ctx context.Context) ([]*domain.Notification, error) {
	return s.repo.ListAll(ctx)
}

func (s *NotificationService) Create(ctx context.Context, n *domain.Notification) (*domain.Notification, error) {
	if n.Recipients == nil {
		n.Recipients = []string{}
	}
	if n.ViewedBy == nil {
		n.ViewedBy = []string{}
	}
	return s.repo.Create(ctx, n)
}

func (s *NotificationService) Update(ctx context.Context, id int64, n *domain.Notification) (*domain.Notification, error) {
	n.ID = id
	return s.repo.Update(ctx, n)
}

func (s *NotificationService) MarkViewed(ctx context.Context, id int64, userID string) error {
	return s.repo.MarkViewed(ctx, id, userID)
}

func (s *NotificationService) Delete(ctx context.Context, id int64) error {
	return s.repo.Delete(ctx, id)
}
