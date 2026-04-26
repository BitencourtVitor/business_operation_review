package domain

import "time"

type WorkforceUpload struct {
	ID             string    `json:"id"`
	ReferenceMonth string    `json:"referenceMonth"`
	Company        string    `json:"company"`
	FileName       string    `json:"fileName"`
	RecordCount    int       `json:"recordCount"`
	TotalHours     float64   `json:"totalHours"`
	UploadedBy     string    `json:"uploadedBy"`
	UploadedAt     time.Time `json:"uploadedAt"`
	Status         string    `json:"status"`
}

type WorkforceProductivityRow struct {
	ID             string  `json:"id"`
	UploadID       string  `json:"uploadId"`
	Client         string  `json:"client"`
	Jobsite        string  `json:"jobsite"`
	LotBuilding    string  `json:"lotBuilding"`
	Worktype       string  `json:"worktype"`
	EmployeeName   string  `json:"employeeName"`
	RegularRate    float64 `json:"regularRate"`
	RegularHours   float64 `json:"regularHours"`
	ReferenceMonth string  `json:"referenceMonth"`
	Company        string  `json:"company"`
}

