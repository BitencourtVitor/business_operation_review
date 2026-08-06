package domain

import "time"

// QBTimeAbsenceEvent is one block of consecutive business days an employee went
// without clocking in. Dates are plain YYYY-MM-DD — an absence is a calendar
// fact, not an instant.
type QBTimeAbsenceEvent struct {
	ID           string     `json:"id"`
	Company      string     `json:"company"`
	QBTUserID    int64      `json:"qbtUserId"`
	EmployeeName string     `json:"employeeName"`
	TeamName     string     `json:"teamName"`
	StartDate    string     `json:"startDate"`
	EndDate      string     `json:"endDate"`
	DaysCount    int        `json:"daysCount"`
	Open         bool       `json:"open"`
	NotifiedAt   *time.Time `json:"notifiedAt,omitempty"`
}

type QBTimeAbsenceGroup struct {
	Team   string               `json:"team"`
	Events []QBTimeAbsenceEvent `json:"events"`
}

type QBTimeAbsenceResponse struct {
	Company     string               `json:"company"`
	Groups      []QBTimeAbsenceGroup `json:"groups"`
	TotalOpen   int                  `json:"totalOpen"`
	TotalEvents int                  `json:"totalEvents"`
	// Days actually evaluated — a day the whole company skipped (holiday, or a
	// failed sync) is dropped, so this can be smaller than the window asked for.
	EvaluatedDays []string `json:"evaluatedDays"`
}
