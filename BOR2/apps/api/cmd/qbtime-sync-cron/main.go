// qbtime-sync-cron does two things daily, back to back:
//  1. Refreshes the Period Reports cache by POSTing to /qbtime/period-report/sync,
//     so each morning the report serves yesterday's punches from the database and a
//     rolling 30-day window is re-synced to absorb any timesheet corrections.
//  2. Refreshes workforce_productivity for every company by POSTing to
//     /qbtime/workforce-import for the current month and the previous month (so
//     late-closed timesheets and corrections in the tail of last month are
//     absorbed too). Replaces the manual "QB Time Import" button click that used
//     to be required every month for each company.
//
// Deploy as a Railway Cron Job service pointing at this binary:
//   Schedule : 0 5 * * *   (05:00 UTC ≈ just after midnight US Eastern)
//
// Required env vars (set on the Railway Cron Job service):
//   API_URL     — public or internal URL of the BOR2 API service
//   CRON_SECRET — must match the CRON_SECRET configured on the API service
//
// Optional:
//   SYNC_DAYS   — how many days back to re-sync period reports (default 30,
//                 covers 2 pay periods). Set to e.g. 100 for a one-off backfill.
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

var workforceCompanies = []string{"Framing", "PCG", "HVAC"}

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		fatalf("API_URL env var is required")
	}
	secret := os.Getenv("CRON_SECRET")
	if secret == "" {
		fatalf("CRON_SECRET env var is required")
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	failed := false

	if err := syncPeriodReports(client, apiURL, secret); err != nil {
		fmt.Printf("[qbtime-sync-cron] period-report sync FAILED: %v\n", err)
		failed = true
	} else {
		fmt.Println("[qbtime-sync-cron] period-report sync OK")
	}

	if err := syncWorkforce(client, apiURL, secret); err != nil {
		failed = true
	}

	if failed {
		os.Exit(1)
	}
}

func syncPeriodReports(client *http.Client, apiURL, secret string) error {
	days := os.Getenv("SYNC_DAYS")
	if days == "" {
		days = "30"
	}

	url := fmt.Sprintf("%s/api/v1/qbtime/period-report/sync?days=%s", apiURL, days)
	fmt.Printf("[qbtime-sync-cron] %s — POST %s\n", time.Now().UTC().Format(time.RFC3339), url)

	req, err := http.NewRequest(http.MethodPost, url, nil)
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
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned HTTP %d: %s", resp.StatusCode, string(body))
	}
	fmt.Printf("[qbtime-sync-cron] Success: %s\n", string(body))
	return nil
}

func syncWorkforce(client *http.Client, apiURL, secret string) error {
	now := time.Now().UTC()
	currentMonth := now.Format("2006-01")
	previousMonth := now.AddDate(0, -1, 0).Format("2006-01")

	anyFailed := false
	for _, month := range []string{previousMonth, currentMonth} {
		for _, company := range workforceCompanies {
			if err := importWorkforceOne(client, apiURL, secret, company, month); err != nil {
				fmt.Printf("[qbtime-sync-cron] workforce-import FAILED company=%s month=%s error=%v\n", company, month, err)
				anyFailed = true
				continue
			}
			fmt.Printf("[qbtime-sync-cron] workforce-import OK company=%s month=%s\n", company, month)
		}
	}
	if anyFailed {
		return fmt.Errorf("one or more workforce-import calls failed")
	}
	return nil
}

func importWorkforceOne(client *http.Client, apiURL, secret, company, month string) error {
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
	fmt.Fprintf(os.Stderr, "[qbtime-sync-cron] FATAL: "+format+"\n", args...)
	os.Exit(1)
}
