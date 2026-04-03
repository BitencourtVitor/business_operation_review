package domain

import "time"

type WorkforceEntry struct {
	ID           string    `json:"id"`
	Company      string    `json:"company"`
	EmployeeName string    `json:"employeeName"`
	Role         string    `json:"role"`
	ProjectName  string    `json:"projectName"`
	Week         int       `json:"week"`
	Year         int       `json:"year"`
	HoursPlanned float64   `json:"hoursPlanned"`
	HoursActual  float64   `json:"hoursActual"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type WorkforceFilters struct {
	Company string
	Week    int
	Year    int
}

type WorkforceSummary struct {
	TotalPlanned    float64            `json:"totalPlanned"`
	TotalActual     float64            `json:"totalActual"`
	ProductivityPct float64            `json:"productivityPct"`
	ByEmployee      map[string]float64 `json:"byEmployee"`
}
