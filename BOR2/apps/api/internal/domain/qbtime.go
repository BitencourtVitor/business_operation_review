package domain

import "time"

// QBTimeDailyReport is the header record for one company+date combination.
type QBTimeDailyReport struct {
	ID            string                   `json:"id"`
	Company       string                   `json:"company"`
	Date          string                   `json:"date"` // "YYYY-MM-DD"
	FileName      string                   `json:"fileName"`
	Entries       []QBTimeDailyReportEntry `json:"entries,omitempty"`
	CreatedAt     time.Time                `json:"createdAt"`
	CreatedByID   string                   `json:"createdById"`
	CreatedByName string                   `json:"createdByName"`
}

// QBTimeDailyReportEntry is a single row from the QB Time Job Costing CSV.
type QBTimeDailyReportEntry struct {
	ID              string  `json:"id"`
	ReportID        string  `json:"reportId"`
	EmployeeRaw     string  `json:"employeeRaw"`     // "Last, First" as exported
	EmployeeDisplay string  `json:"employeeDisplay"` // "First Last"
	JobCode         string  `json:"jobCode"`
	RegularHours    float64 `json:"regularHours"`
	OvertimeHours   float64 `json:"overtimeHours"`
	TotalHours      float64 `json:"totalHours"`
}

// QBTimeDailyReportFilters are optional query parameters for List.
type QBTimeDailyReportFilters struct {
	Company string
	Limit   int
}
