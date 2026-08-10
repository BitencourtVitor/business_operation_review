package service

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AlertRecipientDirectory exposes the single recipient list managed by the
// Email alerts modal. All BOR modules use this list until separate routing is
// explicitly configured in the UI.
type AlertRecipientDirectory struct {
	db *pgxpool.Pool
}

func NewAlertRecipientDirectory(db *pgxpool.Pool) *AlertRecipientDirectory {
	return &AlertRecipientDirectory{db: db}
}

func (d *AlertRecipientDirectory) Resolve(ctx context.Context) ([]string, []string, error) {
	rows, err := d.db.Query(ctx, `
		SELECT r.recipient_type, u.email
		FROM sub_doc_email_recipients r
		JOIN users u ON u.id = r.user_id
		WHERE r.alert_type = 'workers_comp' AND trim(u.email) <> ''
		ORDER BY r.recipient_type DESC, u.name
	`)
	if err != nil {
		return nil, nil, fmt.Errorf("alert recipients: %w", err)
	}
	defer rows.Close()

	to, cc := []string{}, []string{}
	for rows.Next() {
		var kind, address string
		if err := rows.Scan(&kind, &address); err != nil {
			return nil, nil, err
		}
		if kind == "to" {
			to = append(to, address)
		} else {
			cc = append(cc, address)
		}
	}
	return to, cc, rows.Err()
}
