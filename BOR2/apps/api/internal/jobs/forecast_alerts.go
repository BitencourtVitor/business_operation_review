package jobs

import (
	"context"
	"fmt"
	"html"
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

	// Legacy composition fields kept so older startup wiring remains source
	// compatible while delivery is routed through Gmail API.
	SMTPHost     string
	SMTPPort     string
	GmailUser    string
	GmailPass    string
	AlertDays    int
	ForecastRepo interface{}
}

// NewForecastAlertsJob creates one idempotent Plot Plan alert per Toll
// Brothers job, two calendar months before the forecast start date.
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
	return Job{
		Name:      "forecast-plot-plan-alerts",
		DailyHour: 12,
		Run: func(ctx context.Context) error {
			return runForecastAlerts(ctx, cfg, time.Now())
		},
	}
}

type plotPlanProject struct {
	ID        string
	Name      string
	Address   string
	StartDate time.Time
}

func runForecastAlerts(ctx context.Context, cfg ForecastAlertsConfig, now time.Time) error {
	if cfg.DB == nil || cfg.Email == nil || cfg.Recipients == nil {
		return fmt.Errorf("forecast alert dependencies are not configured")
	}
	today := forecastEasternDay(now)
	rows, err := cfg.DB.Query(ctx, `
		SELECT id,
		       COALESCE(NULLIF(name, ''), NULLIF(lote_bld, ''), id),
		       COALESCE(address, ''),
		       previous_start_date
		FROM forecast_core
		WHERE lower(trim(cliente)) = 'toll brothers'
		  AND previous_start_date > $1
		  AND (previous_start_date - INTERVAL '2 months')::date <= $1
		  AND lower(COALESCE(status, '')) NOT IN ('closed', 'cancelled')
		ORDER BY previous_start_date, id
	`, today)
	if err != nil {
		return fmt.Errorf("fetch Toll Brothers Plot Plan alerts: %w", err)
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

	to, cc, err := cfg.Recipients.Resolve(ctx)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		logger.Info("forecast-plot-plan-alerts: no primary recipients")
		return nil
	}

	for _, project := range projects {
		targetDate := project.StartDate.AddDate(0, -2, 0)
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
		text := fmt.Sprintf("Prepare the Plot Plan for %s.\nAddress: %s\nForecast start: %s\nTwo-month target: %s",
			project.Name, project.Address, project.StartDate.Format("Jan 02, 2006"), targetDate.Format("Jan 02, 2006"))
		htmlBody := fmt.Sprintf("<p>Prepare the <strong>Plot Plan</strong> for <strong>%s</strong>.</p><p>Address: %s<br>Forecast start: %s<br>Two-month target: %s</p>",
			html.EscapeString(project.Name), html.EscapeString(project.Address), project.StartDate.Format("Jan 02, 2006"), targetDate.Format("Jan 02, 2006"))
		delivery, err := cfg.Email.Send(ctx, service.EmailMessage{To: to, CC: cc, Subject: subject, Text: text, HTML: htmlBody})
		if err != nil {
			return fmt.Errorf("send Plot Plan alert for %s: %w", project.ID, err)
		}
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
