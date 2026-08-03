package main

import (
	"testing"
	"time"
)

func TestRequestForDate(t *testing.T) {
	location, err := time.LoadLocation(businessTimezone)
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	tests := []struct {
		name      string
		now       time.Time
		shouldRun bool
		want      calculateRequest
	}{
		{
			name:      "September run closes August",
			now:       time.Date(2026, time.September, 1, 3, 5, 0, 0, time.UTC),
			shouldRun: true,
			want: calculateRequest{
				ExecutionMonth: 8,
				ExecutionYear:  2026,
				Month:          9,
				Year:           2026,
			},
		},
		{
			name:      "UTC month boundary is still previous local day",
			now:       time.Date(2026, time.September, 1, 2, 59, 0, 0, time.UTC),
			shouldRun: false,
		},
		{
			name:      "January run closes previous year",
			now:       time.Date(2027, time.January, 1, 3, 5, 0, 0, time.UTC),
			shouldRun: true,
			want: calculateRequest{
				ExecutionMonth: 12,
				ExecutionYear:  2026,
				Month:          1,
				Year:           2027,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, shouldRun := requestForDate(tt.now, location)
			if shouldRun != tt.shouldRun {
				t.Fatalf("shouldRun = %v, want %v", shouldRun, tt.shouldRun)
			}
			if got != tt.want {
				t.Fatalf("request = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestCalculateEndpoint(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
		want    string
		wantErr bool
	}{
		{
			name:    "base URL without trailing slash",
			baseURL: "https://api.example.com",
			want:    "https://api.example.com/api/v1/ofi/calculate",
		},
		{
			name:    "base URL with trailing slash",
			baseURL: "https://api.example.com/",
			want:    "https://api.example.com/api/v1/ofi/calculate",
		},
		{
			name:    "base URL with whitespace and path",
			baseURL: " https://api.example.com/root/ ",
			want:    "https://api.example.com/root/api/v1/ofi/calculate",
		},
		{
			name:    "relative URL",
			baseURL: "api.example.com",
			wantErr: true,
		},
		{
			name:    "URL with query",
			baseURL: "https://api.example.com?token=nope",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculateEndpoint(tt.baseURL)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("endpoint = %q, want %q", got, tt.want)
			}
		})
	}
}
