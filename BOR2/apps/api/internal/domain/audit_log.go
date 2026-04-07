package domain

import "time"

// AuditLog records every successful mutation performed by an authenticated user.
type AuditLog struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	UserName   string    `json:"userName"`
	Action     string    `json:"action"`     // create | update | delete | toggle | sync_sheet | …
	Resource   string    `json:"resource"`   // table / module name, e.g. "permit_control"
	ResourceID string    `json:"resourceId"` // affected record id (empty for bulk ops)
	CreatedAt  time.Time `json:"createdAt"`
}
