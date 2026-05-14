package domain

type WeeklyReportAddress struct {
	Address string  `json:"address"`
	Hours   float64 `json:"hours"`
}

type WeeklyReportDay struct {
	Date       string                `json:"date"`       // "2026-05-13"
	Day        string                `json:"day"`        // "Wednesday"
	TotalHours float64               `json:"totalHours"`
	Addresses  []WeeklyReportAddress `json:"addresses"`
}

type WeeklyReportEmployee struct {
	Name            string            `json:"name"`
	Days            []WeeklyReportDay `json:"days"`
	WeekTotal       float64           `json:"weekTotal"`
	WeekExcess      float64           `json:"weekExcess"`
	SuggestionHours float64           `json:"suggestionHours"` // hours to leave early per remaining day
}

type WeeklyReportResponse struct {
	Company     string                 `json:"company"`
	WeekStart   string                 `json:"weekStart"`   // Monday
	WeekEnd     string                 `json:"weekEnd"`     // last day with data
	ReportDate  string                 `json:"reportDate"`  // the date param
	HoursPerDay float64                `json:"hoursPerDay"` // default 8
	Employees   []WeeklyReportEmployee `json:"employees"`
}
