package domain

import "time"

// WhosWorkingBreak is a single completed break (unpaid) block.
type WhosWorkingBreak struct {
	Start   string `json:"start"`   // "07:30 AM"
	End     string `json:"end"`     // "08:00 AM"
	Minutes int    `json:"minutes"`
}

// WhosWorkingEntry is a single employee currently clocked in.
type WhosWorkingEntry struct {
	QBTUserID         int                `json:"qbtUserId"`
	Name              string             `json:"name"`
	// Kept for backward compatibility; equals CurrentBlockStart.
	ClockIn           string             `json:"clockIn"`           // start of current block, "07:30 AM"
	Elapsed           float64            `json:"elapsed"`           // hours since current block started
	// New fields
	FirstClockIn      string             `json:"firstClockIn"`      // start of first block today
	CurrentBlockStart string             `json:"currentBlockStart"` // same as ClockIn
	CurrentBlockType  string             `json:"currentBlockType"`  // "regular" | "break"
	TotalWorkHours    float64            `json:"totalWorkHours"`    // sum of regular hours today
	TotalBreakMinutes int                `json:"totalBreakMinutes"` // sum of break minutes today
	CurrentAddress    string             `json:"currentAddress"`    // jobcode name of open block
	Breaks            []WhosWorkingBreak `json:"breaks"`            // completed break blocks today
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
