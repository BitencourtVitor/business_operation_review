package domain

import "time"

type ForecastStatus string

const (
	ForecastStatusPlanned   ForecastStatus = "planned"
	ForecastStatusActive    ForecastStatus = "active"
	ForecastStatusCompleted ForecastStatus = "completed"
	ForecastStatusCancelled ForecastStatus = "cancelled"
)

// Lightweight sub-resource types (from BOR1 migration tables)

type ForecastFieldwireDoc struct {
	ID     int64   `json:"id"`
	Status *string `json:"status"`
}

type ForecastMachineDoc struct {
	ID     int64   `json:"id"`
	Title  *string `json:"title"`
	Status *string `json:"status"`
}

type ForecastContractStepDoc struct {
	ID     int64   `json:"id"`
	Team   *string `json:"team"`
	Step   *string `json:"step"`
	Status *string `json:"status"`
}

type ForecastProject struct {
	ID                string         `json:"id"`
	Company           string         `json:"company"`
	Name              string         `json:"name"`
	Status            ForecastStatus `json:"status"`
	StartDate         time.Time      `json:"startDate"`
	EndDate           time.Time      `json:"endDate"`
	ContractValue     float64        `json:"contractValue"`
	Team              string         `json:"team"`
	QBTime            bool           `json:"qbTime"`
	Cliente           string         `json:"cliente"`
	JobSite           string         `json:"jobSite"`
	Type              string         `json:"type"`
	LoteBld           string         `json:"loteBld"`
	Address           string         `json:"address"`
	Obs               string         `json:"obs"`
	Hvac              bool           `json:"hvac"`
	Buildertrend      bool           `json:"buildertrend"`
	Storage           bool           `json:"storage"`
	MachineProvider   string         `json:"machineProvider"`
	PreviousBeamsDate *time.Time     `json:"previousBeamsDate,omitempty"`
	PreviousStartDate *time.Time     `json:"previousStartDate,omitempty"`
	PreviousEndDate   *time.Time     `json:"previousEndDate,omitempty"`
	Fieldwire         []ForecastFieldwireDoc   `json:"fieldwire,omitempty"`
	Machines          []ForecastMachineDoc     `json:"machines,omitempty"`
	ContractSteps     []ForecastContractStepDoc `json:"contractSteps,omitempty"`
	CreatedAt         time.Time      `json:"createdAt"`
	UpdatedAt         time.Time      `json:"updatedAt"`
}

type ForecastFilters struct {
	Company string
	Status  ForecastStatus
	Year    int
}

type ForecastFieldwire struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Priority  string    `json:"priority"`
	DueDate   *time.Time `json:"dueDate,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type ForecastMachine struct {
	ID              string    `json:"id"`
	ProjectID       string    `json:"projectId"`
	MachineName     string    `json:"machineName"`
	Provider        string    `json:"provider"`
	Status          string    `json:"status"`
	IsDispensed     bool      `json:"isDispensed"`
	StartDate       *time.Time `json:"startDate,omitempty"`
	EndDate         *time.Time `json:"endDate,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type ForecastContractStep struct {
	ID            string    `json:"id"`
	ProjectID     string    `json:"projectId"`
	StepName      string    `json:"stepName"`
	StepOrder     int       `json:"stepOrder"`
	Status        string    `json:"status"`
	PlannedDate   *time.Time `json:"plannedDate,omitempty"`
	CompletedDate *time.Time `json:"completedDate,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}
