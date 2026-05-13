package domain

import "time"

// WhosWorkingEntry is a single employee currently clocked in.
type WhosWorkingEntry struct {
	QBTUserID int     `json:"qbtUserId"`
	Name      string  `json:"name"`
	ClockIn   string  `json:"clockIn"` // "07:30 AM" in America/New_York
	Elapsed   float64 `json:"elapsed"` // decimal hours, e.g. 3.5
}

// WhosWorkingGroup is one team block in the report.
type WhosWorkingGroup struct {
	Team    string             `json:"team"`
	Entries []WhosWorkingEntry `json:"entries"`
}

// WhosWorkingResponse is the full payload for GET /qbtime/whos-working.
type WhosWorkingResponse struct {
	Company      string             `json:"company"`
	GeneratedAt  string             `json:"generatedAt"`  // "05/13 · 02:13 PM" (America/New_York)
	GeneratedISO time.Time          `json:"generatedISO"` // UTC timestamp
	Groups       []WhosWorkingGroup `json:"groups"`
	TotalOnClock int                `json:"totalOnClock"`
}

// WhosWorkingException is an employee excluded from the Who's Working report.
type WhosWorkingException struct {
	ID           string    `json:"id"`
	Company      string    `json:"company"`
	EmployeeName string    `json:"employeeName"`
	CreatedAt    time.Time `json:"createdAt"`
}
