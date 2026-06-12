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
	"qb_bill_payment_links":  "Links a vendor payment (bill_payment_id → qb_bill_payments.id) to the bill(s) it paid (txn_id = qb_bills.external_id, txn_type='Bill'). amount = applied to that bill.",
	"qb_payment_links":       "Links a customer payment (payment_id → qb_payments.id) to the invoice(s) it paid (txn_id = qb_invoices.external_id, txn_type='Invoice'). amount = applied to that invoice.",
	"qb_estimate_links":      "Links an estimate (estimate_id → qb_estimates.id) to the invoice(s) it became (txn_id = qb_invoices.external_id, txn_type='Invoice').",
	"qb_bill_links":          "Reverse links from a bill (bill_id → qb_bills.id) to related txns such as its payment (txn_id = the linked doc's external_id; txn_type e.g. 'BillPaymentCheck').",
	"qb_invoice_links":       "Reverse links from an invoice (invoice_id → qb_invoices.id) to related txns (linked_txn_id = external_id; linked_txn_type e.g. 'ReimburseCharge').",
}

const dictionaryHeader = `━━━ DATABASE YOU CAN QUERY ━━━

All financial data is synced daily from QuickBooks into a PostgreSQL database.

ACCOUNTING MODEL (so your queries mean the right thing):
This is a construction company. In QuickBooks, accrual documents (what is owed) are distinct
from cash documents (money that actually moved):
- qb_invoices  = revenue BILLED to customers (accrual / accounts receivable). balance = unpaid AR.
- qb_payments  = cash actually RECEIVED from customers.
- qb_bills     = expenses OWED to vendors (accrual / accounts payable). balance = unpaid AP.
- qb_bill_payments = cash actually PAID to vendors.
- qb_estimates = quotes / sales pipeline — NOT revenue yet.
- qb_purchases = non-bill expenses (credit card / cash). qb_vendor_credits reduce what we owe vendors.
- qb_deposits  = bank deposits (can group several payments).
So "revenue/faturamento" usually means invoiced (qb_invoices); "recebido/cash in" means qb_payments;
"a receber" = invoices.balance>0; "a pagar/devemos" = bills.balance>0; "lucro/caixa" net = received − paid.
A project/job is identified by customer_id / customer_name (typically the homeowner, jobsite, or
general contractor). When a question is about "a project", group or filter by customer_id.

TABLE NAMING: flat tables, one row per document. Headers are qb_<entity> (e.g. qb_invoices);
their detail rows are qb_<entity>_lines and document relations are qb_<entity>_links.

RULES YOU MUST FOLLOW:
- You may run ONLY read-only SELECT queries (you may use WITH/CTEs). Never INSERT/UPDATE/DELETE/DDL.
- Company isolation is automatic — the database already restricts every query to the current
  company. You do NOT need to add a company filter, and you cannot see other companies' data.
- All money columns are numeric USD. Dates are date/timestamp columns (txn_date, due_date, accepted_date).
- This is PostgreSQL. Use Postgres functions only: EXTRACT(YEAR FROM col), date_trunc('month', col),
  to_char(col,'YYYY-MM'), CURRENT_DATE, NOW(), and intervals like (CURRENT_DATE - INTERVAL '6 months').
  NEVER use SQLite functions such as date('now', ...) or strftime() — they do not exist and will error.
  Subtracting two date columns already yields an integer number of days — use (date_a - date_b)
  directly (e.g. AVG(payment_date - invoice_date)); do NOT wrap it in EXTRACT().
- Project profit/margin recipe: revenue = SUM(qb_invoices.total_amount) grouped by customer_id;
  cost = bill_lines + purchase_lines − vendor_credit_lines, each SUM(amount) grouped by customer_id;
  margin = revenue − cost.
  CRITICAL: NEVER join the raw *_lines tables to each other or to a header — customer_id is NOT unique
  in them, so joining un-aggregated rows produces a cartesian explosion that fills disk and fails.
  Instead make ONE CTE per table that is already aggregated to one row per customer_id
  (SELECT customer_id, SUM(amount) ... GROUP BY customer_id), then LEFT JOIN those one-row-per-customer
  CTEs together on customer_id. Add ORDER BY + LIMIT for the top projects.
- Prefer aggregating (SUM/COUNT/GROUP BY) over raw rows; for potentially large lists add ORDER BY + LIMIT
  for the top relevant rows. Results are capped at 150 rows regardless.

RELATIONSHIPS — how documents link to each other (use these to intersect tables):
The *_links tables connect two documents. The OWNER document is referenced by its uuid
(<doc>_id = <doc>.id); the LINKED document is referenced by its EXTERNAL id stored in
txn_id / linked_txn_id, which equals the other table's external_id column (NOT its uuid).
The link's "amount" is how much was applied. Key joins:
- Which bills were paid, by which vendor payment, how much:
    qb_bill_payments bp JOIN qb_bill_payment_links bpl ON bpl.bill_payment_id = bp.id
    JOIN qb_bills b ON b.external_id = bpl.txn_id      (bpl.txn_type = 'Bill')
- Which invoices were paid, by which customer payment, how much:
    qb_payments p JOIN qb_payment_links pl ON pl.payment_id = p.id
    JOIN qb_invoices i ON i.external_id = pl.txn_id    (pl.txn_type = 'Invoice')
- Which invoices an estimate converted into (conversion / win rate):
    qb_estimates e JOIN qb_estimate_links el ON el.estimate_id = e.id
    JOIN qb_invoices i ON i.external_id = el.txn_id    (el.txn_type = 'Invoice')
Always join a *_links table to the target on external_id (= txn_id/linked_txn_id), never on uuid id.
Use these links for questions about payment timing (invoice date vs payment date), what paid what,
unpaid vs paid documents, and estimate→invoice conversion.

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
