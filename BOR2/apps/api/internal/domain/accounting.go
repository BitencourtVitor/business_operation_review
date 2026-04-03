package domain

import "time"

type AccountingType string

const (
	AccountingTypeReceivables AccountingType = "receivables"
	AccountingTypePayables    AccountingType = "payables"
)

type AccountingRecord struct {
	ID          string         `json:"id"`
	Company     string         `json:"company"`
	Type        AccountingType `json:"type"`
	Month       string         `json:"month"`
	Year        int            `json:"year"`
	Amount      float64        `json:"amount"`
	Description string         `json:"description"`
	Category    string         `json:"category"`
	DueDate     *time.Time     `json:"dueDate,omitempty"`
	PaidDate    *time.Time     `json:"paidDate,omitempty"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

type AccountingFilters struct {
	Company string
	Type    AccountingType
	Month   string
	Year    int
}

type AccountingSummary struct {
	TotalReceivables float64            `json:"totalReceivables"`
	TotalPayables    float64            `json:"totalPayables"`
	NetBalance       float64            `json:"netBalance"`
}
