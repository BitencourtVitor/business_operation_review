package handler

import "testing"

func TestFilterInventoryHistoryStartsAtFirstMovementMonth(t *testing.T) {
	data := []HistoricoSaldo{
		{Mes: "2026-01-01", ProductID: "visible"},
		{Mes: "2026-06-01", ProductID: "visible"},
		{Mes: "2026-07-01", ProductID: "visible"},
		{Mes: "2026-08-01", ProductID: "visible"},
		{Mes: "2026-08-01", ProductID: "archived"},
	}

	got := filterInventoryHistory(data, map[string]bool{"visible": true}, "2026-07")
	if len(got) != 2 || got[0].Mes != "2026-07-01" || got[1].Mes != "2026-08-01" {
		t.Fatalf("unexpected filtered history: %#v", got)
	}
}

func TestFilterInventoryHistoryWithoutMovementsIsEmpty(t *testing.T) {
	data := []HistoricoSaldo{{Mes: "2026-08-01", ProductID: "visible"}}
	if got := filterInventoryHistory(data, map[string]bool{"visible": true}, ""); len(got) != 0 {
		t.Fatalf("expected empty history, got %#v", got)
	}
}
