package domain

import "time"

// Cached QB Time rows backing the Period Reports screen (filled by the daily
// sync job, read instead of hitting QB Time live).

type QBTimesheetRow struct {
	Company     string
	QBTID       int64
	UserID      int64
	UserName    string // "First Last"
	JobcodeID   int64
	JobcodePath []string
	WorkDate    string // "2006-01-02"
	Start       string // ISO 8601
	End         string // ISO 8601
	DurationMin int
	Type        string // "regular" | "manual" (manual = PTO/holiday/sick)
	IsPaid      bool   // base state (always true); the unpaid-address override is the real gate
}

type QBPayrollRow struct {
	Company     string
	PeriodEnd   string // "2006-01-02"
	UserID      int64
	UserName    string // "Last, First"
	PayRate     float64
	JobcodeID   int64
	JobcodePath []string
	RegSeconds  int
	OTSeconds   int
}

type QBSyncState struct {
	Company   string
	MinDate   string // "2006-01-02"; empty when nothing cached
	MaxDate   string
	LastRunAt time.Time
}

// PeriodAddress is a distinct jobcode-path string for a company, with whether
// the operator has flagged it as unpaid (Pillar 2).
type PeriodAddress struct {
	Address string `json:"address"`
	Unpaid  bool   `json:"unpaid"`
}
