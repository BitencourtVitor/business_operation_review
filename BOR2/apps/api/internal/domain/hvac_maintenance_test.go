package domain

import "testing"

func TestMaintenanceClassify(t *testing.T) {
	s := func(v string) *string { return &v }
	f := func(v float64) *float64 { return &v }
	today := "2026-10-26"
	cases := []struct {
		name   string
		m      MaintenanceContract
		stage  MaintenanceStage
		unpaid bool
	}{
		{"prospect", MaintenanceContract{PlanSentOn: s("2026-09-01")}, StageProspect, false},
		{"no visit yet", MaintenanceContract{ContractStart: s("2026-10-01")}, StageToSchedule, false},
		{"first done, second open", MaintenanceContract{ContractStart: s("2026-04-01"), FirstService: s("2026-05-01")}, StageToSchedule, false},
		{"second booked", MaintenanceContract{ContractStart: s("2026-04-01"), FirstService: s("2026-05-01"), SecondService: s("2026-11-05")}, StageScheduled, false},
		{"both done", MaintenanceContract{ContractStart: s("2025-09-01"), FirstService: s("2025-10-01"), SecondService: s("2026-05-01")}, StageRenew, false},
		{"archived wins", MaintenanceContract{Archived: true, ContractStart: s("2025-09-01")}, StageArchived, false},
		{"open balance", MaintenanceContract{InvoiceStatus: []MaintenanceInvoice{{Balance: f(0)}, {Balance: f(499)}}}, StageProspect, true},
	}
	for _, c := range cases {
		c.m.Classify(today)
		if c.m.Stage != c.stage || c.m.Unpaid != c.unpaid {
			t.Errorf("%s: got %s/%v, want %s/%v", c.name, c.m.Stage, c.m.Unpaid, c.stage, c.unpaid)
		}
	}
}
