package jobs

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/pipeline/quickbooks"
)

// QBSyncConfig holds all company clients for syncing.
type QBSyncConfig struct {
	Syncer   *quickbooks.Syncer
	Companies []quickbooks.SyncConfig
}

// QB entities to sync for all companies.
var qbEntities = []string{
	"Invoice",
	"Bill",
	"Payment",
	"BillPayment",
	"Estimate",
	"Purchase",
	"VendorCredit",
	"Deposit",
}

// NewQBSyncJob creates a job that syncs QuickBooks data for all companies.
func NewQBSyncJob(cfg QBSyncConfig) Job {
	return Job{
		Name:     "qb-sync",
		Interval: 6 * time.Hour,
		Run: func(ctx context.Context) error {
			for _, company := range cfg.Companies {
				company.Entities = qbEntities
				if err := cfg.Syncer.SyncAll(ctx, company); err != nil {
					return err
				}
			}
			return nil
		},
	}
}
