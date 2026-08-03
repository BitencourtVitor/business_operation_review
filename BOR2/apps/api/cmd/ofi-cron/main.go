// ofi-cron closes the previous month and plans the current month through the
// API's /ofi/calculate endpoint.
//
// Railway schedule: 5 3 1 * * (00:05 America/Sao_Paulo on the first day).
// The local-date guard prevents deploys or accidental starts from calculating
// outside the intended monthly window.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	businessTimezone = "America/Sao_Paulo"
	calculatePath    = "/api/v1/ofi/calculate"
)

type calculateRequest struct {
	ExecutionMonth int `json:"executionMonth"`
	ExecutionYear  int `json:"executionYear"`
	Month          int `json:"month"`
	Year           int `json:"year"`
}

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		fatalf("API_URL env var is required")
	}
	secret := os.Getenv("CRON_SECRET")
	if secret == "" {
		fatalf("CRON_SECRET env var is required")
	}

	location, err := time.LoadLocation(businessTimezone)
	if err != nil {
		fatalf("load business timezone: %v", err)
	}

	now := time.Now()
	localNow := now.In(location)
	payload, shouldRun := requestForDate(now, location)
	if !shouldRun {
		fmt.Printf("[ofi-cron] %s is not the first day in %s; skipping.\n",
			localNow.Format("2006-01-02"), businessTimezone)
		return
	}

	endpoint, err := calculateEndpoint(apiURL)
	if err != nil {
		fatalf("invalid API_URL: %v", err)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		fatalf("encode request: %v", err)
	}

	fmt.Printf(
		"[ofi-cron] Closing %04d-%02d and planning %04d-%02d (local date %s)\n",
		payload.ExecutionYear,
		payload.ExecutionMonth,
		payload.Year,
		payload.Month,
		localNow.Format("2006-01-02"),
	)

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
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

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fatalf("read response: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		fatalf("API returned HTTP %d: %s", resp.StatusCode, string(responseBody))
	}

	fmt.Printf("[ofi-cron] Success: %s\n", string(responseBody))
}

func requestForDate(now time.Time, location *time.Location) (calculateRequest, bool) {
	localNow := now.In(location)
	if localNow.Day() != 1 {
		return calculateRequest{}, false
	}

	planningMonth := time.Date(localNow.Year(), localNow.Month(), 1, 0, 0, 0, 0, location)
	executionMonth := planningMonth.AddDate(0, -1, 0)

	return calculateRequest{
		ExecutionMonth: int(executionMonth.Month()),
		ExecutionYear:  executionMonth.Year(),
		Month:          int(planningMonth.Month()),
		Year:           planningMonth.Year(),
	}, true
}

func calculateEndpoint(rawBaseURL string) (string, error) {
	baseURL := strings.TrimSpace(rawBaseURL)
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", fmt.Errorf("must be an absolute HTTP(S) URL")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("must not contain a query or fragment")
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/") + calculatePath
	parsed.RawPath = ""
	return parsed.String(), nil
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[ofi-cron] FATAL: "+format+"\n", args...)
	os.Exit(1)
}
