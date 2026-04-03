package domain

import "time"

type SubcontractorStatus string

const (
	SubcontractorStatusActive    SubcontractorStatus = "active"
	SubcontractorStatusInactive  SubcontractorStatus = "inactive"
	SubcontractorStatusSuspended SubcontractorStatus = "suspended"
	SubcontractorStatusPending   SubcontractorStatus = "pending"
)

type SubcontractorPerformance struct {
	ID                string              `json:"id"`
	Company           string              `json:"company"`
	SubcontractorName string              `json:"subcontractorName"`
	Status            SubcontractorStatus `json:"status"`
	PerformanceScore  float64             `json:"performanceScore"`
	CompletedProjects int                 `json:"completedProjects"`
	ActiveProjects    int                 `json:"activeProjects"`
	LastEventAt       *time.Time          `json:"lastEventAt,omitempty"`
	CreatedAt         time.Time           `json:"createdAt"`
	UpdatedAt         time.Time           `json:"updatedAt"`
}

type SubcontractorFilters struct {
	Company string
	Status  SubcontractorStatus
}
