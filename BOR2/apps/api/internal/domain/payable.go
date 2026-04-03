package domain

import "time"

// PayableAccounting maps to the payables_accounting table.
type PayableAccounting struct {
	ID                string     `json:"id"`
	InternID          string     `json:"internId"`
	DateField         *time.Time `json:"dateField,omitempty"`
	ExpenseDate       *time.Time `json:"expenseDate,omitempty"`
	TransactionType   string     `json:"transactionType"`
	BillNum           string     `json:"billNum"`
	VendorDisplayName string     `json:"vendorDisplayName"`
	DueDate           *time.Time `json:"dueDate,omitempty"`
	OpenBalance       float64    `json:"openBalance"`
	Category          string     `json:"category"`
	AgingIntervals    string     `json:"agingIntervals"`
	CreatedAt         time.Time  `json:"createdAt"`
}

type PayableFilters struct {
	VendorDisplayName string
	Category          string
}
