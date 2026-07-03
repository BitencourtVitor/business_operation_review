// One-off backfill for BC-20/BC-22 (preset accounts): seeds
// budget_ghost_accounts with every top-level COGS/Expense account that has
// EVER posted activity on ANY project of a company (any project type — the
// catalog isn't scoped per type), so the admin's starting list reflects real
// history instead of an empty one. Safe to re-run (ON CONFLICT DO NOTHING).
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	conn, err := pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}
	defer conn.Close(context.Background())

	companies := []string{"framing", "hvac", "pcg"}
	total := 0
	for _, company := range companies {
		fmt.Printf("=== %s ===\n", company)

		// Distinct top-level COGS/Expense accounts with real activity on ANY
		// project, regardless of project type.
		rows, err := conn.Query(context.Background(), `
			SELECT DISTINCT a.external_id
			FROM (
				SELECT account_ref_id FROM qb_bill_lines          WHERE company=$1 AND customer_id<>''
				UNION SELECT account_ref_id FROM qb_purchase_lines      WHERE company=$1 AND customer_id<>''
				UNION SELECT account_ref_id FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id<>''
			) x
			JOIN qb_accounts a ON a.company=$1 AND a.external_id=x.account_ref_id
			WHERE a.account_type IN ('Cost of Goods Sold','Expense')
			  AND COALESCE(a.parent_id,'') = ''
		`, company)
		if err != nil {
			log.Fatalf("%s: activity query error: %v", company, err)
		}
		var accountIDs []string
		for rows.Next() {
			var id string
			rows.Scan(&id)
			accountIDs = append(accountIDs, id)
		}
		rows.Close()

		seeded := 0
		for _, id := range accountIDs {
			tag, err := conn.Exec(context.Background(), `
				INSERT INTO budget_ghost_accounts (company, account_ref_id)
				VALUES ($1,$2)
				ON CONFLICT (company, account_ref_id) DO NOTHING
			`, company, id)
			if err != nil {
				log.Fatalf("%s: insert error: %v", company, err)
			}
			if tag.RowsAffected() > 0 {
				seeded++
			}
			total++
		}
		fmt.Printf("  %d accounts seen, %d newly added\n", len(accountIDs), seeded)
	}
	fmt.Printf("\n✓ Done — %d accounts checked (ON CONFLICT DO NOTHING, safe to re-run)\n", total)
}
