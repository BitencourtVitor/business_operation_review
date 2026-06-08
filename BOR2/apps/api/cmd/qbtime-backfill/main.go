// qbtime-backfill populates the Period Reports cache directly from QB Time for
// the last N days (default 100 ≈ 3 months). Run once to seed the cache; ongoing
// freshness is handled by the report's own view-triggered background refresh.
//
//	go run ./cmd/qbtime-backfill            # 100 days, all companies
//	SYNC_DAYS=14 go run ./cmd/qbtime-backfill
//
// Requires DATABASE_URL and the QBT_ACCESS_TOKEN_* vars (loaded from .env).
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/internal/service"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	days := 100
	if v := os.Getenv("SYNC_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			days = n
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	db, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer db.Close()

	teamRepo := repository.NewPostgresQBTimeTeamRepository(db)
	cacheRepo := repository.NewPostgresQBTimePeriodCacheRepository(db)
	unpaidRepo := repository.NewPostgresQBTimeUnpaidAddressRepository(db)
	svc := service.NewPeriodReportService(teamRepo, cacheRepo, unpaidRepo)

	fmt.Printf("[qbtime-backfill] syncing last %d days for all companies…\n", days)
	start := time.Now()
	result := svc.SyncAll(ctx, days)
	for company, status := range result {
		fmt.Printf("  %-8s %s\n", company, status)
	}
	fmt.Printf("[qbtime-backfill] done in %s\n", time.Since(start).Round(time.Second))
}
