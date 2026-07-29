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

// QBTimeEmployeeTeam links one QB Time employee to the team QB Time itself
// reports them under (synced daily via the QBT Groups API), with an optional
// manual override that takes precedence and is flagged as a divergence from
// what QuickBooks Time currently shows.
type QBTimeEmployeeTeam struct {
	ID                string     `json:"id"`
	Company           string     `json:"company"`
	QBTUserID         int        `json:"qbtUserId"`
	EmployeeName      string     `json:"employeeName"`
	QBTeamID          *int       `json:"qbTeamId"`
	QBTeamName        *string    `json:"qbTeamName"`
	OverrideTeamName  *string    `json:"overrideTeamName"`
	OverriddenBy      *string    `json:"overriddenBy"`
	OverriddenAt      *time.Time `json:"overriddenAt"`
	LastSyncedAt      time.Time  `json:"lastSyncedAt"`
	EffectiveTeamName string     `json:"effectiveTeamName"`
	IsOverridden      bool       `json:"isOverridden"`
}
