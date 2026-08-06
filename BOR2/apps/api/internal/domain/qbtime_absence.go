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

// ── Weekly attendance grid ────────────────────────────────────────────────────
// Everyone on the roster shows up every week, present or not — the grid is the
// view, the absence is just a state inside it.

// AttendanceDay is one cell. Status is one of:
//   present — punched in
//   absent  — business day with no punch
//   skipped — business day the whole company sat out (holiday or failed sync)
//   pending — today or later, hasn't happened yet
//   off     — weekend with no punch. Never an absence: weekend work is the
//             exception, so the grid only ever marks it when someone worked.
type AttendanceDay struct {
	Date    string `json:"date"`
	Weekday string `json:"weekday"`
	Status  string `json:"status"`
	// Streak is how many consecutive absent days end on this one, counting back
	// past the start of the week. 2 or more is what the alert fires on.
	Streak int `json:"streak"`
}

type AttendanceDayHeader struct {
	Date      string `json:"date"`
	Weekday   string `json:"weekday"`
	Evaluated bool   `json:"evaluated"`
	Weekend   bool   `json:"weekend"`
}

type AttendanceEmployee struct {
	QBTUserID   int64           `json:"qbtUserId"`
	Name        string          `json:"name"`
	Days        []AttendanceDay `json:"days"`
	AbsentCount int             `json:"absentCount"`
	MaxStreak   int             `json:"maxStreak"`
}

type AttendanceTeam struct {
	Team      string               `json:"team"`
	Employees []AttendanceEmployee `json:"employees"`
}

type AttendanceResponse struct {
	Company      string                `json:"company"`
	WeekStart    string                `json:"weekStart"`
	WeekEnd      string                `json:"weekEnd"`
	Days         []AttendanceDayHeader `json:"days"`
	Teams        []AttendanceTeam      `json:"teams"`
	RosterSize   int                   `json:"rosterSize"`
	TotalAbsent  int                   `json:"totalAbsent"`
	TotalFlagged int                   `json:"totalFlagged"`
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
