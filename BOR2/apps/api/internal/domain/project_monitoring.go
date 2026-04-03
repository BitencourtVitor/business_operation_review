package domain

import "time"

// ProjectMonitoringHvac maps to the project_monitoring_hvac table.
type ProjectMonitoringHvac struct {
	ID               string     `json:"id"`
	City             string     `json:"city"`
	JobSite          string     `json:"jobSite"`
	LotNumber        string     `json:"lotNumber"`
	Team             string     `json:"team"`
	StartDate        *time.Time `json:"startDate,omitempty"`
	FinishDate       *time.Time `json:"finishDate,omitempty"`
	S1Rough          string     `json:"s1Rough"`
	S1Date           *time.Time `json:"s1Date,omitempty"`
	S2Machines       string     `json:"s2Machines"`
	S2Date           *time.Time `json:"s2Date,omitempty"`
	S3Condenser      string     `json:"s3Condenser"`
	S3Date           *time.Time `json:"s3Date,omitempty"`
	S4Finish         string     `json:"s4Finish"`
	S4Date           *time.Time `json:"s4Date,omitempty"`
	PercentCompleted float64    `json:"percentCompleted"`
	LastUpdate       *time.Time `json:"lastUpdate,omitempty"`
	Notes            string     `json:"notes"`
	CreatedAt        time.Time  `json:"createdAt"`
}

type ProjectMonitoringHvacFilters struct {
	City    string
	JobSite string
	Team    string
}
