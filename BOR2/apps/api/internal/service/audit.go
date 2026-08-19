package service

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/google/uuid"
)

// AuditService writes a record to audit_logs after every successful mutation.
// Errors are logged but never propagated — audit is a best-effort side-effect.
type AuditService struct {
	repo repository.AuditLogRepository
}

func NewAuditService(repo repository.AuditLogRepository) *AuditService {
	return &AuditService{repo: repo}
}

// Log persists one audit entry. Call it after every successful write operation.
//
//	action     — "create" | "update" | "delete" | "toggle" | "sync_sheet" | …
//	resource   — table / module name, e.g. "permit_control"
//	resourceID — affected record id; pass "" for bulk operations
func (s *AuditService) Log(ctx context.Context, userID, userName, action, resource, resourceID string) {
	entry := &domain.AuditLog{
		ID:         uuid.NewString(),
		UserID:     userID,
		UserName:   userName,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		CreatedAt:  time.Now(),
	}
	if err := s.repo.Create(ctx, entry); err != nil {
		logger.Warn("audit log write failed",
			"error", err,
			"action", action,
			"resource", resource,
			"resource_id", resourceID,
		)
	}
}

// Write persists an entry the auditing middleware already assembled. It runs
// off the request goroutine: the audit trail must never be what makes a write
// slower, and never what makes it fail.
func (s *AuditService) Write(entry *domain.AuditLog) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.repo.Create(ctx, entry); err != nil {
			logger.Warn("audit log write failed",
				"error", err, "method", entry.Method, "path", entry.Path)
		}
	}()
}
