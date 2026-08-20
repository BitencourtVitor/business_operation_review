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
