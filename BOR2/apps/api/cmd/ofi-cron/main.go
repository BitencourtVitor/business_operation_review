// ofi-cron runs the OFI calculator by POSTing to the API's /ofi/calculate endpoint.
//
// Deploy as a Railway Cron Job service pointing at this binary:
//   Schedule : 0 23 28-31 * *   (23:00 UTC on days 28–31)
//   The binary itself verifies it is the last day of the month before firing.
//
// Required env vars (set in the Railway Cron Job service):
//   API_URL     — public or internal URL of the BOR2 API service
//                 e.g. https://bor2-api.up.railway.app
//   CRON_SECRET — must match the CRON_SECRET env var configured on the API service
package main

import (
	"bytes"
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

	// Guard: only run on the last day of the month
	now      := time.Now().UTC()
	tomorrow := now.AddDate(0, 0, 1)
	if tomorrow.Month() == now.Month() {
		fmt.Printf("[ofi-cron] %s is not the last day of the month — skipping.\n",
			now.Format("2006-01-02"))
		os.Exit(0)
	}

	fmt.Printf("[ofi-cron] Last day of month detected (%s) — triggering OFI calculate\n",
		now.Format("2006-01-02"))

	req, err := http.NewRequest(http.MethodPost,
		apiURL+"/api/v1/ofi/calculate",
		bytes.NewReader([]byte("{}")),
	)
	if err != nil {
		fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Cron-Secret", secret)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fatalf("http call: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		fatalf("API returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	fmt.Printf("[ofi-cron] Success: %s\n", string(body))
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[ofi-cron] FATAL: "+format+"\n", args...)
	os.Exit(1)
}
