package domain

import "testing"

func TestGoalFor(t *testing.T) {
	g := GoalGroup{Checkpoints: []GoalCheckpoint{
		{Year: 2027, Month: 2, Goal: 0},
		{Year: 2026, Month: 1, Goal: 3},
		{Year: 2026, Month: 7, Goal: 2},
	}}
	cases := []struct{ year, month, want int }{
		{2025, 12, 0}, // antes do primeiro checkpoint
		{2026, 1, 3},
		{2026, 6, 3},
		{2026, 7, 2},
		{2027, 1, 2},
		{2027, 2, 0}, // job site acabou
		{2027, 9, 0},
	}
	for _, c := range cases {
		if got := g.GoalFor(c.year, c.month); got != c.want {
			t.Errorf("GoalFor(%d, %d) = %d, want %d", c.year, c.month, got, c.want)
		}
	}
}
