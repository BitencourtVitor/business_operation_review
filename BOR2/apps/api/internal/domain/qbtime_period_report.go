package domain

// ── Pay Periods ───────────────────────────────────────────────────────────────

type PayPeriod struct {
	Label     string `json:"label"`     // e.g. "Apr 26 – May 9, 2026"
	StartDate string `json:"startDate"` // "2026-04-26"
	EndDate   string `json:"endDate"`   // "2026-05-09"
}

type PayPeriodsResponse struct {
	Company string      `json:"company"`
	Periods []PayPeriod `json:"periods"`
}

// ── Intervals (Deslocamentos) ─────────────────────────────────────────────────

type PeriodBlock struct {
	Start           string   `json:"start"`           // ISO 8601 "2026-04-27T07:27:00-04:00"
	End             string   `json:"end"`             // ISO 8601
	DurationMinutes int      `json:"durationMinutes"`
	JobcodePath     []string `json:"jobcodePath"` // full hierarchy from root to leaf
	Type            string   `json:"type"`        // "regular" | "manual" (manual = PTO/holiday/sick)
	IsPaid          bool     `json:"isPaid"`      // effective: false only when the address is flagged unpaid in the modal
}

type PeriodDay struct {
	Date         string        `json:"date"`         // "2026-04-27"
	DayName      string        `json:"dayName"`      // "Monday"
	TotalHours   float64       `json:"totalHours"`   // paid hours only
	TotalMinutes int           `json:"totalMinutes"` // paid minutes only
	Blocks       []PeriodBlock `json:"blocks"`
}

type PeriodEmployee struct {
	Name        string      `json:"name"`
	Team        string      `json:"team"`         // BOR2 team name (empty when unassigned)
	TotalHours  float64     `json:"totalHours"`  // sum of paid hours across all days
	TotalOTHours float64    `json:"totalOTHours"` // overtime hours (from accounting data)
	Days        []PeriodDay `json:"days"`
}

type IntervalsResponse struct {
	Company   string           `json:"company"`
	StartDate string           `json:"startDate"`
	EndDate   string           `json:"endDate"`
	Employees []PeriodEmployee `json:"employees"`
}

// ── Accounting (Contábil) ─────────────────────────────────────────────────────

type AccountingRow struct {
	Employee     string   `json:"employee"`     // "Drumond, Felipe A"
	JobcodePath  []string `json:"jobcodePath"`  // full hierarchy
	RegularHours float64  `json:"regularHours"` // regular hours
	RegularRate  float64  `json:"regularRate"`  // $/hr
	RegularCost  float64  `json:"regularCost"`  // regularHours * regularRate
	OTHours      float64  `json:"otHours"`      // overtime hours
	OTRate       float64  `json:"otRate"`       // regularRate * 1.5
	OTCost       float64  `json:"otCost"`       // otHours * otRate
	TotalHours   float64  `json:"totalHours"`
	TotalCost    float64  `json:"totalCost"`
}

type AccountingTotals struct {
	RegularHours float64 `json:"regularHours"`
	RegularCost  float64 `json:"regularCost"`
	OTHours      float64 `json:"otHours"`
	OTCost       float64 `json:"otCost"`
	TotalHours   float64 `json:"totalHours"`
	TotalCost    float64 `json:"totalCost"`
}

type AccountingResponse struct {
	Company   string           `json:"company"`
	StartDate string           `json:"startDate"`
	EndDate   string           `json:"endDate"`
	Rows      []AccountingRow  `json:"rows"`
	Totals    AccountingTotals `json:"totals"`
}
