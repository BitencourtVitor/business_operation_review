package quickbooks

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SyncConfig defines what entities to sync per company.
type SyncConfig struct {
	Entities []string
	Company  Company
	Client   *Client
}

// Syncer writes raw QB data into company-prefixed Postgres tables.
type Syncer struct {
	db *pgxpool.Pool
}

func NewSyncer(db *pgxpool.Pool) *Syncer {
	return &Syncer{db: db}
}

// SyncAll fetches all entities for a company and upserts into Postgres.
func (s *Syncer) SyncAll(ctx context.Context, cfg SyncConfig) error {
	for _, entity := range cfg.Entities {
		logger.Info("syncing QB entity", "company", cfg.Company, "entity", entity)

		rows, err := cfg.Client.QueryAll(ctx, entity)
		if err != nil {
			return fmt.Errorf("fetch %s/%s: %w", cfg.Company, entity, err)
		}

		if err := s.upsertRaw(ctx, cfg.Company, entity, rows); err != nil {
			return fmt.Errorf("upsert %s/%s: %w", cfg.Company, entity, err)
		}

		logger.Info("synced QB entity", "company", cfg.Company, "entity", entity, "count", len(rows))
	}
	return nil
}

// upsertRaw stores raw JSON rows into a generic qb_raw table,
// keyed by (company, entity, external_id).
func (s *Syncer) upsertRaw(ctx context.Context, company Company, entity string, rows []json.RawMessage) error {
	if len(rows) == 0 {
		return nil
	}

	for _, row := range rows {
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(row, &obj); err != nil {
			continue
		}

		idRaw, ok := obj["Id"]
		if !ok {
			continue
		}
		var id string
		_ = json.Unmarshal(idRaw, &id)

		_, err := s.db.Exec(ctx, `
			INSERT INTO qb_raw (company, entity, external_id, data, synced_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (company, entity, external_id)
			DO UPDATE SET data = EXCLUDED.data, synced_at = EXCLUDED.synced_at
		`, string(company), entity, id, row, time.Now())
		if err != nil {
			logger.Error("upsert QB row failed", "company", company, "entity", entity, "id", id, "error", err)
		}
	}
	return nil
}
