package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Interface ────────────────────────────────────────────────────────────────

type NotificationRepository interface {
	// User-facing: only active (scheduled_at past or null) + recipient match
	List(ctx context.Context, userID string) ([]*domain.Notification, error)
	// Admin-facing: all notifications regardless of schedule/recipient
	ListAll(ctx context.Context) ([]*domain.Notification, error)
	Create(ctx context.Context, n *domain.Notification) (*domain.Notification, error)
	Update(ctx context.Context, n *domain.Notification) (*domain.Notification, error)
	MarkViewed(ctx context.Context, id int64, userID string) error
	Delete(ctx context.Context, id int64) error
}

// ─── Postgres implementation ──────────────────────────────────────────────────

type PostgresNotificationRepository struct {
	db *pgxpool.Pool
}

func NewPostgresNotificationRepository(db *pgxpool.Pool) *PostgresNotificationRepository {
	return &PostgresNotificationRepository{db: db}
}

const notifSelect = `
	SELECT id, title, content, recipients, viewed_by,
	       scheduled_at, created_by, created_at
	FROM notifications
`

func scanNotifications(rows interface {
	Next() bool
	Scan(...any) error
	Close()
}) ([]*domain.Notification, error) {
	defer rows.Close()
	var result []*domain.Notification
	for rows.Next() {
		n := &domain.Notification{}
		var recipientsBytes, viewedByBytes []byte
		if err := rows.Scan(
			&n.ID, &n.Title, &n.Content,
			&recipientsBytes, &viewedByBytes,
			&n.ScheduledAt, &n.CreatedBy, &n.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		unmarshalJSONSlice(recipientsBytes, &n.Recipients)
		unmarshalJSONSlice(viewedByBytes, &n.ViewedBy)
		result = append(result, n)
	}
	return result, nil
}

func unmarshalJSONSlice(data []byte, dest *[]string) {
	if len(data) > 0 {
		_ = json.Unmarshal(data, dest)
	}
	if *dest == nil {
		*dest = []string{}
	}
}

func (r *PostgresNotificationRepository) List(ctx context.Context, userID string) ([]*domain.Notification, error) {
	filter, err := json.Marshal([]string{userID})
	if err != nil {
		return nil, fmt.Errorf("marshal user filter: %w", err)
	}
	rows, err := r.db.Query(ctx,
		notifSelect+`
		WHERE recipients @> $1::jsonb
		  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
		ORDER BY created_at DESC`,
		string(filter),
	)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	return scanNotifications(rows)
}

func (r *PostgresNotificationRepository) ListAll(ctx context.Context) ([]*domain.Notification, error) {
	rows, err := r.db.Query(ctx, notifSelect+`ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list all notifications: %w", err)
	}
	return scanNotifications(rows)
}

func (r *PostgresNotificationRepository) Create(ctx context.Context, n *domain.Notification) (*domain.Notification, error) {
	if n.Recipients == nil {
		n.Recipients = []string{}
	}
	if n.ViewedBy == nil {
		n.ViewedBy = []string{}
	}
	recipientsJSON, _ := json.Marshal(n.Recipients)
	viewedByJSON, _ := json.Marshal(n.ViewedBy)

	err := r.db.QueryRow(ctx, `
		INSERT INTO notifications (title, content, recipients, viewed_by, scheduled_at, created_by)
		VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
		RETURNING id, created_at
	`, n.Title, n.Content, string(recipientsJSON), string(viewedByJSON), n.ScheduledAt, n.CreatedBy).
		Scan(&n.ID, &n.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create notification: %w", err)
	}
	return n, nil
}

func (r *PostgresNotificationRepository) Update(ctx context.Context, n *domain.Notification) (*domain.Notification, error) {
	if n.Recipients == nil {
		n.Recipients = []string{}
	}
	recipientsJSON, _ := json.Marshal(n.Recipients)

	_, err := r.db.Exec(ctx, `
		UPDATE notifications
		SET title = $1, content = $2, recipients = $3::jsonb, scheduled_at = $4
		WHERE id = $5
	`, n.Title, n.Content, string(recipientsJSON), n.ScheduledAt, n.ID)
	if err != nil {
		return nil, fmt.Errorf("update notification: %w", err)
	}
	return n, nil
}

func (r *PostgresNotificationRepository) MarkViewed(ctx context.Context, id int64, userID string) error {
	userJSON, _ := json.Marshal([]string{userID})
	_, err := r.db.Exec(ctx, `
		UPDATE notifications
		SET viewed_by = CASE
			WHEN viewed_by @> $1::jsonb THEN viewed_by
			ELSE viewed_by || $1::jsonb
		END
		WHERE id = $2
	`, string(userJSON), id)
	return err
}

func (r *PostgresNotificationRepository) Delete(ctx context.Context, id int64) error {
	_, err := r.db.Exec(ctx, "DELETE FROM notifications WHERE id = $1", id)
	return err
}
