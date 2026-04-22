package quickbooks

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// maxConcurrent is the semaphore size — max simultaneous QB API requests.
	// QB rate limit is 500 req/min per app; 10 concurrent workers is safe.
	maxConcurrent = 10
)

// Syncer orchestrates concurrent QB sync across all companies and entities.
type Syncer struct {
	db  *pgxpool.Pool
	sem chan struct{} // semaphore
}

func NewSyncer(db *pgxpool.Pool) *Syncer {
	return &Syncer{
		db:  db,
		sem: make(chan struct{}, maxConcurrent),
	}
}

// SyncResult holds the outcome of a single company+entity sync.
type SyncResult struct {
	Company  Company
	Entity   string
	Count    int
	Duration time.Duration
	Err      error
}

// SyncAll runs all company×entity combinations concurrently (bounded by semaphore).
// Errors are collected and logged — a failing entity never blocks the others.
// An optional onResult callback is called immediately as each task completes.
func (s *Syncer) SyncAll(ctx context.Context, clients []*Client, onResult ...func(SyncResult)) []SyncResult {
	type task struct {
		client *Client
		entity string
	}

	// Build all 24 tasks (3 companies × 8 entities)
	var tasks []task
	for _, client := range clients {
		for _, entity := range AllEntities {
			tasks = append(tasks, task{client: client, entity: entity})
		}
	}

	results := make([]SyncResult, len(tasks))
	var wg sync.WaitGroup

	for i, t := range tasks {
		wg.Add(1)
		go func(idx int, tk task) {
			defer wg.Done()

			// Acquire semaphore slot
			s.sem <- struct{}{}
			defer func() { <-s.sem }()

			start := time.Now()
			count, err := s.syncOne(ctx, tk.client, tk.entity)

			r := SyncResult{
				Company:  tk.client.Company(),
				Entity:   tk.entity,
				Count:    count,
				Duration: time.Since(start),
				Err:      err,
			}
			results[idx] = r

			if err != nil {
				logger.Error("qb sync failed",
					"company", tk.client.Company(),
					"entity", tk.entity,
					"error", err,
				)
			} else {
				logger.Info("qb sync done",
					"company", tk.client.Company(),
					"entity", tk.entity,
					"count", count,
					"duration", time.Since(start),
				)
			}

			if len(onResult) > 0 && onResult[0] != nil {
				onResult[0](r)
			}
		}(i, t)
	}

	wg.Wait()
	return results
}

// syncOne fetches updated records for one company+entity and upserts them.
func (s *Syncer) syncOne(ctx context.Context, client *Client, entity string) (int, error) {
	since, err := s.getLastSyncedAt(ctx, string(client.Company()), entity)
	if err != nil {
		return 0, fmt.Errorf("get last_synced_at: %w", err)
	}

	rows, err := client.QueryUpdated(ctx, entity, since)
	if err != nil {
		return 0, fmt.Errorf("query QB: %w", err)
	}

	if len(rows) == 0 {
		_ = s.updateSyncState(ctx, string(client.Company()), entity, 0)
		return 0, nil
	}

	count, err := upsertEntity(ctx, s.db, string(client.Company()), entity, rows)
	if err != nil {
		return 0, fmt.Errorf("upsert: %w", err)
	}

	_ = s.updateSyncState(ctx, string(client.Company()), entity, count)
	return count, nil
}

// ─── sync state ──────────────────────────────────────────────────────────────

func (s *Syncer) getLastSyncedAt(ctx context.Context, company, entity string) (time.Time, error) {
	var t time.Time
	err := s.db.QueryRow(ctx, `
		SELECT last_synced_at FROM qb_sync_state
		WHERE company = $1 AND entity = $2
	`, company, entity).Scan(&t)
	if err != nil {
		return time.Time{}, nil // no record yet → full sync
	}
	return t, nil
}

func (s *Syncer) updateSyncState(ctx context.Context, company, entity string, count int) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO qb_sync_state (company, entity, last_synced_at, synced_count, updated_at)
		VALUES ($1, $2, now(), $3, now())
		ON CONFLICT (company, entity) DO UPDATE SET
			last_synced_at = now(),
			synced_count   = EXCLUDED.synced_count,
			updated_at     = now()
	`, company, entity, count)
	return err
}
