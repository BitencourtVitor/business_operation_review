package jobs

import (
	"context"
	"fmt"
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
	JobSite   string
	Unit      string
	Address   string
	Client    string
	StartDate time.Time
	Missing   []string
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

	clients := trigger.ParamStrings("clients")
	if len(clients) == 0 {
		logger.Info("forecast-plot-plan-alerts: no client selected")
		return nil
	}
	documents := trigger.ParamStrings("documents")
	if len(documents) == 0 {
		logger.Info("forecast-plot-plan-alerts: no document selected")
		return nil
	}
	lowerClients := make([]string, 0, len(clients))
	for _, client := range clients {
		lowerClients = append(lowerClients, strings.ToLower(strings.TrimSpace(client)))
	}

	dateField := trigger.ParamString("date_field", "previous_start_date")
	if !plotPlanDateFields[dateField] {
		return fmt.Errorf("invalid Fieldwire alert reference date %q", dateField)
	}
	offsetMonths, offsetDays := 0, 0
	if trigger.ParamString("offset_unit", "months") == "months" {
		offsetMonths = trigger.ParamInt("offset_value", 2)
	} else {
		offsetDays = trigger.ParamInt("offset_value", 60)
	}

	// A document counts as missing when its row is absent or its status is
	// neither completed nor dispensed — the same two states the screen shows
	// as done. Jobs with nothing missing produce no row and no e-mail.
	today := forecastEasternDay(now)
	rows, err := cfg.DB.Query(ctx, fmt.Sprintf(`
		SELECT c.id,
		       COALESCE(c.job_site, ''),
		       -- "Lot 62" / "Building 4": the number alone repeats across sites.
		       trim(COALESCE(c.type, '') || ' ' || COALESCE(NULLIF(c.lote_bld, ''), c.name, '')),
		       COALESCE(c.address, ''),
		       COALESCE(c.cliente, ''),
		       c.%[1]s,
		       ARRAY(
		           SELECT d.document FROM unnest($5::text[]) AS d(document)
		           WHERE NOT EXISTS (
		               SELECT 1 FROM forecast_fieldwire f
		               WHERE f.project_id = c.id
		                 AND lower(trim(f.document)) = lower(trim(d.document))
		                 AND lower(COALESCE(f.status, '')) IN ('completed', 'dispensed')
		           )
		       ) AS missing
		FROM forecast_core c
		WHERE lower(trim(c.cliente)) = ANY($2::text[])
		  AND c.%[1]s IS NOT NULL
		  AND c.%[1]s > $1
		  AND (c.%[1]s - make_interval(months => $3, days => $4))::date <= $1
		  AND lower(COALESCE(c.status, '')) NOT IN ('closed', 'cancelled')
		ORDER BY c.%[1]s, c.id
	`, dateField), today, lowerClients, offsetMonths, offsetDays, documents)
	if err != nil {
		return fmt.Errorf("fetch Fieldwire missing-document alerts: %w", err)
	}
	defer rows.Close()

	var projects []plotPlanProject
	for rows.Next() {
		var project plotPlanProject
		if err := rows.Scan(&project.ID, &project.JobSite, &project.Unit, &project.Address,
			&project.Client, &project.StartDate, &project.Missing); err != nil {
			return err
		}
		if len(project.Missing) == 0 {
			continue
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

		body := service.BuildFieldwireMissingEmail(service.FieldwireMissingProject{
			JobSite:          project.JobSite,
			Unit:             project.Unit,
			Address:          project.Address,
			Client:           project.Client,
			ReferenceLabel:   service.ReferenceLabel(dateField),
			ReferenceDate:    project.StartDate,
			TargetDate:       targetDate,
			MissingDocuments: project.Missing,
		})
		delivery, err := cfg.Email.Send(ctx, service.EmailMessage{
			To: to, CC: cc, Subject: body.Subject, Text: body.Text, HTML: body.HTML,
		})
		if err != nil {
			cfg.Triggers.LogDelivery(ctx, service.TriggerDelivery{
				TriggerKey: service.TriggerForecastPlotPlan, Subject: body.Subject, To: to, CC: cc,
				Context: project.Unit, Status: "failed", Error: err.Error(),
			})
			return fmt.Errorf("send Fieldwire missing-document alert for %s: %w", project.ID, err)
		}
		cfg.Triggers.LogDelivery(ctx, service.TriggerDelivery{
			TriggerKey: service.TriggerForecastPlotPlan, Subject: body.Subject, To: to, CC: cc,
			Context: fmt.Sprintf("%s — %d missing", project.Unit, len(project.Missing)),
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
