package service

import "testing"

func TestParseJobcodePathSkipsAddressFolder(t *testing.T) {
	tests := []struct {
		name        string
		path        []string
		client      string
		jobsite     string
		lotBuilding string
		worktype    string
	}{
		{
			name:    "project without worktype",
			path:    []string{"Address (NEW)", "Job Sites", "Maynard Homes, Building 1, Nashua, NH"},
			jobsite: "Job Sites > Maynard Homes, Building 1, Nashua",
		},
		{
			name:        "project with building and worktype",
			path:        []string{"Address (NEW)", "Maynard Homes, Building 1, Nashua, NH", "Building 1", "Normal Labor"},
			jobsite:     "Maynard Homes, Building 1, Nashua",
			lotBuilding: "Building 1",
			worktype:    "Normal Labor",
		},
		{
			name:    "client followed by legacy job sites path",
			path:    []string{"Pulte Homes (NEW)", "Job Sites", "Emerald Run, Shrewsbury"},
			client:  "Pulte Homes (NEW)",
			jobsite: "Job Sites > Emerald Run, Shrewsbury",
		},
		{
			name:     "absence category has no jobsite",
			path:     []string{"Sick"},
			worktype: "Sick",
		},
		{
			name:     "absence category variant",
			path:     []string{"Vacation Not Paid"},
			worktype: "Vacation Unpaid",
		},
		{
			name:        "floor ordinal does not split the building",
			path:        []string{"Address (NEW)", "Maynard Homes, Nashua, NH", "Building 1", "Panels", "3º"},
			jobsite:     "Maynard Homes, Nashua",
			lotBuilding: "Building 1",
			worktype:    "Panels",
		},
		{
			name:        "hours logged on the lot folder keep the lot out of worktype",
			path:        []string{"Toll Brothers (NEW)", "Edgewood at Hopkiton", "Lot 04"},
			client:      "Toll Brothers (NEW)",
			jobsite:     "Edgewood At Hopkiton",
			lotBuilding: "Lot 04",
		},
		{
			name:        "lot with worktype still parses",
			path:        []string{"Pulte Homes (NEW)", "Riverview, East Point", "LOT 04", "Warranty"},
			client:      "Pulte Homes (NEW)",
			jobsite:     "Riverview, East Point",
			lotBuilding: "LOT 04",
			worktype:    "Warranty",
		},
		{
			name:    "archived folder is skipped",
			path:    []string{"Archived", "Canton Lot 1"},
			jobsite: "Canton Lot 1",
		},
		{
			name:     "transport by company has no jobsite",
			path:     []string{"TRANSPORT", "Framing"},
			worktype: "Transport",
		},
		{
			name:     "company before transport has no jobsite",
			path:     []string{"Framing", "Transport"},
			worktype: "Transport",
		},
		{
			name:     "lunch break is never a jobsite",
			path:     []string{"Lunch break"},
			worktype: "Lunch Break",
		},
		{
			name:     "admin office has no jobsite",
			path:     []string{"Admin", "Office"},
			worktype: "Admin",
		},
		{
			name:     "maintenance keeps the address as jobsite",
			path:     []string{"Maintenance", "33 Scott St, Framingham, MA"},
			jobsite:  "33 Scott St, Framingham",
			worktype: "Maintenance",
		},
		{
			name:    "unknown single segment stays a jobsite",
			path:    []string{"Premium HVAC"},
			jobsite: "Premium Hvac",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, jobsite, lotBuilding, worktype := parseJobcodePath(tt.path)
			if client != tt.client || jobsite != tt.jobsite || lotBuilding != tt.lotBuilding || worktype != tt.worktype {
				t.Fatalf(
					"parseJobcodePath() = (%q, %q, %q, %q), want (%q, %q, %q, %q)",
					client, jobsite, lotBuilding, worktype,
					tt.client, tt.jobsite, tt.lotBuilding, tt.worktype,
				)
			}
		})
	}
}
