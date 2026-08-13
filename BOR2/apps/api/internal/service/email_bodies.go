package service

import (
	"fmt"
	"html"
	"strings"
	"time"
)

// Every automatic e-mail is composed here, and nowhere else. The jobs call
// these to send and the preview endpoint calls them to render, so what the
// settings screen shows is the same text that actually goes out.

const emailDateLayout = "Jan 02, 2006"

// usDate turns the ISO dates that travel through the system into the format
// the people reading these e-mails actually use. Anything unparseable is left
// alone rather than replaced with a wrong date.
func usDate(value string) string {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return value
	}
	return parsed.Format("01/02/2006")
}

// EmailBody is a composed message minus its recipients.
type EmailBody struct {
	Subject string `json:"subject"`
	Text    string `json:"text"`
	HTML    string `json:"html"`
}

func emailTable(headers []string, rows [][]string) string {
	var out strings.Builder
	out.WriteString(`<table style="border-collapse:collapse;width:100%;font-size:14px">`)
	out.WriteString(`<thead><tr>`)
	for _, header := range headers {
		out.WriteString(`<th style="text-align:left;border-bottom:1px solid #ccc;padding:8px">` + html.EscapeString(header) + `</th>`)
	}
	out.WriteString(`</tr></thead><tbody>`)
	for _, row := range rows {
		out.WriteString(`<tr>`)
		for _, cell := range row {
			out.WriteString(`<td style="padding:8px;border-bottom:1px solid #eee">` + html.EscapeString(cell) + `</td>`)
		}
		out.WriteString(`</tr>`)
	}
	out.WriteString(`</tbody></table>`)
	return out.String()
}

// ── Fieldwire documents missing ───────────────────────────────────────────────

type FieldwireMissingProject struct {
	// JobSite is the community; Unit is the lot or building inside it. Both
	// are needed to identify a job: the unit number repeats across sites.
	JobSite          string
	Unit             string
	Address          string
	Client           string
	ReferenceLabel   string
	ReferenceDate    time.Time
	TargetDate       time.Time
	MissingDocuments []string
}

// FieldwireSubject is also what the delivery history shows, so both name a job
// the same way.
func FieldwireSubject(jobSite, unit string) string {
	label := strings.TrimSpace(jobSite)
	if unit = strings.TrimSpace(unit); unit != "" {
		if label == "" {
			label = unit
		} else {
			label += " - " + unit
		}
	}
	return "Fieldwire Documents Alert | " + label
}

func BuildFieldwireMissingEmail(project FieldwireMissingProject) EmailBody {
	subject := FieldwireSubject(project.JobSite, project.Unit)

	var textRows strings.Builder
	rows := make([][]string, 0, len(project.MissingDocuments))
	for _, document := range project.MissingDocuments {
		textRows.WriteString("- " + document + "\n")
		rows = append(rows, []string{document})
	}

	text := fmt.Sprintf(
		"%s at %s (%s) is approaching its %s and the documents below are still missing in Fieldwire.\n\n"+
			"Address: %s\n%s: %s\nAlert target: %s\n\nMissing documents:\n%s",
		project.Unit, project.JobSite, project.Client, strings.ToLower(project.ReferenceLabel),
		project.Address, project.ReferenceLabel, project.ReferenceDate.Format(emailDateLayout),
		project.TargetDate.Format(emailDateLayout), textRows.String(),
	)

	htmlBody := fmt.Sprintf(
		`<p><strong>%s</strong> at <strong>%s</strong> (%s) is approaching its %s and the documents below are still missing in Fieldwire.</p>`+
			`<p style="color:#555;font-size:13px">Address: %s<br>%s: <strong>%s</strong><br>Alert target: %s</p>%s`,
		html.EscapeString(project.Unit), html.EscapeString(project.JobSite),
		html.EscapeString(project.Client), html.EscapeString(strings.ToLower(project.ReferenceLabel)),
		html.EscapeString(project.Address), html.EscapeString(project.ReferenceLabel),
		project.ReferenceDate.Format(emailDateLayout), project.TargetDate.Format(emailDateLayout),
		emailTable([]string{"Missing document"}, rows),
	)

	return EmailBody{Subject: subject, Text: text, HTML: htmlBody}
}

