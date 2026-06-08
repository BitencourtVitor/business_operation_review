// qbtime-sync-cron refreshes the Period Reports cache by POSTing to the API's
// /qbtime/period-report/sync endpoint. Run it daily (e.g. just after midnight)
// so each morning the report serves yesterday's punches from the database and a
// rolling 14-day window is re-synced to absorb any timesheet corrections.
//
// Deploy as a Railway Cron Job service pointing at this binary:
//   Schedule : 0 5 * * *   (05:00 UTC ≈ just after midnight US Eastern)
//
// Required env vars (set on the Railway Cron Job service):
//   API_URL     — public or internal URL of the BOR2 API service
//   CRON_SECRET — must match the CRON_SECRET configured on the API service
//
// Optional:
//   SYNC_DAYS   — how many days back to re-sync (default 14). Set to e.g. 100
//                 for a one-off backfill run.
package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		fatalf("API_URL env var is required")
	}
	secret := os.Getenv("CRON_SECRET")
	if secret == "" {
		fatalf("CRON_SECRET env var is required")
	}
	days := os.Getenv("SYNC_DAYS")
	if days == "" {
		days = "14"
	}

	url := fmt.Sprintf("%s/api/v1/qbtime/period-report/sync?days=%s", apiURL, days)
	fmt.Printf("[qbtime-sync-cron] %s — POST %s\n", time.Now().UTC().Format(time.RFC3339), url)

	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Cron-Secret", secret)

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		fatalf("http call: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		fatalf("API returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	fmt.Printf("[qbtime-sync-cron] Success: %s\n", string(body))
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[qbtime-sync-cron] FATAL: "+format+"\n", args...)
	os.Exit(1)
}
