package domain

import "time"

// EmployeeName maps to the employee_names table.
type EmployeeName struct {
	ID                    string    `json:"id"`
	WexName               string    `json:"wexName"`
	SamsaraName           string    `json:"samsaraName"`
	NormalizedName        string    `json:"normalizedName"`
	IsActive              bool      `json:"isActive"`
	VehicleModel          string    `json:"vehicleModel"`
	VehicleMinConsumption float64   `json:"vehicleMinConsumption"`
	VehicleMaxConsumption float64   `json:"vehicleMaxConsumption"`
	CreatedAt             time.Time `json:"createdAt"`
}

type EmployeeNameFilters struct {
	NormalizedName string
	IsActive       *bool
}
