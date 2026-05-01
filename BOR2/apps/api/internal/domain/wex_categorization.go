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

// WexReportPatchInput is the payload for partially updating a report.
type WexReportPatchInput struct {
	Company string `json:"company"`
}

// WexReportInput is the payload for creating a report.
type WexReportInput struct {
	Company    string          `json:"company"`
	FilterFrom string          `json:"filterFrom"`
	FilterTo   string          `json:"filterTo"`
	Meta       WexReportMeta   `json:"meta"`
	Results    json.RawMessage `json:"results"`
}

// WexIgnoredAddress maps to the wex_ignored_addresses table.
// Each entry represents a QB Time job code that should be excluded from cost
// allocation for the given company (e.g. "Office Work", company HQ addresses).
type WexIgnoredAddress struct {
	ID        int64     `json:"id"`
	Company   string    `json:"company"`
	Address   string    `json:"address"`
	Note      string    `json:"note"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// WexIgnoredAddressInput is the payload for creating/updating an ignored address.
type WexIgnoredAddressInput struct {
	Company  string `json:"company"`
	Address  string `json:"address"`
	Note     string `json:"note"`
	IsActive *bool  `json:"isActive"`
}
