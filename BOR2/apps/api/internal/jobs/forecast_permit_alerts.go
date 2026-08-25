package jobs

import (
	"context"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

const permitAlertType = "hvac_permit_missing"

// NewForecastPermitAlertsJob warns that an HVAC job is about to start with its
// Permit unfinished. Um e-mail por obra, como o alerta de Fieldwire: o assunto
// nomeia a obra, então quem recebe encaminha o aviso para quem resolve aquela
// obra sem ter que recortar uma linha de tabela.
//
// It ticks hourly and acts only on the configured hour, so changing that hour
// in Settings → Email Triggers takes effect without a deploy.
func NewForecastPermitAlertsJob(cfg ForecastAlertsConfig) Job {
	if cfg.DB == nil {
		if provider, ok := cfg.ForecastRepo.(interface{ Pool() *pgxpool.Pool }); ok {
			cfg.DB = provider.Pool()
		}
	}
	if cfg.Email == nil {
		cfg.Email = service.NewGmailAPISenderFromEnv()
	}
	if cfg.Triggers == nil && cfg.DB != nil {
		cfg.Triggers = service.NewEmailTriggerService(cfg.DB)
	}
	return Job{
		Name:      "forecast-permit-alerts",
		DailyHour: -1,
		Interval:  time.Hour,
		Run: func(ctx context.Context) error {
			return runForecastPermitAlerts(ctx, cfg, time.Now())
		},
	}
}

func runForecastPermitAlerts(ctx context.Context, cfg ForecastAlertsConfig, now time.Time) error {
	if cfg.DB == nil || cfg.Email == nil || cfg.Triggers == nil {
		return fmt.Errorf("permit alert dependencies are not configured")
	}
	due, trigger, err := cfg.Triggers.ShouldRun(ctx, service.TriggerForecastPermit, now)
	if err != nil {
		return err
	}
	if !due {
		return nil
	}

	offsetDays := trigger.ParamInt("offset_days", 30)
	if offsetDays <= 0 {
		offsetDays = 30
	}

	// A etapa conta como resolvida com o mesmo vocabulário do Fieldwire:
	// 'completed' foi feita, 'dispensed' não se aplica àquela obra. Qualquer
	// outra coisa — inclusive NULL — é pendência.
	today := forecastEasternDay(now)
	rows, err := cfg.DB.Query(ctx, `
		SELECT c.id,
		       COALESCE(c.job_site, ''),
		       trim(COALESCE(c.type, '') || ' ' || COALESCE(NULLIF(c.lote_bld, ''), c.name, '')),
		       COALESCE(c.address, ''),
		       c.hvac_rough_date,
		       ARRAY(
		           SELECT p.step FROM forecast_permit p
		           WHERE p.project_id = c.id ORDER BY p.position, p.id
		       ) AS steps,
		       ARRAY(
		           SELECT p.step FROM forecast_permit p
		           WHERE p.project_id = c.id AND lower(COALESCE(p.status, '')) = 'completed'
		       ) AS done,
		       ARRAY(
		           SELECT p.step FROM forecast_permit p
		           WHERE p.project_id = c.id AND lower(COALESCE(p.status, '')) = 'dispensed'
		       ) AS dispensed
		FROM forecast_core c
		WHERE lower(trim(c.company)) = 'hvac'
		  AND c.hvac_rough_date IS NOT NULL
		  AND c.hvac_rough_date >= $1
		  AND c.hvac_rough_date <= ($1::date + make_interval(days => $2))
		  AND lower(COALESCE(c.status, '')) NOT IN ('closed', 'cancelled')
		ORDER BY c.hvac_rough_date, c.job_site, c.id
	`, today, offsetDays)
	if err != nil {
		return fmt.Errorf("fetch HVAC permit alerts: %w", err)
	}
	defer rows.Close()

	type pendingJob struct {
		id         string
		roughDate  time.Time
		job        service.PermitPendingJob
		targetDate time.Time
	}
	var jobs []pendingJob
	for rows.Next() {
		var (
			id        string
			jobSite   string
			unit      string
			address   string
			roughDate time.Time
			steps     []string
			done      []string
			dispensed []string
		)
		if err := rows.Scan(&id, &jobSite, &unit, &address, &roughDate,
			&steps, &done, &dispensed); err != nil {
			return err
		}

		state := map[string]service.ChecklistItem{}
		for _, step := range done {
			state[step] = service.ChecklistItem{Name: step, Done: true}
		}
		for _, step := range dispensed {
			state[step] = service.ChecklistItem{Name: step, Dispensed: true}
		}
		checklist := make([]service.ChecklistItem, 0, len(steps))
		open := 0
		for _, step := range steps {
			if item, ok := state[step]; ok {
				checklist = append(checklist, item)
				continue
			}
			checklist = append(checklist, service.ChecklistItem{Name: step})
			open++
		}
		// Obra com o Permit inteiro resolvido não é notícia. Obra sem nenhuma
		// etapa cadastrada também não: não há o que cobrar.
		if open == 0 {
			continue
		}

		jobs = append(jobs, pendingJob{
			id:        id,
			roughDate: roughDate,
			job: service.PermitPendingJob{
				JobSite: jobSite, Unit: unit, Address: address,
				StartDate: roughDate, Steps: checklist,
			},
			targetDate: roughDate.AddDate(0, 0, -offsetDays),
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(jobs) == 0 {
		logger.Info("forecast-permit-alerts: nothing pending in the window", "days", offsetDays)
		return nil
	}

	to, cc, err := cfg.Triggers.Recipients(ctx, service.TriggerForecastPermit)
	if err != nil {
		return err
	}
	if len(to) == 0 {
		logger.Info("forecast-permit-alerts: no primary recipients", "jobs", len(jobs))
		return nil
	}

	for _, entry := range jobs {
		// Mesma trava do alerta de Fieldwire: uma obra é anunciada uma vez por
		// data-alvo. Se o Rough for remarcado, a data-alvo muda e o aviso volta.
		var alreadySent bool
		if err := cfg.DB.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM forecast_email_deliveries
				WHERE project_id=$1 AND alert_type=$2 AND target_date=$3
			)
		`, entry.id, permitAlertType, entry.targetDate).Scan(&alreadySent); err != nil {
			return err
		}
		if alreadySent {
			continue
		}

		body := service.BuildPermitPendingEmail(offsetDays, entry.job)
		delivery, err := cfg.Email.Send(ctx, service.EmailMessage{
			To: to, CC: cc, Subject: body.Subject, Text: body.Text, HTML: body.HTML,
		})
		if err != nil {
			cfg.Triggers.LogDelivery(ctx, service.TriggerDelivery{
				TriggerKey: service.TriggerForecastPermit, Subject: body.Subject, To: to, CC: cc,
				Context: entry.job.Unit, Status: "failed", Error: err.Error(),
			})
			return fmt.Errorf("send HVAC permit alert for %s: %w", entry.id, err)
		}
		cfg.Triggers.LogDelivery(ctx, service.TriggerDelivery{
			TriggerKey: service.TriggerForecastPermit, Subject: body.Subject, To: to, CC: cc,
			Context: entry.job.Unit,
		})
		if _, err := cfg.DB.Exec(ctx, `
			INSERT INTO forecast_email_deliveries (project_id, alert_type, target_date, delivery_id)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT DO NOTHING
		`, entry.id, permitAlertType, entry.targetDate, delivery.ID); err != nil {
			return err
		}
		logger.Info("HVAC permit email accepted", "project", entry.id, "delivery_id", delivery.ID)
	}
	return nil
}
