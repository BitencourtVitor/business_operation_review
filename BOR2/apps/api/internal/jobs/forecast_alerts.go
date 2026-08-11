package jobs

import (
	"context"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

const plotPlanAlertType = "toll_plot_plan_2_months"

type ForecastAlertsConfig struct {
	DB         *pgxpool.Pool
	Email      service.EmailSender
	Recipients *service.AlertRecipientDirectory
	Triggers   *service.EmailTriggerService

	// Legacy composition fields kept so older startup wiring remains source
	// compatible while delivery is routed through Gmail API.
	SMTPHost     string
	SMTPPort     string
	GmailUser    string
	GmailPass    string
	AlertDays    int
	ForecastRepo interface{}
}

// NewForecastAlertsJob creates one idempotent Plot Plan alert per job, ahead
// of the reference date by the window configured in Settings → Email Triggers.
// It ticks hourly and only acts on the configured hour, so changing that hour
// on the screen takes effect without a deploy.
func NewForecastAlertsJob(cfg ForecastAlertsConfig) Job {
	if cfg.DB == nil {
		if provider, ok := cfg.ForecastRepo.(interface{ Pool() *pgxpool.Pool }); ok {
			cfg.DB = provider.Pool()
		}
	}
	if cfg.Email == nil {
		cfg.Email = service.NewGmailAPISenderFromEnv()
	}
	if cfg.Recipients == nil && cfg.DB != nil {
		cfg.Recipients = service.NewAlertRecipientDirectory(cfg.DB)
	}
	if cfg.Triggers == nil && cfg.DB != nil {
		cfg.Triggers = service.NewEmailTriggerService(cfg.DB)
	}
	return Job{
		Name:      "forecast-plot-plan-alerts",
		DailyHour: -1,
		Interval:  time.Hour,
		Run: func(ctx context.Context) error {
			return runForecastAlerts(ctx, cfg, time.Now())
		},
	}
}

// plotPlanDateFields whitelists what can be interpolated into the query. The
// value comes from the settings screen, so it never reaches SQL as free text.
var plotPlanDateFields = map[string]bool{
	"previous_start_date": true,
	"previous_beams_date": true,
	"previous_end_date":   true,
}

type plotPlanProject struct {
	ID        string
	Name      string
	Address   string
	StartDate time.Time
}

func runForecastAlerts(ctx context.Context, cfg ForecastAlertsConfig, now time.Time) error {
	if cfg.DB == nil || cfg.Email == nil || cfg.Triggers == nil {
		return fmt.Errorf("forecast alert dependencies are not configured")
	}
	due, trigger, err := cfg.Triggers.ShouldRun(ctx, service.TriggerForecastPlotPlan, now)
	if err != nil {
		return err
	}
	if !due {
		return nil
	}

	client := strings.ToLower(strings.TrimSpace(trigger.ParamString("client", "toll brothers")))
	dateField := trigger.ParamString("date_field", "previous_start_date")
	if !plotPlanDateFields[dateField] {
		return fmt.Errorf("invalid Plot Plan reference date %q", dateField)
	}
	offsetMonths, offsetDays := 0, 0
	if trigger.ParamString("offset_unit", "months") == "months" {
		offsetMonths = trigger.ParamInt("offset_value", 2)
	} else {
		offsetDays = trigger.ParamInt("offset_value", 60)
	}

	today := forecastEasternDay(now)
	rows, err := cfg.DB.Query(ctx, fmt.Sprintf(`
		SELECT id,
		       COALESCE(NULLIF(name, ''), NULLIF(lote_bld, ''), id),
		       COALESCE(address, ''),
		       %[1]s
		FROM forecast_core
		WHERE lower(trim(cliente)) = $2
		  AND %[1]s IS NOT NULL
		  AND %[1]s > $1
		  AND (%[1]s - make_interval(months => $3, days => $4))::date <= $1
		  AND lower(COALESCE(status, '')) NOT IN ('closed', 'cancelled')
		ORDER BY %[1]s, id
	`, dateField), today, client, offsetMonths, offsetDays)
	if err != nil {
		return fmt.Errorf("fetch Plot Plan alerts: %w", err)
	}
	defer rows.Close()

	var projects []plotPlanProject
	for rows.Next() {
		var project plotPlanProject
		if err := rows.Scan(&project.ID, &project.Name, &project.Address, &project.StartDate); err != nil {
			return err
		}
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	to, cc, err := cfg.Triggers.Recipients(ctx, service.TriggerForecastPlotPlan)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		logger.Info("forecast-plot-plan-alerts: no primary recipients")
		return nil
	}

	for _, project := range projects {
		targetDate := project.StartDate.AddDate(0, -offsetMonths, -offsetDays)
		var alreadySent bool
		if err := cfg.DB.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM forecast_email_deliveries
				WHERE project_id=$1 AND alert_type=$2 AND target_date=$3
			)
		`, project.ID, plotPlanAlertType, targetDate).Scan(&alreadySent); err != nil {
			return err
		}
		if alreadySent {
			continue
		}

		subject := "Plot Plan due — " + project.Name
		text := fmt.Sprintf("Prepare the Plot Plan for %s.\nAddress: %s\nForecast date: %s\nAlert target: %s",
			project.Name, project.Address, project.StartDate.Format("Jan 02, 2006"), targetDate.Format("Jan 02, 2006"))
		htmlBody := fmt.Sprintf("<p>Prepare the <strong>Plot Plan</strong> for <strong>%s</strong>.</p><p>Address: %s<br>Forecast date: %s<br>Alert target: %s</p>",
			html.EscapeString(project.Name), html.EscapeString(project.Address), project.StartDate.Format("Jan 02, 2006"), targetDate.Format("Jan 02, 2006"))
		delivery, err := cfg.Email.Send(ctx, service.EmailMessage{To: to, CC: cc, Subject: subject, Text: text, HTML: htmlBody})
		if err != nil {
			cfg.Triggers.LogDelivery(ctx, service.TriggerDelivery{
				TriggerKey: service.TriggerForecastPlotPlan, Subject: subject, To: to, CC: cc,
				Context: project.Name, Status: "failed", Error: err.Error(),
			})
			return fmt.Errorf("send Plot Plan alert for %s: %w", project.ID, err)
		}
		cfg.Triggers.LogDelivery(ctx, service.TriggerDelivery{
			TriggerKey: service.TriggerForecastPlotPlan, Subject: subject, To: to, CC: cc,
			Context: project.Name,
		})
		if _, err := cfg.DB.Exec(ctx, `
			INSERT INTO forecast_email_deliveries (project_id, alert_type, target_date, delivery_id)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT DO NOTHING
		`, project.ID, plotPlanAlertType, targetDate, delivery.ID); err != nil {
			return err
		}
		logger.Info("forecast Plot Plan email accepted", "project", project.ID, "delivery_id", delivery.ID)
	}
	return nil
}

func forecastEasternDay(now time.Time) time.Time {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}
