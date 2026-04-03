package domain

import "time"

// TimesheetRow maps to the timesheet_analysis table.
type TimesheetRow struct {
	ID             string     `json:"id"`
	Date           *time.Time `json:"date,omitempty"`
	Nome           string     `json:"nome"`
	Error          string     `json:"error"`
	Team           string     `json:"team"`
	Corporation    string     `json:"corporation"`
	Payrate        float64    `json:"payrate"`
	AddTimeHour    float64    `json:"addTimeHour"`
	RemoveTimeHour float64    `json:"removeTimeHour"`
	AddDollar      float64    `json:"addDollar"`
	RemoveDollar   float64    `json:"removeDollar"`
	Total          float64    `json:"total"`
	Jobsite        string     `json:"jobsite"`
	LotBuilding    string     `json:"lotBuilding"`
	Worktype       string     `json:"worktype"`
	RegularHours   float64    `json:"regularHours"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type TimesheetRowFilters struct {
	Team        string
	Corporation string
	Nome        string
}
