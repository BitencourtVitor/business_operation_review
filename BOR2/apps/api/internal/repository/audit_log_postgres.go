package repository

import (
	"context"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditLogRepository interface {
	Create(ctx context.Context, entry *domain.AuditLog) error
	List(ctx context.Context, limit int) ([]*domain.AuditLog, error)
}

type PostgresAuditLogRepository struct {
	db *pgxpool.Pool
}

func NewPostgresAuditLogRepository(db *pgxpool.Pool) *PostgresAuditLogRepository {
	return &PostgresAuditLogRepository{db: db}
}

func (r *PostgresAuditLogRepository) Create(ctx context.Context, entry *domain.AuditLog) error {
	source := entry.Source
	if source == "" {
		source = "manual"
	}
	// Payload is JSONB: an empty string is not valid JSON, so it goes in as NULL.
	var payload any
	if entry.Payload != "" {
		payload = entry.Payload
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO audit_logs (
			id, user_id, user_name, action, resource, resource_id, created_at,
			method, path, status_code, query, payload, ip, user_agent, duration_ms, source
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
	`, entry.ID, entry.UserID, entry.UserName, entry.Action,
		entry.Resource, entry.ResourceID, entry.CreatedAt,
		entry.Method, entry.Path, entry.StatusCode, entry.Query, payload,
		entry.IP, entry.UserAgent, entry.DurationMS, source)
	return err
}

func (r *PostgresAuditLogRepository) List(ctx context.Context, limit int) ([]*domain.AuditLog, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, user_name, action, resource, resource_id, created_at,
		       COALESCE(method,''), COALESCE(path,''), COALESCE(status_code,0),
		       COALESCE(query,''), COALESCE(payload::text,''), COALESCE(ip,''),
		       COALESCE(user_agent,''), COALESCE(duration_ms,0), COALESCE(source,'manual')
		FROM audit_logs
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list audit_logs: %w", err)
	}
	defer rows.Close()

	var entries []*domain.AuditLog
	for rows.Next() {
		e := &domain.AuditLog{}
		if err := rows.Scan(&e.ID, &e.UserID, &e.UserName, &e.Action,
			&e.Resource, &e.ResourceID, &e.CreatedAt,
			&e.Method, &e.Path, &e.StatusCode, &e.Query, &e.Payload,
			&e.IP, &e.UserAgent, &e.DurationMS, &e.Source); err != nil {
			return nil, fmt.Errorf("scan audit_log: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, nil
}
