package domain

import "time"

// RuleConditions holds the optional match criteria for an attribution rule.
// All non-empty fields must match for the rule to fire.
type RuleConditions struct {
	Company  string `json:"company,omitempty"`
	Client   string `json:"client,omitempty"`
	Jobsite  string `json:"jobsite,omitempty"`
	Worktype string `json:"worktype,omitempty"`
}

// WorkforceAttributionRule redirects rows that match Conditions
// to appear under TargetCompany instead of their original company.
type WorkforceAttributionRule struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Conditions    RuleConditions `json:"conditions"`
	TargetCompany string         `json:"targetCompany"`
	CreatedBy     string         `json:"createdBy"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}
