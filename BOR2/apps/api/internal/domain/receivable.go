package domain

import "time"

// ReceivableAccounting maps to the receivables_accounting table.
type ReceivableAccounting struct {
	ID               string     `json:"id"`
	InternID         string     `json:"internId"`
	DateField        *time.Time `json:"dateField,omitempty"`
	InvDate          *time.Time `json:"invDate,omitempty"`
	TransactionType  string     `json:"transactionType"`
	InvNum           string     `json:"invNum"`
	CustomerFullName string     `json:"customerFullName"`
	DueDate          *time.Time `json:"dueDate,omitempty"`
	OpenBalance      float64    `json:"openBalance"`
	Category         string     `json:"category"`
	AgingIntervals   string     `json:"agingIntervals"`
	CreatedAt        time.Time  `json:"createdAt"`
}

type ReceivableFilters struct {
	CustomerFullName string
	Category         string
}
