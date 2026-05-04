// cmd/qbsync — one-shot QuickBooks sync runner.
// Run with: go run ./cmd/qbsync
// Reads credentials from environment variables (or .env.qbsync in the api root).
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/pipeline/quickbooks"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env.qbsync if present (ignored in production)
	_ = godotenv.Load(".env.qbsync")
	logger.Init("development")

	dbURL := mustEnv("DATABASE_URL")

	db, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		fatalf("connect db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(context.Background()); err != nil {
		fatalf("ping db: %v", err)
	}
	fmt.Println("✓ database connected")

	// Build one client per company using raw tokens (no encryption layer needed here)
	sandbox := os.Getenv("QB_SANDBOX") == "true"
	clients := []*quickbooks.Client{
		quickbooks.NewClient(quickbooks.CompanyHVAC, quickbooks.CompanyConfig{
			RealmID:      mustEnv("HVAC_REALM_ID"),
			AccessToken:  mustEnv("HVAC_ACCESS_TOKEN"),
			RefreshToken: mustEnv("HVAC_REFRESH_TOKEN"),
			ClientID:     mustEnv("QB_CLIENT_ID"),
			ClientSecret: mustEnv("QB_CLIENT_SECRET"),
		}, sandbox),
		quickbooks.NewClient(quickbooks.CompanyFraming, quickbooks.CompanyConfig{
			RealmID:      mustEnv("FRAMING_REALM_ID"),
			AccessToken:  mustEnv("FRAMING_ACCESS_TOKEN"),
			RefreshToken: mustEnv("FRAMING_REFRESH_TOKEN"),
			ClientID:     mustEnv("QB_CLIENT_ID"),
			ClientSecret: mustEnv("QB_CLIENT_SECRET"),
		}, sandbox),
		quickbooks.NewClient(quickbooks.CompanyPCG, quickbooks.CompanyConfig{
			RealmID:      mustEnv("PCG_REALM_ID"),
			AccessToken:  mustEnv("PCG_ACCESS_TOKEN"),
			RefreshToken: mustEnv("PCG_REFRESH_TOKEN"),
			ClientID:     mustEnv("QB_CLIENT_ID"),
			ClientSecret: mustEnv("QB_CLIENT_SECRET"),
		}, sandbox),
	}

	fmt.Printf("→ starting sync: %d companies × %d entities = %d tasks\n\n",
		len(clients), len(quickbooks.AllEntities), len(clients)*len(quickbooks.AllEntities))

	syncer := quickbooks.NewSyncer(db)
	start := time.Now()
	var failed int

	results := syncer.SyncAll(context.Background(), clients, func(r quickbooks.SyncResult) {
		if r.Err != nil {
			fmt.Printf("  ✗  %-10s %-15s %s\n", r.Company, r.Entity, r.Err.Error())
			failed++
		} else {
			fmt.Printf("  ✓  %-10s %-15s %d records  %s\n",
				r.Company, r.Entity, r.Count, r.Duration.Round(time.Millisecond))
		}
	})
	_ = results

	fmt.Printf("\n── done in %s — %d succeeded, %d failed ──────────────────\n",
		time.Since(start).Round(time.Millisecond),
		len(results)-failed,
		failed,
	)

	if failed > 0 {
		os.Exit(1)
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		fatalf("required env var %q is not set", key)
	}
	return v
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "ERROR: "+format+"\n", args...)
	os.Exit(1)
}
