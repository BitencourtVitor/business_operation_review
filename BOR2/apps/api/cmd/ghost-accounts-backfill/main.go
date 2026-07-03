// One-off backfill for BC-20 (ghost cost accounts): seeds budget_ghost_accounts
// with every top-level COGS/Expense account that has EVER posted activity on
// ANY project of a given company+project_type, so the admin's starting
// catalog reflects real history instead of an empty list.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

// projectType mirrors internal/handler/budget_handler.go's projectType() —
// duplicated here since it's unexported and this is a standalone script.
func projectType(name string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	if strings.HasPrefix(n, "building") {
		return "building"
	}
	if strings.HasPrefix(n, "lot") {
		return "lot"
	}
	return "private"
}

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

		// customer_id → project name (leaf FQN segment), same derivation as custProjCTE.
		custRows, err := conn.Query(context.Background(), `
			SELECT external_id,
			       COALESCE(
			           NULLIF(trim((string_to_array(COALESCE(NULLIF(fully_qualified_name,''), NULLIF(display_name,''), external_id), ':'))[
			               array_length(string_to_array(COALESCE(NULLIF(fully_qualified_name,''), NULLIF(display_name,''), external_id), ':'), 1)
			           ]), ''),
			           NULLIF(display_name, ''),
			           external_id
			       ) AS pname
			FROM qb_customers WHERE company=$1
		`, company)
		if err != nil {
			log.Fatalf("%s: customer query error: %v", company, err)
		}
		pname := map[string]string{}
		for custRows.Next() {
			var custID, pn string
			custRows.Scan(&custID, &pn)
			pname[custID] = pn
		}
		custRows.Close()

		// (customer_id, account_ref_id) pairs with real activity, restricted to
		// top-level (no parent) COGS/Expense accounts — mirrors costAccountTree's
		// "top" node set, which is what ghost rows are injected alongside.
		actRows, err := conn.Query(context.Background(), `
			SELECT DISTINCT x.customer_id, a.external_id
			FROM (
				SELECT customer_id, account_ref_id FROM qb_bill_lines          WHERE company=$1 AND customer_id<>''
				UNION SELECT customer_id, account_ref_id FROM qb_purchase_lines      WHERE company=$1 AND customer_id<>''
				UNION SELECT customer_id, account_ref_id FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id<>''
			) x
			JOIN qb_accounts a ON a.company=$1 AND a.external_id=x.account_ref_id
			WHERE a.account_type IN ('Cost of Goods Sold','Expense')
			  AND COALESCE(a.parent_id,'') = ''
		`, company)
		if err != nil {
			log.Fatalf("%s: activity query error: %v", company, err)
		}
		type key struct{ projType, accountID string }
		seen := map[key]bool{}
		for actRows.Next() {
			var custID, accountID string
			actRows.Scan(&custID, &accountID)
			pt := projectType(pname[custID])
			seen[key{pt, accountID}] = true
		}
		actRows.Close()

		for k := range seen {
			_, err := conn.Exec(context.Background(), `
				INSERT INTO budget_ghost_accounts (company, project_type, account_ref_id)
				VALUES ($1,$2,$3)
				ON CONFLICT (company, project_type, account_ref_id) DO NOTHING
			`, company, k.projType, k.accountID)
			if err != nil {
				log.Fatalf("%s: insert error: %v", company, err)
			}
			total++
		}
		fmt.Printf("  %d (company, project_type, account) combos seeded\n", len(seen))
	}
	fmt.Printf("\n✓ Done — %d rows upserted (ON CONFLICT DO NOTHING, safe to re-run)\n", total)
}
