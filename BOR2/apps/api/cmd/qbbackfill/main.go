// cmd/qbbackfill — one-shot QuickBooks sync using the credentials stored in the
// database (qb_credentials), decrypted with QB_ENCRYPTION_KEY. Unlike cmd/qbsync
// (which reads raw tokens from .env.qbsync), this reuses the production OAuth
// service, so it refreshes and persists rotated tokens — safe to run anytime.
//
// Run from BOR2/apps/api with:  go run ./cmd/qbbackfill
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/pipeline/quickbooks"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	// .env has DATABASE_URL + QB_ENCRYPTION_KEY; .env.qbsync has QB_CLIENT_ID/SECRET.
	_ = godotenv.Load(".env", ".env.qbsync")
	logger.Init("development")

	dbURL := mustEnv("DATABASE_URL")
	mustEnv("QB_ENCRYPTION_KEY")
	mustEnv("QB_CLIENT_ID")
	mustEnv("QB_CLIENT_SECRET")

	db, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		fatalf("connect db: %v", err)
	}
	defer db.Close()
	if err := db.Ping(context.Background()); err != nil {
		fatalf("ping db: %v", err)
	}
	fmt.Println("✓ database connected")

	ctx := context.Background()
	oauth := service.NewQBOAuthService(repository.NewPostgresQBCredentialsRepository(db))

	clients := make([]*quickbooks.Client, 0, len(quickbooks.AllCompanies))
	for _, company := range quickbooks.AllCompanies {
		accessToken, realmID, err := oauth.GetAccessToken(ctx, string(company))
		if err != nil {
			fmt.Printf("  ✗  %-10s token unavailable: %v\n", company, err)
			continue
		}
		clients = append(clients, quickbooks.NewClient(company, quickbooks.CompanyConfig{
			RealmID:     realmID,
			AccessToken: accessToken,
		}, false))
		fmt.Printf("  ✓  %-10s token ok\n", company)
	}
	if len(clients) == 0 {
		fatalf("no companies with valid tokens")
	}

	fmt.Printf("\n→ syncing %d companies × %d entities = %d tasks\n\n",
		len(clients), len(quickbooks.AllEntities), len(clients)*len(quickbooks.AllEntities))

	syncer := quickbooks.NewSyncer(db)
	start := time.Now()
	var failed int

	results := syncer.SyncAll(ctx, clients, func(r quickbooks.SyncResult) {
		if r.Err != nil {
			fmt.Printf("  ✗  %-10s %-16s %s\n", r.Company, r.Entity, r.Err.Error())
			failed++
		} else {
			fmt.Printf("  ✓  %-10s %-16s %d records  %s\n",
				r.Company, r.Entity, r.Count, r.Duration.Round(time.Millisecond))
		}
	})

	fmt.Printf("\n── done in %s — %d succeeded, %d failed ──────────────────\n",
		time.Since(start).Round(time.Millisecond), len(results)-failed, failed)

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
