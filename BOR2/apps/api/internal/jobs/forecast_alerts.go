package jobs

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// ForecastAlertsConfig holds email and repo config.
type ForecastAlertsConfig struct {
	SMTPHost    string
	SMTPPort    string
	GmailUser   string
	GmailPass   string
	AlertDays   int // days before start to alert
	ForecastRepo repository.ForecastRepository
}

// NewForecastAlertsJob creates a daily job that emails alerts for
// projects starting within AlertDays days.
func NewForecastAlertsJob(cfg ForecastAlertsConfig) Job {
	return Job{
		Name:     "forecast-alerts",
		Interval: 24 * time.Hour,
		Run: func(ctx context.Context) error {
			return runForecastAlerts(ctx, cfg)
		},
	}
}

func runForecastAlerts(ctx context.Context, cfg ForecastAlertsConfig) error {
	year := time.Now().Year()
	projects, err := cfg.ForecastRepo.List(ctx, domain.ForecastFilters{
		Status: domain.ForecastStatusPlanned,
		Year:   year,
	})
	if err != nil {
		return fmt.Errorf("fetch forecast projects: %w", err)
	}

	threshold := time.Now().AddDate(0, 0, cfg.AlertDays)
	var alerts []string

	for _, p := range projects {
		if p.StartDate.Before(threshold) && p.StartDate.After(time.Now()) {
			daysLeft := int(time.Until(p.StartDate).Hours() / 24)
			alerts = append(alerts, fmt.Sprintf("- %s (%s) starts in %d days on %s",
				p.Name, strings.ToUpper(p.Company), daysLeft,
				p.StartDate.Format("Jan 02, 2006")))
		}
	}

	if len(alerts) == 0 {
		logger.Info("forecast-alerts: no upcoming projects to alert")
		return nil
	}

	return sendEmail(cfg, fmt.Sprintf(
		"BOR2 — %d projects starting within %d days:\n\n%s",
		len(alerts), cfg.AlertDays, strings.Join(alerts, "\n"),
	))
}

func sendEmail(cfg ForecastAlertsConfig, body string) error {
	auth := smtp.PlainAuth("", cfg.GmailUser, cfg.GmailPass, cfg.SMTPHost)
	msg := fmt.Sprintf("From: %s\nTo: %s\nSubject: BOR2 Forecast Alert\n\n%s",
		cfg.GmailUser, cfg.GmailUser, body)

	addr := fmt.Sprintf("%s:%s", cfg.SMTPHost, cfg.SMTPPort)
	return smtp.SendMail(addr, auth, cfg.GmailUser, []string{cfg.GmailUser}, []byte(msg))
}
