package domain

import (
	"encoding/json"
	"time"
)

// WexNormEntry maps to the wex_normalization table.
type WexNormEntry struct {
	ID        int64     `json:"id"`
	Company   string    `json:"company"`
	DriverID  string    `json:"driverId"`
	WexName   string    `json:"wexName"`
	QbName    string    `json:"qbName"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// WexNormInput is the payload for creating/updating a normalization entry.
type WexNormInput struct {
	Company  string `json:"company"`
	DriverID string `json:"driverId"`
	WexName  string `json:"wexName"`
	QbName   string `json:"qbName"`
	IsActive *bool  `json:"isActive"`
}

// WexReportMeta holds aggregate statistics for a WEX categorization report.
type WexReportMeta struct {
	WexTxCount   int     `json:"wexTxCount"`
	WexTotal     float64 `json:"wexTotal"`
	WexDrivers   int     `json:"wexDrivers"`
	QbEntries    int     `json:"qbEntries"`
	QbEmployees  int     `json:"qbEmployees"`
	Matched      int     `json:"matched"`
	OfficeCount  int     `json:"officeCount"`
	UniqueObras  int     `json:"uniqueObras"`
	TotalCost    float64 `json:"totalCost"`
}

// WexReport maps to the wex_reports table.
// Results is omitempty so list endpoints can omit the heavy JSONB.
type WexReport struct {
	ID         string          `json:"id"`
	Company    string          `json:"company"`
	FilterFrom string          `json:"filterFrom"`
	FilterTo   string          `json:"filterTo"`
	Meta       WexReportMeta   `json:"meta"`
	Results    json.RawMessage `json:"results,omitempty"`
	CreatedAt  time.Time       `json:"createdAt"`
}

// WexReportInput is the payload for creating a report.
type WexReportInput struct {
	Company    string          `json:"company"`
	FilterFrom string          `json:"filterFrom"`
	FilterTo   string          `json:"filterTo"`
	Meta       WexReportMeta   `json:"meta"`
	Results    json.RawMessage `json:"results"`
}
