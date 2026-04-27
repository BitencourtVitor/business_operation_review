// ofi-cron runs the OFI calculator by calling the API's /ofi/calculate endpoint.
// Intended to be deployed as a Railway Cron Job service:
//   Schedule: 0 23 28-31 * *   (23:00 UTC on days 28–31; runs only on last day due to month-end check)
//   Command:  ./ofi-cron
//
// Required env vars:
//   API_URL         — internal Railway URL of the API service, e.g. https://api.bor2.internal
//   API_CRON_SECRET — shared secret validated by the /ofi/calculate handler (optional but recommended)
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

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		fatal("API_URL env var is required")
	}
	secret := os.Getenv("API_CRON_SECRET")

	// Only fire on the actual last day of the month
	now := time.Now().UTC()
	tomorrow := now.AddDate(0, 0, 1)
	if tomorrow.Month() == now.Month() {
		fmt.Printf("[ofi-cron] Not the last day of the month (%s) — skipping.\n",
			now.Format("2006-01-02"))
		os.Exit(0)
	}

	fmt.Printf("[ofi-cron] Running OFI calculate for end-of-month %s\n",
		now.Format("2006-01-02"))

	body, _ := json.Marshal(map[string]any{})
	req, err := http.NewRequest(http.MethodPost, apiURL+"/api/v1/ofi/calculate", bytes.NewReader(body))
	if err != nil {
		fatal("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if secret != "" {
		req.Header.Set("X-Cron-Secret", secret)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fatal("http call: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		fatal("API returned %d: %s", resp.StatusCode, string(respBody))
	}

	fmt.Printf("[ofi-cron] Success: %s\n", string(respBody))
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[ofi-cron] ERROR: "+format+"\n", args...)
	os.Exit(1)
}
