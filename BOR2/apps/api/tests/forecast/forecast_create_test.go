package forecast_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/gofiber/fiber/v2"
)

// minimalPayload — no date fields at all
const minimalPayload = `{
	"cliente":      "Test Client",
	"jobSite":      "Test Site",
	"type":         "",
	"loteBld":      "",
	"address":      "",
	"status":       "planned",
	"obs":          "",
	"previousBeamsDate": null,
	"previousStartDate": null,
	"previousEndDate":   null,
	"hvac":         false,
	"buildertrend": false,
	"storage":      false,
	"qbTime":       false,
	"company":      "framing",
	"name":         "",
	"contractValue": 0,
	"team":         "",
	"machineProvider": ""
}`

// withStartDateNull — startDate/endDate explicitly null (Go time.Time accepts this)
const withStartDateNull = `{
	"cliente":      "Test Client",
	"jobSite":      "Test Site",
	"status":       "planned",
	"startDate":    null,
	"endDate":      null,
	"previousBeamsDate": null,
	"previousStartDate": null,
	"previousEndDate":   null,
	"hvac": false, "buildertrend": false, "storage": false, "qbTime": false,
	"company": "framing", "name": "", "contractValue": 0, "team": "", "machineProvider": ""
}`

// withISODates — user picked dates via DatePickerField (returns YYYY-MM-DD) — MUST FAIL
const withISODates = `{
	"cliente":      "Test Client",
	"jobSite":      "Test Site",
	"status":       "planned",
	"previousBeamsDate": "2025-06-01",
	"previousStartDate": "2025-06-15",
	"previousEndDate":   "2025-12-31",
	"hvac": false, "buildertrend": false, "storage": false, "qbTime": false,
	"company": "framing", "name": "", "contractValue": 0, "team": "", "machineProvider": ""
}`

// withRFC3339Dates — after frontend conversion (YYYY-MM-DDTHH:MM:SSZ) — MUST PASS
const withRFC3339Dates = `{
	"cliente":      "Test Client",
	"jobSite":      "Test Site",
	"status":       "planned",
	"previousBeamsDate": "2025-06-01T00:00:00Z",
	"previousStartDate": "2025-06-15T00:00:00Z",
	"previousEndDate":   "2025-12-31T00:00:00Z",
	"hvac": false, "buildertrend": false, "storage": false, "qbTime": false,
	"company": "framing", "name": "", "contractValue": 0, "team": "", "machineProvider": ""
}`

func fiberApp() *fiber.App {
	app := fiber.New()
	app.Post("/test", func(c *fiber.Ctx) error {
		var p domain.ForecastProject
		if err := c.BodyParser(&p); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"ok": true, "company": p.Company, "cliente": p.Cliente})
	})
	return app
}

func sendJSON(app *fiber.App, payload string) (int, string) {
	req := httptest.NewRequest("POST", "/test", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req, -1)
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func TestForecastCreateBodyParsing(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		wantOk  bool
	}{
		{"minimal (null dates)", minimalPayload, true},
		{"startDate/endDate null (time.Time accepts null)", withStartDateNull, true},
		{"ISO dates YYYY-MM-DD — should FAIL", withISODates, false},
		{"RFC3339 dates after frontend conversion — should PASS", withRFC3339Dates, true},
	}

	app := fiberApp()

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// json.Unmarshal directly
			var p domain.ForecastProject
			unmarshalErr := json.Unmarshal([]byte(tc.payload), &p)

			// Fiber BodyParser (same as handler)
			status, body := sendJSON(app, tc.payload)

			if tc.wantOk {
				if unmarshalErr != nil {
					t.Errorf("json.Unmarshal: expected OK, got error: %v", unmarshalErr)
				}
				if status != 200 {
					t.Errorf("BodyParser: expected 200, got %d. body: %s", status, body)
				}
			} else {
				if unmarshalErr == nil {
					t.Logf("json.Unmarshal: expected error but got OK (field may be silently ignored)")
				} else {
					t.Logf("json.Unmarshal error (expected): %v", unmarshalErr)
				}
				if status == 200 {
					t.Errorf("BodyParser: expected failure but got 200. body: %s", body)
				} else {
					t.Logf("BodyParser: got expected %d. body: %s", status, body)
				}
			}
		})
	}
}
