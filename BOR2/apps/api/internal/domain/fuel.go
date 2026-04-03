package domain

import "time"

type FuelEventType string

const (
	FuelEventTypeTrip FuelEventType = "trip"
	FuelEventTypeIdle FuelEventType = "idle"
)

type SamsaraEvent struct {
	ID         string        `json:"id"`
	EventKey   string        `json:"eventKey"`
	EventDate  time.Time     `json:"eventDate"`
	DriverName string        `json:"driverName"`
	Location   string        `json:"location"`
	Distance   float64       `json:"distance"`
	Units      string        `json:"units"`
	Type       FuelEventType `json:"type"`
	CreatedAt  time.Time     `json:"createdAt"`
}

type WexTransaction struct {
	ID              string    `json:"id"`
	TransactionKey  string    `json:"transactionKey"`
	TransactionDate time.Time `json:"transactionDate"`
	DriverName      string    `json:"driverName"`
	Units           float64   `json:"units"`
	TotalFuelCost   float64   `json:"totalFuelCost"`
	MerchantCity    string    `json:"merchantCity"`
	CreatedAt       time.Time `json:"createdAt"`
}

type FuelFilters struct {
	DriverName string
	StartDate  *time.Time
	EndDate    *time.Time
}

type FuelSummary struct {
	TotalDistance float64            `json:"totalDistance"`
	TotalFuelCost float64            `json:"totalFuelCost"`
	TotalIdleHours float64           `json:"totalIdleHours"`
	ByDriver      map[string]float64 `json:"byDriver"`
}
