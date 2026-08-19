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

	// Filled by the auditing middleware. A manual Log() call leaves them empty,
	// and Source says which of the two wrote the row.
	Method     string `json:"method,omitempty"`
	Path       string `json:"path,omitempty"`
	StatusCode int    `json:"statusCode,omitempty"`
	Query      string `json:"query,omitempty"`
	// Request body, with sensitive fields redacted. JSON only — any other
	// content type is recorded by its type, never by its bytes.
	Payload    string `json:"payload,omitempty"`
	IP         string `json:"ip,omitempty"`
	UserAgent  string `json:"userAgent,omitempty"`
	DurationMS int    `json:"durationMs,omitempty"`
	Source     string `json:"source,omitempty"` // manual | middleware
}
