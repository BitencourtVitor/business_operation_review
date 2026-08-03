package handler

import "testing"

func TestValidOFIPeriod(t *testing.T) {
	tests := []struct {
		name  string
		month int
		year  int
		want  bool
	}{
		{name: "valid January", month: 1, year: 2026, want: true},
		{name: "valid December", month: 12, year: 2026, want: true},
		{name: "missing month", month: 0, year: 2026, want: false},
		{name: "month overflow", month: 13, year: 2026, want: false},
		{name: "year too old", month: 8, year: 1999, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := validOFIPeriod(test.month, test.year); got != test.want {
				t.Fatalf("validOFIPeriod(%d, %d) = %v, want %v", test.month, test.year, got, test.want)
			}
		})
	}
}
