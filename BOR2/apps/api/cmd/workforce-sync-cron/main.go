// workforce-sync-cron keeps workforce_productivity populated automatically by
// POSTing to the API's /qbtime/workforce-import endpoint for every company,
// for both the current month and the previous month (so late-closed
// timesheets and corrections in the tail of last month are absorbed too).
// Replaces the manual "QB Time Import" button click that used to be required
// every month for each company.
//
// Deploy as a Railway Cron Job service pointing at this binary:
//   Schedule : 0 6 * * *   (06:00 UTC, after qbtime-sync-cron at 05:00 UTC)
//
// Required env vars (set on the Railway Cron Job service):
//   API_URL     — public or internal URL of the BOR2 API service
//   CRON_SECRET — must match the CRON_SECRET configured on the API service
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

var companies = []string{"Framing", "PCG", "HVAC"}

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		fatalf("API_URL env var is required")
	}
	secret := os.Getenv("CRON_SECRET")
	if secret == "" {
		fatalf("CRON_SECRET env var is required")
	}

	now := time.Now().UTC()
	currentMonth := now.Format("2006-01")
	previousMonth := now.AddDate(0, -1, 0).Format("2006-01")

	client := &http.Client{Timeout: 5 * time.Minute}
	failed := false

	for _, month := range []string{previousMonth, currentMonth} {
		for _, company := range companies {
			if err := importOne(client, apiURL, secret, company, month); err != nil {
				fmt.Printf("[workforce-sync-cron] FAILED company=%s month=%s error=%v\n", company, month, err)
				failed = true
				continue
			}
			fmt.Printf("[workforce-sync-cron] OK company=%s month=%s\n", company, month)
		}
	}

	if failed {
		os.Exit(1)
	}
}

func importOne(client *http.Client, apiURL, secret, company, month string) error {
	payload, _ := json.Marshal(map[string]any{
		"company":   company,
		"month":     month,
		"overwrite": true,
	})

	req, err := http.NewRequest(http.MethodPost, apiURL+"/api/v1/qbtime/workforce-import", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Cron-Secret", secret)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("http call: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("API returned HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[workforce-sync-cron] FATAL: "+format+"\n", args...)
	os.Exit(1)
}