// ── Workers' Compensation ─────────────────────────────────────────────────────

type WorkersCompRow struct {
	ContractorName string
	Divisions      string
}

// The list is what has to be checked, so every row is pending by definition —
// a status column would carry the same word on every line.
func BuildWorkersCompReviewEmail(reviewDate string, checks []WorkersCompRow) EmailBody {
	var textRows strings.Builder
	rows := make([][]string, 0, len(checks))
	for _, check := range checks {
		textRows.WriteString(fmt.Sprintf("- %s | %s\n", check.ContractorName, check.Divisions))
		rows = append(rows, []string{check.ContractorName, check.Divisions})
	}
	return EmailBody{
		Subject: "Workers' Compensation Review — " + usDate(reviewDate),
		Text:    "Review each eligible subcontractor below and record Regular or Irregular in BOR.\n\n" + textRows.String(),
		HTML: `<p>Review each eligible subcontractor below and record <strong>Regular</strong> or <strong>Irregular</strong> in BOR.</p>` +
			emailTable([]string{"Subcontractor", "Divisions"}, rows),
	}
}

// WorkersCompResultRow is one subcontractor as the cycle left it.
type WorkersCompResultRow struct {
	ContractorName string
	Divisions      string
	Notes          string
}

// The blocks read in the order the reader needs them: what demands action, then
// what was never answered, then what is fine. Pending is skipped when empty —
// nobody should be left unchecked, so its presence is itself the message.
func BuildWorkersCompResultEmail(reviewDate string, irregular, pending, regular []WorkersCompResultRow) EmailBody {
	blocks := []struct {
		title string
		rows  []WorkersCompResultRow
	}{
		{"Irregular", irregular},
		{"Not checked", pending},
		{"Regular", regular},
	}

	var text, htmlOut strings.Builder
	for _, block := range blocks {
		if len(block.rows) == 0 {
			continue
		}
		text.WriteString(fmt.Sprintf("%s (%d)\n", block.title, len(block.rows)))
		table := make([][]string, 0, len(block.rows))
		for _, row := range block.rows {
			line := fmt.Sprintf("- %s | %s", row.ContractorName, row.Divisions)
			if note := strings.TrimSpace(row.Notes); note != "" {
				line += " — " + note
			}
			text.WriteString(line + "\n")
			table = append(table, []string{row.ContractorName, row.Divisions, strings.TrimSpace(row.Notes)})
		}
		text.WriteString("\n")
		htmlOut.WriteString(fmt.Sprintf(`<h3 style="margin:16px 0 8px;font-size:15px">%s (%d)</h3>`,
			html.EscapeString(block.title), len(block.rows)))
		htmlOut.WriteString(emailTable([]string{"Subcontractor", "Divisions", "Notes"}, table))
	}

	total := len(irregular) + len(pending) + len(regular)
	if total == 0 {
		text.WriteString("No subcontractor was eligible for this cycle.\n")
		htmlOut.WriteString(`<p>No subcontractor was eligible for this cycle.</p>`)
	}

	return EmailBody{
		Subject: fmt.Sprintf("Workers' Compensation Result — %s (%d irregular)", usDate(reviewDate), len(irregular)),
		Text:    fmt.Sprintf("Result of the review opened on %s.\n\n%s", usDate(reviewDate), text.String()),
		HTML: fmt.Sprintf(`<p>Result of the review opened on <strong>%s</strong>.</p>`, html.EscapeString(usDate(reviewDate))) +
			htmlOut.String(),
	}
}

// ── Absence ───────────────────────────────────────────────────────────────────

type AbsenceRow struct {
	EmployeeName string
	TeamName     string
	DaysCount    int
	StartDate    string
}

