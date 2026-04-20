package jobs

import (
	"context"

	"github.com/bitencourtVitor/bor2-api/internal/pipeline/quickbooks"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// QBSyncConfig holds the dependencies needed by the QB sync job.
type QBSyncConfig struct {
	Syncer   *quickbooks.Syncer
	OAuthSvc *service.QBOAuthService
	Sandbox  bool
}

// NewQBSyncJob creates a daily job that syncs QuickBooks data for all companies.
// Runs at 04:00 UTC (01:00 BRT). Per-entity errors are logged but never abort siblings.
func NewQBSyncJob(cfg QBSyncConfig) Job {
	return Job{
		Name:      "qb-sync",
		DailyHour: 4, // 04:00 UTC = 01:00 BRT
		Run: func(ctx context.Context) error {
			// Build fresh clients — GetAccessToken proactively refreshes if >50 min old.
			clients := make([]*quickbooks.Client, 0, len(quickbooks.AllCompanies))
			for _, company := range quickbooks.AllCompanies {
				accessToken, realmID, err := cfg.OAuthSvc.GetAccessToken(ctx, string(company))
				if err != nil {
					logger.Error("qb sync: token unavailable, skipping company",
						"company", company,
						"error", err,
					)
					continue
				}
				clients = append(clients, quickbooks.NewClient(
					company,
					quickbooks.CompanyConfig{
						RealmID:     realmID,
						AccessToken: accessToken,
					},
					cfg.Sandbox,
				))
			}

			if len(clients) == 0 {
				logger.Error("qb sync: no companies with valid tokens — skipping run")
				return nil
			}

			results := cfg.Syncer.SyncAll(ctx, clients)

			var failed, succeeded int
			for _, r := range results {
				if r.Err != nil {
					failed++
				} else {
					succeeded++
				}
			}

			logger.Info("qb sync run finished",
				"companies", len(clients),
				"tasks", len(results),
				"succeeded", succeeded,
				"failed", failed,
			)
			return nil
		},
	}
}
