package domain

import "time"

// ServiceRequestRow maps to the service_requests table.
type ServiceRequestRow struct {
	ID                    string     `json:"id"`
	Contractor            string     `json:"contractor"`
	JobSite               string     `json:"jobSite"`
	City                  string     `json:"city"`
	Lot                   string     `json:"lot"`
	Address               string     `json:"address"`
	CloseDate             *time.Time `json:"closeDate,omitempty"`
	DateReceived          *time.Time `json:"dateReceived,omitempty"`
	MaterialAvailableDate *time.Time `json:"materialAvailableDate,omitempty"`
	ResidentAvailableDate *time.Time `json:"residentAvailableDate,omitempty"`
	DateCompleted         *time.Time `json:"dateCompleted,omitempty"`
	AdditionalVisits      []string   `json:"additionalVisits"`
	Issue                 string     `json:"issue"`
	Warranty              bool       `json:"warranty"`
	Subcontractor         bool       `json:"subcontractor"`
	Tech                  string     `json:"tech"`
	CreatedAt             time.Time  `json:"createdAt"`
}

type ServiceRequestFilters struct {
	Contractor string
	JobSite    string
}