func BuildAbsenceEmail(company string, alertDays int, events []AbsenceRow) EmailBody {
	label := strings.ToUpper(company)
	var textRows strings.Builder
	rows := make([][]string, 0, len(events))
	for _, event := range events {
		since := usDate(event.StartDate)
		textRows.WriteString(fmt.Sprintf("%s (%s) — %d business days, since %s\n",
			event.EmployeeName, event.TeamName, event.DaysCount, since))
		rows = append(rows, []string{event.EmployeeName, event.TeamName, fmt.Sprint(event.DaysCount), since})
	}
	subject := fmt.Sprintf("%s — %d employee(s) without clock-in", label, len(events))
	return EmailBody{
		Subject: subject,
		Text:    fmt.Sprintf("No punch for %d+ business days:\n\n%s", alertDays, textRows.String()),
		HTML: fmt.Sprintf(`<p>No clock-in was found for %d consecutive evaluated business days.</p>`, alertDays) +
			emailTable([]string{"Employee", "Team", "Days", "Since"}, rows),
	}
}

// ── Preview samples ───────────────────────────────────────────────────────────

// previewSample builds each e-mail from invented data. The job is named in the
// text so nobody mistakes a preview for a real notification.
func previewSample(key string, cfg *TriggerConfig) EmailBody {
	sampleDate := time.Date(2026, time.October, 14, 0, 0, 0, 0, time.UTC)

	switch key {
	case TriggerForecastPlotPlan:
		months, days := 0, 0
		if cfg.ParamString("offset_unit", "months") == "months" {
			months = cfg.ParamInt("offset_value", 2)
		} else {
			days = cfg.ParamInt("offset_value", 60)
		}
		documents := cfg.ParamStrings("documents")
		if len(documents) == 0 {
			documents = []string{"Plot Plan", "Structural Plan"}
		}
		clients := cfg.ParamStrings("clients")
		client := "Toll Brothers"
		if len(clients) > 0 {
			client = clients[0]
		}
		return BuildFieldwireMissingEmail(FieldwireMissingProject{
			JobSite:          "SAMPLE — Willow Ridge at Sample, MA",
			Unit:             "Lot 128",
			Address:          "1420 Sample Ridge Dr, Sample City",
			Client:           client,
			ReferenceLabel:   ReferenceLabel(cfg.ParamString("date_field", "previous_start_date")),
			ReferenceDate:    sampleDate,
			TargetDate:       sampleDate.AddDate(0, -months, -days),
			MissingDocuments: documents,
		})

	case TriggerWorkersCompReview:
		return BuildWorkersCompReviewEmail(sampleDate.Format(workersCompDateLayout), []WorkersCompRow{
			{ContractorName: "SAMPLE — Ace Drywall LLC", Divisions: "Framing"},
			{ContractorName: "SAMPLE — Northline Concrete", Divisions: "HVAC, PCG"},
		})

	case TriggerWorkersCompResult:
		return BuildWorkersCompResultEmail(sampleDate.Format(workersCompDateLayout),
			[]WorkersCompResultRow{
				{ContractorName: "SAMPLE — Northline Concrete", Divisions: "HVAC, PCG", Notes: "Policy expired 09/30"},
			},
			[]WorkersCompResultRow{
				{ContractorName: "SAMPLE — Ridge Framing Co", Divisions: "Framing"},
			},
			[]WorkersCompResultRow{
				{ContractorName: "SAMPLE — Ace Drywall LLC", Divisions: "Framing", Notes: "Certificate on file"},
			})

	case TriggerQBTimeAbsence:
		return BuildAbsenceEmail("framing", cfg.ParamInt("alert_days", 2), []AbsenceRow{
			{EmployeeName: "SAMPLE — John Carter", TeamName: "Framing Crew A", DaysCount: 2, StartDate: "2026-10-12"},
			{EmployeeName: "SAMPLE — Maria Lopes", TeamName: "Framing Crew B", DaysCount: 3, StartDate: "2026-10-09"},
		})
	}
	return EmailBody{Subject: "No preview available", Text: "", HTML: "<p>No preview available for this trigger.</p>"}
}

func ReferenceLabel(field string) string {
	switch field {
	case "previous_beams_date":
		return "Beams date"
	case "previous_end_date":
		return "End date"
	default:
		return "Start date"
	}
}
