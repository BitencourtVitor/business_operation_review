package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// ariaTables is the allow-list of financial tables Aria may read. Keep in sync
// with the SELECT grants + RLS policies granted to the aria_ro role (migration).
var ariaTables = []string{
	"qb_invoices", "qb_invoice_lines", "qb_invoice_links",
	"qb_bills", "qb_bill_lines", "qb_bill_links",
	"qb_payments", "qb_payment_links",
	"qb_bill_payments", "qb_bill_payment_links",
	"qb_estimates", "qb_estimate_lines", "qb_estimate_links",
	"qb_purchases", "qb_purchase_lines",
	"qb_vendor_credits", "qb_vendor_credit_lines",
	"qb_deposits", "qb_deposit_lines",
}

// tableSemantics carries the business meaning the database itself can't express.
// Merged with live column lists at boot to form the agent's data dictionary.
var tableSemantics = map[string]string{
	"qb_invoices":            "Invoices issued TO customers (money owed to us). balance>0 = unpaid; due_date<now AND balance>0 = overdue receivable.",
	"qb_bills":               "Vendor bills received (money we owe). balance>0 = unpaid; due_date<now AND balance>0 = overdue payable.",
	"qb_payments":            "Customer payments RECEIVED (cash in). No doc_number. total_amount = amount received.",
	"qb_bill_payments":       "Payments WE MADE to vendors (cash out).",
	"qb_estimates":           "Quotes/estimates sent to customers (the sales pipeline). txn_status in (Pending, Accepted, Closed, Rejected). Open pipeline = txn_status NOT IN ('Closed','Rejected').",
	"qb_purchases":           "Non-bill purchases (credit card / cash expenses).",
	"qb_vendor_credits":      "Vendor credits (negative cost adjustments).",
	"qb_deposits":            "Bank deposits.",
	"qb_bill_lines":          "Line items of vendor bills. amount per line; customer_id links the cost to a project/customer.",
	"qb_purchase_lines":      "Line items of purchases. amount per line; customer_id links the cost to a project/customer.",
	"qb_vendor_credit_lines": "Line items of vendor credits. amount per line; customer_id links to a project/customer.",
	"qb_invoice_lines":       "Line items of invoices.",
	"qb_estimate_lines":      "Line items of estimates.",
	"qb_deposit_lines":       "Line items of deposits.",
}

const dictionaryHeader = `━━━ DATABASE YOU CAN QUERY ━━━

All financial data is synced daily from QuickBooks into a PostgreSQL database.

TABLE NAMING: flat tables, one row per document. Headers are qb_<entity> (e.g. qb_invoices);
their detail rows are qb_<entity>_lines and document relations are qb_<entity>_links.

RULES YOU MUST FOLLOW:
- You may run ONLY read-only SELECT queries (you may use WITH/CTEs). Never INSERT/UPDATE/DELETE/DDL.
- Company isolation is automatic — the database already restricts every query to the current
  company. You do NOT need to add a company filter, and you cannot see other companies' data.
- All money columns are numeric USD. Dates are date/timestamp columns (txn_date, due_date, accepted_date).
- To attribute costs to a project/customer, sum the *_lines tables (qb_bill_lines, qb_purchase_lines,
  qb_vendor_credit_lines) by customer_id. Revenue per project comes from qb_invoices by customer_id.
- Prefer aggregating (SUM/COUNT/GROUP BY) over returning raw rows. Results are capped at 150 rows.

TABLES AND COLUMNS:
`

// BuildDataDictionary introspects the live columns of the allow-listed tables and
// merges them with curated semantics. Logs drift when an expected table is absent.
func BuildDataDictionary(ctx context.Context, db *pgxpool.Pool) (string, error) {
	rows, err := db.Query(ctx, `
		SELECT table_name, column_name, data_type
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = ANY($1)
		ORDER BY table_name, ordinal_position`, ariaTables)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	cols := make(map[string][]string)
	for rows.Next() {
		var t, c, dt string
		if err := rows.Scan(&t, &c, &dt); err != nil {
			return "", err
		}
		cols[t] = append(cols[t], c)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString(dictionaryHeader)
	for _, t := range ariaTables {
		c := cols[t]
		if len(c) == 0 {
			logger.Error("aria schema drift: expected table missing from database", "table", t)
			continue
		}
		sb.WriteString("\n• " + t)
		if sem := tableSemantics[t]; sem != "" {
			sb.WriteString(" — " + sem)
		}
		sb.WriteString("\n  columns: " + strings.Join(c, ", ") + "\n")
	}
	return sb.String(), nil
}

// ValidateSchema runs the introspection once at boot purely to surface drift in logs.
func ValidateSchema(ctx context.Context, db *pgxpool.Pool) {
	if _, err := BuildDataDictionary(ctx, db); err != nil {
		logger.Error("aria schema validation failed", "error", fmt.Sprintf("%v", err))
	}
}
