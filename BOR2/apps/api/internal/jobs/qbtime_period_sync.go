package jobs

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// QBTimePeriodSyncConfig holds the dependency for the period-report sync job.
type QBTimePeriodSyncConfig struct {
	Svc  *service.PeriodReportService
	Days int // days back to re-sync (default 14)
}

// NewQBTimePeriodSyncJob creates a daily job that refreshes the QB Time period
// report cache for all companies. Runs at 05:00 UTC (02:00 BRT), just after
// the QB accounting sync, so each morning's report already reflects yesterday.
func NewQBTimePeriodSyncJob(cfg QBTimePeriodSyncConfig) Job {
	days := cfg.Days
	if days <= 0 {
		days = 14
	}
	return Job{
		Name:      "qbtime-period-sync",
		DailyHour: 5, // 05:00 UTC = 02:00 BRT
		Run: func(ctx context.Context) error {
			results := cfg.Svc.SyncAll(ctx, days)
			var failed, succeeded int
			for _, r := range results {
				if r.Err != nil {
					failed++
					logger.Error("qbtime period sync: company failed",
						"company", r.Company,
						"error", r.Err,
					)
				} else {
					succeeded++
				}
			}
			logger.Info("qbtime period sync finished",
				"days", days,
				"succeeded", succeeded,
				"failed", failed,
			)
			return nil
		},
	}
}
