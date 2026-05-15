package domain

import "time"

// QBTimeTeam is a named group of employees for a given company.
type QBTimeTeam struct {
	ID        string    `json:"id"`
	Company   string    `json:"company"`
	Name      string    `json:"name"`
	Members   []string  `json:"members"`
	CreatedAt time.Time `json:"createdAt"`
}
