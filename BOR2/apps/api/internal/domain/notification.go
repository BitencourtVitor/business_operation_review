package domain

import "time"

type Notification struct {
	ID          int64      `json:"id"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Recipients  []string   `json:"recipients"`
	ViewedBy    []string   `json:"viewedBy"`
	Link        *string    `json:"link,omitempty"`
	ScheduledAt *time.Time `json:"scheduledAt,omitempty"`
	CreatedBy   string     `json:"createdBy"`
	CreatedAt   time.Time  `json:"createdAt"`
}
