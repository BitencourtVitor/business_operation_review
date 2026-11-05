package domain

import (
	"math"
	"testing"
)

func TestRateAt(t *testing.T) {
	pts := []RatePoint{{"2026-08-08", 27}, {"2026-08-22", 27}, {"2026-09-05", 30}}
	for date, want := range map[string]float64{"2026-02-10": 27, "2026-08-30": 30, "2026-11-01": 30} {
		if got := RateAt(pts, date); got != want {
			t.Errorf("RateAt(%s) = %v, want %v", date, got, want)
		}
	}
}

// O exemplo do Vitor: $32K com metade gasta; A com 60% das horas a $30, B com
// 40% a $25, os dois com 25% de overtime. Cabem ~508 h: A ~305, B ~203.
func TestForecastBuildingSplit(t *testing.T) {
	a := SupervisorHours{Employee: "A", Regular: 225, Overtime: 75, Rate: 30}
	b := SupervisorHours{Employee: "B", Regular: 150, Overtime: 50, Rate: 25}
	a.Cost = a.Rate * (a.Regular + 1.5*a.Overtime)
	b.Cost = b.Rate * (b.Regular + 1.5*b.Overtime)
	budget := 2 * (a.Cost + b.Cost) // metade gasta
	f := ForecastBuilding(budget, "2026-09-01", "2026-12-01", "2026-10-15", []SupervisorHours{a, b},
		map[string]float64{"2026-09-10": a.Cost, "2026-10-10": b.Cost})
	if f == nil {
		t.Fatal("nil forecast")
	}
	left := budget / 2
	want := left / (0.6*33.75 + 0.4*28.125)
	if math.Abs(f.RemainingHours-want) > 0.01 {
		t.Errorf("remaining %.2f, want %.2f", f.RemainingHours, want)
	}
	if w := f.Workers[0]; w.Employee != "A" || w.Regular != 225 || w.Overtime != 75 {
		t.Errorf("first worker %+v, want A with 225 + 75", w)
	}
	if last := f.Series[len(f.Series)-1]; last.Date != "2026-12-01" || math.Abs(last.Planned-f.BudgetHours) > 0.01 {
		t.Errorf("série termina em %s com %.1f", last.Date, last.Planned)
	}
}
