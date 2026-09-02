// cmd/qbpurchase-backfill — full re-pull + reconcile of the Purchase entity only.
//
// Why this exists: Purchases can carry the project (CustomerRef) at the header
// level, which the old parser ignored — so historical purchases landed with an
// empty customer_id and were invisible to the budget cost. The parser is fixed;
// this command forces a one-time full re-read of every Purchase (so the project
// is captured) and reconciles QB-side deletions, then verifies the result.
//
// Tokens come from the DB (qb_credentials) so they're always current, and the
// client self-refreshes if the access token expires mid-run.
//
// Run from BOR2/apps/api:  go run ./cmd/qbpurchase-backfill
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
	_ = godotenv.Load(".env")        // DATABASE_URL, QB_ENCRYPTION_KEY
	_ = godotenv.Load(".env.qbsync") // QB_CLIENT_ID, QB_CLIENT_SECRET
	logger.Init("development")

	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fatal("DATABASE_URL not set")
	}

	db, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fatal("connect db: %v", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		fatal("ping db: %v", err)
	}
	fmt.Println("✓ database connected")

	oauth := service.NewQBOAuthService(repository.NewPostgresQBCredentialsRepository(db))

	var clients []*quickbooks.Client
	var authorized []string
	for _, company := range quickbooks.AllCompanies {
		at, rt, realm, cid, csec, err := oauth.SyncClientConfig(ctx, string(company))
		if err != nil {
			fmt.Printf("  ✗ %-8s token unavailable: %v\n", company, err)
			continue
		}
		clients = append(clients, quickbooks.NewClient(company, quickbooks.CompanyConfig{
			RealmID: realm, AccessToken: at, RefreshToken: rt, ClientID: cid, ClientSecret: csec,
		}, false).WithRefresher(oauth))
		authorized = append(authorized, string(company))
		fmt.Printf("  ✓ %-8s authorized (realm %s)\n", company, realm)
	}
	if len(clients) == 0 {
		fatal("no companies with valid tokens — re-authorize QB and retry")
	}
	fmt.Println()

	fmt.Println("══ BEFORE ════════════════════════════════════════════════════")
	snapshot(ctx, db)

	// Reset only the authorized companies so a skipped one isn't left stateless.
	tag, err := db.Exec(ctx, `DELETE FROM qb_sync_state WHERE entity='Purchase' AND company = ANY($1)`, authorized)
	if err != nil {
		fatal("reset Purchase sync_state: %v", err)
	}
	fmt.Printf("\n✓ reset Purchase sync_state for %v (%d rows) → next read is a FULL pull\n\n", authorized, tag.RowsAffected())

	fmt.Println("══ SYNC (upsert) ═════════════════════════════════════════════")
	syncer := quickbooks.NewSyncer(db)
	start := time.Now()
	results := syncer.SyncEntities(ctx, clients, []string{"Purchase"}, func(r quickbooks.SyncResult) {
		if r.Err != nil {
			fmt.Printf("  ✗ %-8s Purchase  %v\n", r.Company, r.Err)
		} else {
			fmt.Printf("  ✓ %-8s Purchase  %d records  %s\n",
				r.Company, r.Count, r.Duration.Round(time.Millisecond))
		}
	})
	var failed int
	for _, r := range results {
		if r.Err != nil {
			failed++
		}
	}

	fmt.Println("\n══ RECONCILE (cleanup) ═══════════════════════════════════════")
	syncer.ReconcileDeletions(ctx, clients, []string{"Purchase"})
	fmt.Printf("  (deletions removed; nothing printed means nothing to remove)\n")

	fmt.Printf("\n── finished in %s — %d entity failure(s) ──\n\n",
		time.Since(start).Round(time.Millisecond), failed)

	fmt.Println("══ AFTER ═════════════════════════════════════════════════════")
	snapshot(ctx, db)

	if failed > 0 {
		os.Exit(1)
	}
}

// snapshot prints, per company, the Purchase row counts and how many purchase
// lines still have no project (empty customer_id), then the cost breakdown of
// every framing job matching "emerald" so the Building 1 total is visible.
func snapshot(ctx context.Context, db *pgxpool.Pool) {
	for _, co := range []string{"framing", "hvac", "pcg"} {
		var purchases, lines, noProject int
		_ = db.QueryRow(ctx, `SELECT count(*) FROM qb_purchases WHERE company=$1`, co).Scan(&purchases)
		_ = db.QueryRow(ctx, `SELECT count(*) FROM qb_purchase_lines WHERE company=$1`, co).Scan(&lines)
		_ = db.QueryRow(ctx, `SELECT count(*) FROM qb_purchase_lines WHERE company=$1 AND (customer_id IS NULL OR customer_id='')`, co).Scan(&noProject)
		fmt.Printf("  %-8s  purchases=%-5d  lines=%-5d  lines_sem_obra=%d\n", co, purchases, lines, noProject)
	}

	fmt.Println("  ── framing jobs matching \"emerald\" (cost = bills + purchases − vendor_credits) ──")
	rows, err := db.Query(ctx, `
		SELECT c.external_id,
		       COALESCE(NULLIF(c.fully_qualified_name,''), c.display_name) AS fqn,
		       (SELECT COALESCE(SUM(amount),0) FROM qb_bill_lines          bl WHERE bl.company='framing' AND bl.customer_id = c.external_id) AS bills,
		       (SELECT COALESCE(SUM(amount),0) FROM qb_purchase_lines      pl WHERE pl.company='framing' AND pl.customer_id = c.external_id) AS purchases,
		       (SELECT COALESCE(SUM(amount),0) FROM qb_vendor_credit_lines vc WHERE vc.company='framing' AND vc.customer_id = c.external_id) AS vcredits
		FROM qb_customers c
		WHERE c.company='framing'
		  AND (c.fully_qualified_name ILIKE '%emerald%' OR c.display_name ILIKE '%emerald%')
		ORDER BY fqn`)
	if err != nil {
		fmt.Printf("    (query error: %v)\n", err)
		return
	}
	defer rows.Close()
	any := false
	for rows.Next() {
		var id, fqn string
		var bills, purchases, vcredits float64
		if err := rows.Scan(&id, &fqn, &bills, &purchases, &vcredits); err != nil {
			continue
		}
		any = true
		total := bills + purchases - vcredits
		fmt.Printf("    [%s] %-32s bills=%.2f  purch=%.2f  vc=%.2f  → total=%.2f\n",
			id, fqn, bills, purchases, vcredits, total)
	}
	if !any {
		fmt.Println("    (no framing customer matched \"emerald\")")
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "ERROR: "+format+"\n", args...)
	os.Exit(1)
}
