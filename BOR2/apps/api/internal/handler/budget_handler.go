package handler

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetHandler powers the Budget Control page. A "project" is one QuickBooks
// job/customer (e.g. a single building "… : Chauncy Lake 6546 : Building 1") —
// the leaf entity QB itself lists under "Projects". Parent grouping nodes (the
// development, the GC) drop out on their own because they carry no direct
// activity. Per project it tracks receivables (estimate → invoiced → received),
// total cost (all expenses) broken down by category, and subcontractor / labor
// via Purchase Orders. Every project targets a 30% profit margin, so the cost
// ceiling is 70% of the contract.
type BudgetHandler struct {
	db        *pgxpool.Pool
	periodSvc *service.PeriodReportService
}

func NewBudgetHandler(db *pgxpool.Pool, periodSvc *service.PeriodReportService) *BudgetHandler {
	return &BudgetHandler{db: db, periodSvc: periodSvc}
}

const profitMargin = 0.30 // every project (house & building) targets 30% margin

// projectType is derived from the project name: "building" → building, "lot" →
// house, otherwise house (fallback).
func projectType(name string) string {
	n := strings.ToLower(name)
	if strings.Contains(n, "building") {
		return "building"
	}
	if strings.Contains(n, "lot") {
		return "house"
	}
	return "house"
}

// custProjCTE maps every QB customer that appears in any budget source to a
// project. A project IS the customer/job itself (pkey = customer_id): pname is
// the leaf segment of the fully-qualified name (the building/job label) and
// client is the root segment (the GC). Parent grouping nodes drop out later via
// the activity filter. $1 = company. Used verbatim by both the list query and the
// detail endpoint so project_id is identical on both sides.
const custProjCTE = `
all_cust AS (
    SELECT DISTINCT customer_id FROM (
        SELECT customer_id FROM qb_estimates           WHERE company=$1 AND customer_id<>''
        UNION SELECT customer_id FROM qb_invoices             WHERE company=$1 AND customer_id<>''
        UNION SELECT customer_id FROM qb_payments            WHERE company=$1 AND customer_id<>''
        UNION SELECT customer_id FROM qb_bill_lines          WHERE company=$1 AND customer_id<>''
        UNION SELECT customer_id FROM qb_purchase_lines      WHERE company=$1 AND customer_id<>''
        UNION SELECT customer_id FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id<>''
        UNION SELECT customer_id FROM qb_purchase_order_lines WHERE company=$1 AND customer_id<>''
    ) z
),
cust_proj AS (
    SELECT ac.customer_id,
           COALESCE(NULLIF(qc.fully_qualified_name,''), NULLIF(qc.display_name,''), ac.customer_id) AS fqn,
           COALESCE(NULLIF(qc.display_name,''), '') AS dname
    FROM all_cust ac
    LEFT JOIN qb_customers qc ON qc.company=$1 AND qc.external_id=ac.customer_id
),
proj_key AS (
    SELECT customer_id, fqn,
        customer_id AS pkey,
        COALESCE(
            NULLIF(trim((string_to_array(fqn, ':'))[array_length(string_to_array(fqn, ':'), 1)]), ''),
            NULLIF(dname, ''),
            customer_id
        ) AS pname,
        CASE WHEN strpos(fqn, ':') > 0 THEN trim(split_part(fqn, ':', 1)) ELSE '' END AS client,
        -- QB "Customer name" = the project's immediate parent (second-to-last FQN
        -- segment): the development for "Client:Dev:Lot", the client for "Client:Lot".
        CASE WHEN array_length(string_to_array(fqn, ':'), 1) >= 2
             THEN trim((string_to_array(fqn, ':'))[array_length(string_to_array(fqn, ':'), 1) - 1])
             ELSE trim(fqn) END AS customer_group
    FROM cust_proj
)`

// projectsQuery returns one row per QB job/customer for the project list.
// %s is the optional year filter on qb_estimates.
const projectsQuery = `WITH ` + custProjCTE + `,
proj AS (
    SELECT pkey, MAX(pname) AS pname, MAX(client) AS client, MAX(customer_group) AS customer_group FROM proj_key GROUP BY pkey
),
est AS (
    SELECT pk.pkey, SUM(e.total_amount) AS total
    FROM qb_estimates e JOIN proj_key pk ON pk.customer_id = e.customer_id
    WHERE e.company=$1 AND e.customer_id<>''
    GROUP BY pk.pkey
),
-- inv = invoiced FLOW (periodized by invoice date); ar = open AR balance (baseline,
-- a current position so it is NOT periodized). $2/$3 = period window (full range = all).
inv AS (
    SELECT pk.pkey, SUM(i.total_amount) AS total
    FROM qb_invoices i JOIN proj_key pk ON pk.customer_id = i.customer_id
    WHERE i.company=$1 AND i.customer_id<>'' AND i.txn_date >= $2 AND i.txn_date < $3
    GROUP BY pk.pkey
),
ar AS (
    SELECT pk.pkey, SUM(COALESCE(i.balance,0)) AS balance
    FROM qb_invoices i JOIN proj_key pk ON pk.customer_id = i.customer_id
    WHERE i.company=$1 AND i.customer_id<>''
    GROUP BY pk.pkey
),
pay AS (
    SELECT pk.pkey, SUM(p.total_amount) AS total
    FROM qb_payments p JOIN proj_key pk ON pk.customer_id = p.customer_id
    WHERE p.company=$1 AND p.customer_id<>'' AND p.txn_date >= $2 AND p.txn_date < $3
    GROUP BY pk.pkey
),
exp AS (
    SELECT pk.pkey, x.amount FROM (
        SELECT bl.customer_id,  bl.amount FROM qb_bill_lines bl          JOIN qb_bills b           ON b.id=bl.bill_id            AND b.company=$1  WHERE bl.company=$1  AND b.txn_date  >= $2 AND b.txn_date  < $3
        UNION ALL SELECT pl.customer_id,  pl.amount FROM qb_purchase_lines pl       JOIN qb_purchases pu      ON pu.id=pl.purchase_id      AND pu.company=$1 WHERE pl.company=$1  AND pu.txn_date >= $2 AND pu.txn_date < $3
        UNION ALL SELECT vcl.customer_id, -vcl.amount FROM qb_vendor_credit_lines vcl JOIN qb_vendor_credits vc ON vc.id=vcl.vendor_credit_id AND vc.company=$1 WHERE vcl.company=$1 AND vc.txn_date >= $2 AND vc.txn_date < $3
    ) x JOIN proj_key pk ON pk.customer_id = x.customer_id
    WHERE x.customer_id<>''
),
cost AS (SELECT pkey, SUM(amount) AS total FROM exp GROUP BY pkey),
bill_cust AS (
    SELECT pk.pkey, bl.bill_id, SUM(bl.amount) AS proj_amt
    FROM qb_bill_lines bl JOIN proj_key pk ON pk.customer_id = bl.customer_id
    WHERE bl.company=$1 AND bl.customer_id<>''
    GROUP BY pk.pkey, bl.bill_id
),
open_payable AS (
    SELECT bc.pkey, SUM(b.balance * (bc.proj_amt / NULLIF(b.total_amount,0))) AS total
    FROM bill_cust bc JOIN qb_bills b ON b.id = bc.bill_id AND b.balance > 0
    GROUP BY bc.pkey
),
po AS (
    SELECT pk.pkey,
           SUM(pol.amount)                AS committed,
           SUM(COALESCE(pol.received, 0)) AS billed,
           SUM(CASE WHEN o.po_status='Open'
                    THEN GREATEST(pol.amount - COALESCE(pol.received,0), 0) ELSE 0 END) AS open_commit
    FROM qb_purchase_order_lines pol
    JOIN qb_purchase_orders o ON o.id = pol.po_id
    JOIN proj_key pk ON pk.customer_id = pol.customer_id
    WHERE pol.company=$1 AND pol.customer_id<>''
    GROUP BY pk.pkey
),
-- Contractor vendors = vendors with at least one PO in the project.
lab_vendor AS (
    SELECT DISTINCT pk.pkey, o.vendor_id
    FROM qb_purchase_order_lines pol
    JOIN qb_purchase_orders o ON o.id = pol.po_id
    JOIN proj_key pk ON pk.customer_id = pol.customer_id
    WHERE pol.company=$1 AND pol.customer_id<>'' AND o.vendor_id<>''
),
-- External IDs of the project's POs, per vendor (for matching bill→PO links).
lab_po AS (
    SELECT DISTINCT pk.pkey, o.vendor_id, o.external_id AS po_ext_id
    FROM qb_purchase_order_lines pol
    JOIN qb_purchase_orders o ON o.id = pol.po_id
    JOIN proj_key pk ON pk.customer_id = pol.customer_id
    WHERE pol.company=$1 AND pol.customer_id<>''
),
-- Payment total per project-attributed bill (no link join → no row multiplication).
lab_bill_pay AS (
    SELECT bc.pkey, bc.bill_id, b.vendor_id, bc.proj_amt, b.total_amount,
           SUM(bpl.amount) AS pay_amt
    FROM bill_cust bc
    JOIN qb_bills b ON b.id = bc.bill_id AND b.company=$1
    JOIN qb_bill_payment_links bpl
        ON bpl.txn_id   = b.external_id
       AND bpl.txn_type = 'Bill'
       AND bpl.company  = $1
    JOIN qb_bill_payments bp ON bp.id = bpl.bill_payment_id AND bp.company=$1
       AND bp.txn_date >= $2 AND bp.txn_date < $3
    GROUP BY bc.pkey, bc.bill_id, b.vendor_id, bc.proj_amt, b.total_amount
),
-- Mirror of the modal: a contractor vendor's payment counts when the bill has
-- no PO link, or links to one of this project's POs for that vendor.
lab_paid AS (
    SELECT lbp.pkey,
           SUM(lbp.pay_amt * (lbp.proj_amt / NULLIF(lbp.total_amount,0))) AS total
    FROM lab_bill_pay lbp
    JOIN lab_vendor lv ON lv.pkey = lbp.pkey AND lv.vendor_id = lbp.vendor_id
    WHERE NOT EXISTS (
            SELECT 1 FROM qb_bill_links bl
            WHERE bl.bill_id  = lbp.bill_id
              AND bl.txn_type = 'PurchaseOrder'
              AND bl.company  = $1
          )
       OR EXISTS (
            SELECT 1 FROM qb_bill_links bl
            JOIN lab_po lpo
              ON lpo.pkey      = lbp.pkey
             AND lpo.vendor_id = lbp.vendor_id
             AND lpo.po_ext_id = bl.txn_id
            WHERE bl.bill_id  = lbp.bill_id
              AND bl.txn_type = 'PurchaseOrder'
              AND bl.company  = $1
          )
    GROUP BY lbp.pkey
),
-- Billed = bill lines of contractor vendors attributed to the project (mirrors
-- the modal's vendorBilled), NOT PO line received — those diverge in practice.
lab_billed AS (
    SELECT pk.pkey, SUM(bl.amount) AS total
    FROM qb_bill_lines bl
    JOIN qb_bills b ON b.id = bl.bill_id AND b.company=$1
    JOIN proj_key pk ON pk.customer_id = bl.customer_id
    JOIN lab_vendor lv ON lv.pkey = pk.pkey AND lv.vendor_id = b.vendor_id
    WHERE bl.company=$1 AND bl.customer_id<>'' AND b.txn_date >= $2 AND b.txn_date < $3
    GROUP BY pk.pkey
),
-- Back charges (vendor credits) for contractor vendors; net out of billed & paid.
lab_bc AS (
    SELECT pk.pkey, SUM(vcl.amount) AS total
    FROM qb_vendor_credit_lines vcl
    JOIN qb_vendor_credits vc ON vc.id = vcl.vendor_credit_id AND vc.company=$1
    JOIN proj_key pk ON pk.customer_id = vcl.customer_id
    JOIN lab_vendor lv ON lv.pkey = pk.pkey AND lv.vendor_id = vc.vendor_id
    WHERE vcl.company=$1 AND vcl.customer_id<>'' AND vc.vendor_id<>'' AND vc.txn_date >= $2 AND vc.txn_date < $3
    GROUP BY pk.pkey
)
SELECT p.pkey, p.client, p.pname, p.customer_group,
       COALESCE(e.total,0), COALESCE(i.total,0), COALESCE(pa.total,0), COALESCE(co.total,0),
       COALESCE(op.total,0), COALESCE(pp.committed,0),
       COALESCE(lb.total,0) - COALESCE(lbc.total,0), COALESCE(pp.open_commit,0),
       COALESCE(lp.total,0) - COALESCE(lbc.total,0), COALESCE(ar.balance,0)
FROM proj p
LEFT JOIN est          e  ON e.pkey  = p.pkey
LEFT JOIN inv          i  ON i.pkey  = p.pkey
LEFT JOIN ar           ar ON ar.pkey = p.pkey
LEFT JOIN pay          pa ON pa.pkey = p.pkey
LEFT JOIN cost         co ON co.pkey = p.pkey
LEFT JOIN open_payable op ON op.pkey = p.pkey
LEFT JOIN po           pp ON pp.pkey = p.pkey
LEFT JOIN lab_paid     lp ON lp.pkey = p.pkey
LEFT JOIN lab_billed   lb ON lb.pkey = p.pkey
LEFT JOIN lab_bc       lbc ON lbc.pkey = p.pkey
WHERE COALESCE(e.total,0) <> 0 OR COALESCE(i.total,0) <> 0 OR COALESCE(pa.total,0) <> 0
   OR COALESCE(co.total,0) <> 0 OR COALESCE(pp.committed,0) <> 0
ORDER BY COALESCE(e.total,0) DESC, COALESCE(pp.committed,0) DESC
`

// GET /api/v1/budget/projects?company=hvac[&year=2025][&status=in_progress|settled]
// Returns []BudgetProjectDetail with header fields populated; line-item arrays are empty.
// Summary KPIs are computed client-side by aggregating the returned slice.
func (h *BudgetHandler) Projects(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	year, hasYear, err := parseYear(c.Query("year"))
	if err != nil {
		return err
	}
	month := parseMonth(c.Query("month"))
	statusFilter := c.Query("status")

	// Only realized FLOWS are periodized (invoiced/received/paid/cost incurred);
	// estimate, PO commitment and open balances stay the project's current totals.
	start, end := periodRange(hasYear, year, month)
	args := []any{company, start, end}

	rows, err := h.db.Query(c.Context(), projectsQuery, args...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	const eps = 1.0
	var out []BudgetProjectDetail
	for rows.Next() {
		var d BudgetProjectDetail
		var openPayable, invBalance float64
		if err := rows.Scan(
			&d.ProjectID, &d.ClientName, &d.Name, &d.CustomerGroup,
			&d.ProjectedReceive, &d.Invoiced, &d.Received, &d.CostTotal, &openPayable,
			&d.LaborCommitted, &d.LaborBilled, &d.LaborOpen, &d.LaborPaid, &invBalance,
		); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		d.ProjectType = projectType(d.Name)
		d.MarginTarget = profitMargin
		d.ToReceive = max0(invBalance)
		d.IncomeActual = d.Received + d.ToReceive
		d.OpenPayable = max0(openPayable)
		d.LaborPaid = max0(d.LaborPaid)
		d.Paid = max0(d.CostTotal - d.OpenPayable)
		d.ToPay = max0(d.LaborOpen) + max0(openPayable)
		d.CostCeiling = d.ProjectedReceive * (1 - profitMargin)
		d.OverCeiling = d.CostCeiling > 0 && d.CostTotal > d.CostCeiling
		hasActivity := d.Received > 0 || d.CostTotal > 0 || d.Invoiced > 0
		d.PotentiallyClosed = hasActivity && d.ToReceive <= eps && d.ToPay <= eps
		d.InProgress = hasActivity && !d.PotentiallyClosed
		d.IncomeAccounts = []IncomeAccount{}
		d.CostAccounts = []CostAccount{}
		d.PurchaseOrders = []PORow{}
		d.CostCategories = []CostCategory{}

		switch statusFilter {
		case "in_progress":
			if !d.InProgress {
				continue
			}
		case "settled":
			if !d.PotentiallyClosed {
				continue
			}
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if out == nil {
		out = []BudgetProjectDetail{}
	}
	return c.JSON(fiber.Map{"data": out})
}

// ── Raw customers (for the Project Assignment admin page) ─────────────────────

type BudgetCustomer struct {
	CustomerID string `json:"customer_id"`
	Name       string `json:"name"`
}

// GET /api/v1/budget/customers?company=framing
func (h *BudgetHandler) Customers(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	rows, err := h.db.Query(c.Context(), `WITH `+custProjCTE+`
		SELECT customer_id, fqn FROM cust_proj ORDER BY fqn`, company)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []BudgetCustomer{}
	for rows.Next() {
		var b BudgetCustomer
		rows.Scan(&b.CustomerID, &b.Name)
		out = append(out, b)
	}
	return c.JSON(fiber.Map{"data": out})
}

// ── Project detail ──────────────────────────────────────────────────────────

type POLineRow struct {
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Received    float64 `json:"received"`
	Open        float64 `json:"open"`
}

type PORow struct {
	ExternalID string      `json:"external_id"`
	DocNumber  string      `json:"doc_number"`
	TxnDate    string      `json:"txn_date"`
	VendorID   string      `json:"vendor_id"`
	VendorName string      `json:"vendor_name"`
	Category   string      `json:"category"`
	POStatus   string      `json:"po_status"`
	Committed  float64     `json:"committed"`
	Billed     float64     `json:"billed"`
	Open       float64     `json:"open"`
	Lines      []POLineRow `json:"lines"`
}

// VendorBackCharge is one vendor credit (back charge) issued to a subcontractor
// for this project — it reduces the net amount owed to the vendor.
type VendorBackCharge struct {
	Date      string  `json:"date"`
	Amount    float64 `json:"amount"`
	RefNumber string  `json:"ref_number"`
}

// POPayment is one bill payment attributed to a specific purchase order.
type POPayment struct {
	Date      string  `json:"date"`
	Amount    float64 `json:"amount"`
	RefNumber string  `json:"ref_number"`
}

// PODetail is a purchase order with its payment history resolved.
// Status: "settled" when paid >= billed (and billed > 0), "open" otherwise.
type PODetail struct {
	ExternalID string      `json:"external_id"`
	DocNumber  string      `json:"doc_number"`
	TxnDate    string      `json:"txn_date"`
	Status     string      `json:"status"`
	Committed  float64     `json:"committed"`
	Billed     float64     `json:"billed"`
	Paid       float64     `json:"paid"`
	Open       float64     `json:"open"`
	Payments   []POPayment `json:"payments"`
}

// CostVendor aggregates one subcontractor's PO commitments, payment history
// (per PO), and back charges (vendor credits) for a project.
type CostVendor struct {
	VendorID       string             `json:"vendor_id"`
	VendorName     string             `json:"vendor_name"`
	BudgetLimit    float64            `json:"budget_limit"` // per-sub budget (0 = none set)
	Committed      float64            `json:"committed"`
	Billed         float64            `json:"billed"`
	Paid           float64            `json:"paid"`
	Open           float64            `json:"open"`
	BackCharges    []VendorBackCharge `json:"back_charges"`
	PurchaseOrders []PODetail         `json:"purchase_orders"`
}

// CostCategory groups subcontractors (vendors) by the user-defined budget
// category. BudgetLimit is the effective ceiling (project override or default);
// 0 means no limit has been defined for this category.
type CostCategory struct {
	CategoryID   string       `json:"category_id"`
	CategoryName string       `json:"category_name"`
	Icon         string       `json:"icon"`
	BudgetLimit  float64      `json:"budget_limit"`
	Committed    float64      `json:"committed"`
	Billed       float64      `json:"billed"`
	Paid         float64      `json:"paid"`
	Open         float64      `json:"open"`
	Vendors      []CostVendor `json:"vendors"`
}

// IncomeAccount is one receivable category (mirrors QB P&L by Project income
// accounts: Sales +, Back Charges −, Extras +, Discounts −). Amount is signed.
// Outstanding is the unpaid portion: Σ(line_amount × invoice.balance/invoice.total).
type IncomeAccount struct {
	Name        string  `json:"name"`
	Amount      float64 `json:"amount"`
	Outstanding float64 `json:"outstanding"`
}

// CostAccount is one QB GL account with activity on the project.
// Amount is signed (vendor credits are negative) and rolled up from sub-accounts.
// Outstanding is the unpaid bill balance proportionally attributed to this account.
// Children are direct sub-accounts with their own activity (shown when expanded).
// BudgetLimit is the per-account spending ceiling (the "cost budget mapping");
// for the Contractors account it is derived from total contracted and Locked.
type CostAccount struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Group       string        `json:"-"` // internal sort key, not exposed
	Amount      float64       `json:"amount"`
	Paid        float64       `json:"paid"`
	Outstanding float64       `json:"outstanding"`
	BudgetLimit float64       `json:"budget_limit"`
	Deadline    *string       `json:"deadline"` // "YYYY-MM-DD" ceiling date, paired with the project's start_date
	Locked      bool          `json:"locked"`
	Children    []CostAccount `json:"children,omitempty"`
}

type BudgetProjectDetail struct {
	ProjectID     string  `json:"project_id"`
	ClientName    string  `json:"client_name"`
	Name          string  `json:"name"`
	CustomerGroup string  `json:"customer_group"` // QB "Customer name" — the immediate parent
	ProjectType   string  `json:"project_type"`
	MarginTarget  float64 `json:"margin_target"`
	StartDate     *string `json:"start_date"` // "YYYY-MM-DD", manual — paired with each account's Deadline

	// Income (a receber)
	ProjectedReceive float64         `json:"projected_receive"` // contract / estimate
	Invoiced         float64         `json:"invoiced"`          // total billed (gross)
	IncomeActual     float64         `json:"income_actual"`     // earned income = Σ categories (QB P&L income)
	Received         float64         `json:"received"`          // cash received (payments)
	ToReceive        float64         `json:"to_receive"`        // open invoice balance (AR)
	IncomeAccounts   []IncomeAccount `json:"income_accounts"`

	// Cost (a pagar) — incurred via bills/purchases/vendor credits
	CostTotal         float64       `json:"cost_total"`
	CostCeiling       float64       `json:"cost_ceiling"` // estimate * (1 - margin)
	OverCeiling       bool          `json:"over_ceiling"`
	Paid              float64       `json:"paid"`         // cost_total - open vendor bill balance
	OpenPayable       float64       `json:"open_payable"` // outstanding vendor bill balance
	ToPay             float64       `json:"to_pay"`       // open_payable + open PO commitment
	InProgress        bool          `json:"in_progress"`
	PotentiallyClosed bool          `json:"potentially_closed"`
	CostAccounts      []CostAccount `json:"cost_accounts"`

	// Forward subcontractor commitment (Purchase Orders)
	LaborCommitted float64 `json:"labor_committed"` // Σ PO committed — the "anchor" (what's been done in practice)
	LaborBudget    float64 `json:"labor_budget"`    // Σ category budgets — the official Contractors budget
	LaborBilled    float64 `json:"labor_billed"`
	LaborOpen      float64 `json:"labor_open"`
	LaborPaid      float64 `json:"labor_paid"`
	PurchaseOrders []PORow `json:"purchase_orders"`

	// Cost grouped by user-defined category (vendor → payments hierarchy).
	CostCategories []CostCategory `json:"cost_categories"`
}

// GET /api/v1/budget/projects/detail?company=hvac&project_id=<customer_id>
func (h *BudgetHandler) ProjectDetail(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	ctx := c.Context()

	d := BudgetProjectDetail{ProjectID: projectID, MarginTarget: profitMargin}

	// Resolve the project's customer IDs + display name/client from the hierarchy.
	custRows, err := h.db.Query(ctx, `WITH `+custProjCTE+`
		SELECT customer_id, pname, client FROM proj_key WHERE pkey=$2`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	var customerIDs []string
	for custRows.Next() {
		var id, pname, client string
		custRows.Scan(&id, &pname, &client)
		customerIDs = append(customerIDs, id)
		if d.Name == "" {
			d.Name = pname
		}
		if d.ClientName == "" {
			d.ClientName = client
		}
	}
	custRows.Close()
	d.ProjectType = projectType(d.Name)

	d.IncomeAccounts = []IncomeAccount{}
	d.CostAccounts = []CostAccount{}
	d.PurchaseOrders = []PORow{}
	d.CostCategories = []CostCategory{}

	if len(customerIDs) == 0 {
		return c.JSON(fiber.Map{"data": d})
	}

	// Header figures — aggregate across all customers of the project.
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(SUM(total_amount),0) FROM qb_estimates WHERE company=$1 AND customer_id=ANY($2)`, company, customerIDs).Scan(&d.ProjectedReceive)
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(SUM(total_amount),0) FROM qb_invoices  WHERE company=$1 AND customer_id=ANY($2)`, company, customerIDs).Scan(&d.Invoiced)
	var startDate *string
	if err := h.db.QueryRow(ctx, `SELECT to_char(start_date, 'YYYY-MM-DD') FROM budget_project_dates WHERE company=$1 AND project_id=$2`, company, d.ProjectID).Scan(&startDate); err == nil && startDate != nil && *startDate != "" {
		d.StartDate = startDate
	}
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount),0) FROM (
			SELECT amount FROM qb_bill_lines          WHERE company=$1 AND customer_id=ANY($2)
			UNION ALL SELECT amount FROM qb_purchase_lines      WHERE company=$1 AND customer_id=ANY($2)
			UNION ALL SELECT -amount FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id=ANY($2)
		) x
	`, company, customerIDs).Scan(&d.CostTotal)

	// Outstanding vendor bill balance (proportional to this project's share of each bill).
	_ = h.db.QueryRow(ctx, `
		WITH bill_cust AS (
			SELECT bl.bill_id, SUM(bl.amount) AS proj_amt
			FROM qb_bill_lines bl
			WHERE bl.company=$1 AND bl.customer_id=ANY($2)
			GROUP BY bl.bill_id
		)
		SELECT COALESCE(SUM(b.balance * (bc.proj_amt / NULLIF(b.total_amount,0))),0)
		FROM bill_cust bc
		JOIN qb_bills b ON b.id = bc.bill_id AND b.balance > 0
	`, company, customerIDs).Scan(&d.OpenPayable)

	// To receive = open invoice balance (real AR), matching QB / the Accounting page.
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(SUM(balance),0) FROM qb_invoices WHERE company=$1 AND customer_id=ANY($2)`, company, customerIDs).Scan(&d.ToReceive)
	d.CostCeiling = d.ProjectedReceive * (1 - profitMargin)
	d.Paid = max0(d.CostTotal - d.OpenPayable)

	// Income by category (a receber): invoice lines grouped by their item's income
	// account (Sales / Extra / Material Extra …) PLUS back charges (negative deposit
	// lines), mirroring QB "Profit and Loss by Project" income section.
	incRows, err := h.db.Query(ctx, `
		SELECT name, SUM(amount) AS amount, SUM(outstanding) AS outstanding FROM (
			SELECT COALESCE(NULLIF(item.data->'IncomeAccountRef'->>'name',''), NULLIF(il.item_ref_name,''), 'Uncategorized') AS name,
			       il.amount,
			       il.amount * COALESCE(i.balance / NULLIF(i.total_amount, 0), 0) AS outstanding
			FROM qb_invoice_lines il
			JOIN qb_invoices i ON i.id = il.invoice_id AND i.company=$1 AND i.customer_id=ANY($2)
			LEFT JOIN qb_raw item ON item.company=$1 AND item.entity='Item' AND item.external_id = il.item_ref_id
			UNION ALL
			SELECT 'Back Charges' AS name, dl.amount, 0::float8 AS outstanding
			FROM qb_deposit_lines dl
			WHERE dl.company=$1 AND dl.customer_id=ANY($2) AND dl.amount < 0
		) t
		GROUP BY name
		HAVING SUM(amount) <> 0
		ORDER BY amount DESC
	`, company, customerIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for incRows.Next() {
		var ia IncomeAccount
		incRows.Scan(&ia.Name, &ia.Amount, &ia.Outstanding)
		d.IncomeAccounts = append(d.IncomeAccounts, ia)
		d.IncomeActual += ia.Amount
		// Received mirrors the by-type breakdown (invoice.balance-derived) rather than
		// qb_payments, which under-counts balance paid off via credit memos/journal
		// entries that never sync as a Payment object. max0 per row matches the
		// frontend's per-type clamp so the header total ties to the visible breakdown.
		d.Received += max0(ia.Amount - ia.Outstanding)
	}
	incRows.Close()

	// Cost by QB account (a pagar), nested parent→child (mirrors QB P&L), grouped by
	// account type, vendor credits negative, deleted accounts via stored line name.
	d.CostAccounts, err = h.costAccountTree(ctx, company, customerIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	// Purchase orders for all customers of the project, with lines.
	poRows, err := h.db.Query(ctx, `
		SELECT DISTINCT o.id::text, o.external_id, COALESCE(o.doc_number,''),
		       to_char(o.txn_date,'YYYY-MM-DD'), COALESCE(o.vendor_id,''), COALESCE(o.vendor_name,''),
		       COALESCE(o.po_status,''), COALESCE(vc_cat.name, '')
		FROM qb_purchase_orders o
		JOIN qb_purchase_order_lines pol ON pol.po_id = o.id
		LEFT JOIN budget_vendor_categories bvc
		  ON bvc.company=$1 AND bvc.vendor_id=o.vendor_id AND bvc.project_type=$3
		LEFT JOIN budget_categories vc_cat ON vc_cat.id = bvc.category_id
		WHERE o.company=$1 AND pol.customer_id=ANY($2)
		ORDER BY o.external_id
	`, company, customerIDs, d.ProjectType)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	type poMeta struct {
		internalID string
		row        PORow
	}
	var pos []poMeta
	for poRows.Next() {
		var m poMeta
		poRows.Scan(&m.internalID, &m.row.ExternalID, &m.row.DocNumber, &m.row.TxnDate,
			&m.row.VendorID, &m.row.VendorName, &m.row.POStatus, &m.row.Category)
		m.row.Lines = []POLineRow{}
		pos = append(pos, m)
	}
	poRows.Close()

	if len(pos) > 0 {
		ids := make([]string, len(pos))
		idx := map[string]int{}
		for i, p := range pos {
			ids[i] = p.internalID
			idx[p.internalID] = i
		}
		lRows, _ := h.db.Query(ctx, `
			SELECT po_id::text, COALESCE(description,''), COALESCE(amount,0), COALESCE(received,0)
			FROM qb_purchase_order_lines
			WHERE company=$1 AND customer_id=ANY($2) AND po_id::text = ANY($3)
			ORDER BY po_id
		`, company, customerIDs, ids)
		for lRows.Next() {
			var poID string
			var l POLineRow
			lRows.Scan(&poID, &l.Description, &l.Amount, &l.Received)
			l.Open = max0(l.Amount - l.Received)
			if i, ok := idx[poID]; ok {
				pos[i].row.Lines = append(pos[i].row.Lines, l)
				pos[i].row.Committed += l.Amount
				pos[i].row.Billed += l.Received
			}
		}
		lRows.Close()
		for i := range pos {
			if pos[i].row.POStatus == "Open" {
				pos[i].row.Open = max0(pos[i].row.Committed - pos[i].row.Billed)
			}
		}
	}
	d.PurchaseOrders = make([]PORow, len(pos))
	for i, p := range pos {
		d.PurchaseOrders[i] = p.row
	}

	// Labor totals across all POs (forward subcontractor commitment).
	for _, p := range pos {
		d.LaborCommitted += p.row.Committed
		d.LaborBilled += p.row.Billed
		d.LaborOpen += p.row.Open
	}

	d.ToPay = max0(d.OpenPayable) + max0(d.LaborOpen)

	d.CostCategories, _ = h.costCategoryTree(ctx, company, d.ProjectType, d.ProjectID, customerIDs, d.PurchaseOrders)

	// Contractors budget = Σ category budgets (the official budget). Σ PO committed
	// stays in LaborCommitted as the practical "anchor".
	for _, cc := range d.CostCategories {
		d.LaborBudget += cc.BudgetLimit
	}

	// Cost budget per account: manual ceiling stored per (company, project, account);
	// the Contractors account is derived from the Contractors budget (Σ category
	// budgets) and locked — change it by editing the category budgets.
	applyAccountBudgets(d.CostAccounts, h.accountLimits(ctx, company, projectID), d.LaborBudget)

	return c.JSON(fiber.Map{"data": d})
}

// accountLimit is the manual per-account ceiling plus the optional deadline
// date used to draw a progressive budget-adherence line.
type accountLimit struct {
	Amount   float64
	Deadline *string
}

// accountLimits returns the manual per-account ceilings for a project.
func (h *BudgetHandler) accountLimits(ctx context.Context, company, projectID string) map[string]accountLimit {
	out := map[string]accountLimit{}
	rows, err := h.db.Query(ctx, `
		SELECT account_id, amount, to_char(deadline, 'YYYY-MM-DD') FROM budget_project_account_limits
		WHERE company=$1 AND project_id=$2
	`, company, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var l accountLimit
		var deadline *string
		rows.Scan(&id, &l.Amount, &deadline)
		if deadline != nil && *deadline != "" {
			l.Deadline = deadline
		}
		out[id] = l
	}
	return out
}

// applyAccountBudgets sets BudgetLimit/Deadline on each top-level cost account.
// The Contractors account is locked to total contracted; all others use the
// stored manual ceiling (0 = not yet defined).
func applyAccountBudgets(accounts []CostAccount, limits map[string]accountLimit, totalContracted float64) {
	for i := range accounts {
		if strings.EqualFold(accounts[i].Name, "Contractors") {
			accounts[i].BudgetLimit = totalContracted
			accounts[i].Locked = true
			continue
		}
		l := limits[accounts[i].ID]
		accounts[i].BudgetLimit = l.Amount
		accounts[i].Deadline = l.Deadline
	}
}

// AccountPayee is one vendor/employee whose bills compose a cost account on a
// project, with a user-set flag marking whether they were the supervisor.
type AccountPayee struct {
	VendorID     string  `json:"vendor_id"`
	VendorName   string  `json:"vendor_name"`
	Amount       float64 `json:"amount"`
	IsSupervisor bool    `json:"is_supervisor"`
}

// GET /api/v1/budget/projects/account-payees?company=&project_id=&account_id=
// Vendors whose bill lines post to the given account on this project (Payroll-COGS
// being the main case), with the supervisor flag — feeds the supervisor/normal split.
func (h *BudgetHandler) AccountPayees(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	accountID := c.Query("account_id")
	if company == "" || projectID == "" || accountID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id and account_id are required")
	}
	ctx := c.Context()
	rows, err := h.db.Query(ctx, `WITH `+custProjCTE+`,
		cust AS (SELECT customer_id FROM proj_key WHERE pkey=$2)
		SELECT b.vendor_id,
		       COALESCE(NULLIF(v.display_name,''), b.vendor_id) AS name,
		       SUM(bl.amount) AS amount
		FROM qb_bill_lines bl
		JOIN qb_bills b ON b.id = bl.bill_id AND b.company=$1
		LEFT JOIN qb_vendors v ON v.company=$1 AND v.external_id=b.vendor_id
		WHERE bl.company=$1 AND bl.customer_id IN (SELECT customer_id FROM cust)
		  AND bl.account_ref_id=$3 AND COALESCE(b.vendor_id,'')<>''
		GROUP BY b.vendor_id, v.display_name
		HAVING SUM(bl.amount) <> 0
		ORDER BY amount DESC`, company, projectID, accountID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []AccountPayee{}
	for rows.Next() {
		var p AccountPayee
		rows.Scan(&p.VendorID, &p.VendorName, &p.Amount)
		out = append(out, p)
	}

	sup := map[string]bool{}
	if sRows, err := h.db.Query(ctx, `SELECT vendor_id FROM budget_payroll_supervisors WHERE company=$1 AND project_id=$2 AND account_id=$3`, company, projectID, accountID); err == nil {
		for sRows.Next() {
			var vid string
			sRows.Scan(&vid)
			sup[vid] = true
		}
		sRows.Close()
	}
	for i := range out {
		out[i].IsSupervisor = sup[out[i].VendorID]
	}
	return c.JSON(fiber.Map{"data": out})
}

// GET /api/v1/budget/projects/account-history?company=&project_id=&account_ids=id1,id2
// Monthly Paid total attributed to the given account(s) on this project — the
// payment series behind a cost account, for the per-account distribution chart.
// account_ids should include an account plus its sub-accounts to mirror the tree.
func (h *BudgetHandler) AccountPaidHistory(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	accountParam := c.Query("account_ids")
	if company == "" || projectID == "" || accountParam == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id and account_ids are required")
	}
	accountIDs := strings.Split(accountParam, ",")
	ctx := c.Context()

	var customerIDs []string
	custRows, err := h.db.Query(ctx, `WITH `+custProjCTE+`
		SELECT customer_id FROM proj_key WHERE pkey=$2`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for custRows.Next() {
		var id string
		custRows.Scan(&id)
		customerIDs = append(customerIDs, id)
	}
	custRows.Close()

	type point struct {
		Month string  `json:"month"`
		Paid  float64 `json:"paid"`
	}
	out := []point{}
	if len(customerIDs) == 0 {
		return c.JSON(fiber.Map{"data": out})
	}

	// acct_amt = this project's bill lines posted to the target account(s);
	// each payment is attributed by that account's share of the whole bill.
	rows, err := h.db.Query(ctx, `
		WITH pb AS (
			SELECT b.id AS bill_id, b.external_id AS bill_ext_id, b.total_amount,
			       SUM(bl.amount) FILTER (WHERE COALESCE(NULLIF(bl.account_ref_id,''),'noacct') = ANY($3)) AS acct_amt
			FROM qb_bills b
			JOIN qb_bill_lines bl ON bl.bill_id = b.id AND bl.company=$1
			WHERE b.company=$1 AND bl.customer_id = ANY($2)
			GROUP BY b.id, b.external_id, b.total_amount
		)
		SELECT to_char(date_trunc('month', bp.txn_date),'YYYY-MM') AS month,
		       SUM(bpl.amount * CASE WHEN pb.total_amount=0 THEN 0 ELSE pb.acct_amt/pb.total_amount END) AS paid
		FROM pb
		JOIN qb_bill_payment_links bpl ON bpl.txn_id = pb.bill_ext_id AND bpl.txn_type='Bill' AND bpl.company=$1
		JOIN qb_bill_payments bp ON bp.id = bpl.bill_payment_id AND bp.company=$1
		WHERE COALESCE(pb.acct_amt,0) <> 0
		GROUP BY 1
		ORDER BY 1
	`, company, customerIDs, accountIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	for rows.Next() {
		var p point
		rows.Scan(&p.Month, &p.Paid)
		out = append(out, p)
	}
	return c.JSON(fiber.Map{"data": out})
}

// GET /api/v1/budget/projects/income-history?company=&project_id=&type=<income account name>
// Monthly invoiced amount for one income type (Sales / Extra / Back Charges …) —
// the distribution behind an income type, for the per-type chart. Mirrors the
// income-by-type breakdown: invoice item lines by income account + negative
// deposit lines as "Back Charges", here grouped by month instead of summed.
func (h *BudgetHandler) IncomeTypeHistory(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	typ := c.Query("type")
	if company == "" || projectID == "" || typ == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, project_id and type are required")
	}
	ctx := c.Context()

	var customerIDs []string
	custRows, err := h.db.Query(ctx, `WITH `+custProjCTE+`
		SELECT customer_id FROM proj_key WHERE pkey=$2`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for custRows.Next() {
		var id string
		custRows.Scan(&id)
		customerIDs = append(customerIDs, id)
	}
	custRows.Close()

	type point struct {
		Month  string  `json:"month"`
		Amount float64 `json:"amount"`
	}
	out := []point{}
	if len(customerIDs) == 0 {
		return c.JSON(fiber.Map{"data": out})
	}

	rows, err := h.db.Query(ctx, `
		SELECT to_char(date_trunc('month', t.d),'YYYY-MM') AS month, SUM(t.amount) AS amount
		FROM (
			SELECT COALESCE(NULLIF(item.data->'IncomeAccountRef'->>'name',''), NULLIF(il.item_ref_name,''), 'Uncategorized') AS name,
			       il.amount AS amount, i.txn_date AS d
			FROM qb_invoice_lines il
			JOIN qb_invoices i ON i.id = il.invoice_id AND i.company=$1 AND i.customer_id=ANY($2)
			LEFT JOIN qb_raw item ON item.company=$1 AND item.entity='Item' AND item.external_id = il.item_ref_id
			UNION ALL
			SELECT 'Back Charges' AS name, dl.amount AS amount, d.txn_date AS d
			FROM qb_deposit_lines dl
			JOIN qb_deposits d ON d.id = dl.deposit_id AND d.company=$1
			WHERE dl.company=$1 AND dl.customer_id=ANY($2) AND dl.amount < 0
		) t
		WHERE t.name = $3 AND t.d IS NOT NULL
		GROUP BY 1
		ORDER BY 1
	`, company, customerIDs, typ)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	for rows.Next() {
		var p point
		rows.Scan(&p.Month, &p.Amount)
		out = append(out, p)
	}
	return c.JSON(fiber.Map{"data": out})
}

// ── Labor estimate (current pay period) ──────────────────────────────────────

// LaborEstimateEmployee is one worker's labor accrued on the project this period.
type LaborEstimateEmployee struct {
	Name         string  `json:"name"`
	RegularHours float64 `json:"regular_hours"`
	OTHours      float64 `json:"ot_hours"`
	TotalHours   float64 `json:"total_hours"`
	PayRate      float64 `json:"pay_rate"`
	RegularCost  float64 `json:"regular_cost"`
	OTCost       float64 `json:"ot_cost"`
	TotalCost    float64 `json:"total_cost"`
}

// LaborEstimate is the projected payroll cost accruing on a project during the
// current (open) pay period — labor logged in QB Time that has not yet been
// posted as a QB cost. HasMapping is false when no QB Time address is linked to
// the project (Labor Mapping); HasData is false when the open period has no
// logged hours for it yet.
type LaborEstimate struct {
	Company      string                  `json:"company"`
	ProjectID    string                  `json:"project_id"`
	HasMapping   bool                    `json:"has_mapping"`
	HasData      bool                    `json:"has_data"`
	Addresses    []string                `json:"addresses"` // QB Time address keys linked to the project
	PeriodStart  string                  `json:"period_start"`
	PeriodEnd    string                  `json:"period_end"`
	RegularHours float64                 `json:"regular_hours"`
	OTHours      float64                 `json:"ot_hours"`
	TotalHours   float64                 `json:"total_hours"`
	RegularCost  float64                 `json:"regular_cost"`
	OTCost       float64                 `json:"ot_cost"`
	TotalCost    float64                 `json:"total_cost"`
	Employees    []LaborEstimateEmployee `json:"employees"`
}

// GET /api/v1/budget/projects/labor-estimate?company=&project_id=
// Estimated payroll cost accruing on this project during the CURRENT (open) pay
// period. QB Time addresses are linked to QBO projects in Labor Mapping
// (qbtime_project_mappings); the latest cached pay period is the in-progress one.
// Regular and overtime hours come from QB Time's payroll_by_jobcode aggregation,
// costed at the worker's pay rate (OT = 1.5×) — mirroring the Job Costing report.
func (h *BudgetHandler) LaborEstimate(c *fiber.Ctx) error {
	company := c.Query("company")
	projectID := c.Query("project_id")
	if company == "" || projectID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and project_id are required")
	}
	ctx := c.Context()

	est := LaborEstimate{Company: company, ProjectID: projectID, Addresses: []string{}, Employees: []LaborEstimateEmployee{}}

	// Resolve the open pay period up front so the observed window is always shown,
	// even when the project has no mapping or no hours logged yet.
	if h.periodSvc != nil {
		est.PeriodStart, est.PeriodEnd = h.periodSvc.CurrentPeriod(company)
	}

	// Customer IDs that make up the project.
	var customerIDs []string
	custRows, err := h.db.Query(ctx, `WITH `+custProjCTE+`
		SELECT customer_id FROM proj_key WHERE pkey=$2`, company, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for custRows.Next() {
		var id string
		custRows.Scan(&id)
		customerIDs = append(customerIDs, id)
	}
	custRows.Close()
	if len(customerIDs) == 0 {
		return c.JSON(fiber.Map{"data": est})
	}

	// QB Time address keys linked to this project.
	addrKeys := map[string]bool{}
	akRows, err := h.db.Query(ctx, `
		SELECT address_key FROM qbtime_project_mappings
		WHERE company=$1 AND customer_id=ANY($2)`, company, customerIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for akRows.Next() {
		var k string
		akRows.Scan(&k)
		addrKeys[k] = true
		est.Addresses = append(est.Addresses, k)
	}
	akRows.Close()
	sort.Strings(est.Addresses)
	est.HasMapping = len(addrKeys) > 0
	if !est.HasMapping || h.periodSvc == nil {
		return c.JSON(fiber.Map{"data": est})
	}

	// Open pay period payroll, fetched live from QB Time so the forecast reflects
	// hours logged "right now" — not whatever the daily cache last pulled.
	prRows, start, end, perr := h.periodSvc.CurrentPeriodPayroll(ctx, company)
	est.PeriodStart, est.PeriodEnd = start, end
	if perr != nil {
		return c.JSON(fiber.Map{"data": est})
	}

	type agg struct {
		regSec, otSec int
		payRate       float64
	}
	byEmp := map[string]*agg{}
	for _, pr := range prRows {
		if len(pr.JobcodePath) == 0 || isOverhead(pr.JobcodePath) {
			continue
		}
		if !addrKeys[addressKey(pr.JobcodePath)] {
			continue
		}
		a := byEmp[pr.UserName]
		if a == nil {
			a = &agg{payRate: pr.PayRate}
			byEmp[pr.UserName] = a
		}
		a.regSec += pr.RegSeconds
		a.otSec += pr.OTSeconds
		if a.payRate == 0 {
			a.payRate = pr.PayRate
		}
	}

	for name, a := range byEmp {
		regH := round2(float64(a.regSec) / 3600.0)
		otH := round2(float64(a.otSec) / 3600.0)
		if regH == 0 && otH == 0 {
			continue
		}
		otRate := round2(a.payRate * 1.5)
		regCost := round2(regH * a.payRate)
		otCost := round2(otH * otRate)
		est.Employees = append(est.Employees, LaborEstimateEmployee{
			Name:         name,
			RegularHours: regH,
			OTHours:      otH,
			TotalHours:   round2(regH + otH),
			PayRate:      a.payRate,
			RegularCost:  regCost,
			OTCost:       otCost,
			TotalCost:    round2(regCost + otCost),
		})
		est.RegularHours = round2(est.RegularHours + regH)
		est.OTHours = round2(est.OTHours + otH)
		est.RegularCost = round2(est.RegularCost + regCost)
		est.OTCost = round2(est.OTCost + otCost)
	}
	est.TotalHours = round2(est.RegularHours + est.OTHours)
	est.TotalCost = round2(est.RegularCost + est.OTCost)
	est.HasData = len(est.Employees) > 0

	sort.Slice(est.Employees, func(i, j int) bool {
		return est.Employees[i].TotalCost > est.Employees[j].TotalCost
	})

	return c.JSON(fiber.Map{"data": est})
}

// LaborSummaryItem is one project's in-progress labor cost for the open period.
type LaborSummaryItem struct {
	ProjectID string  `json:"project_id"`
	TotalCost float64 `json:"total_cost"`
}

// GET /api/v1/budget/labor-estimate-summary?company=hvac
// Per-project in-progress labor cost for the open pay period — a lightweight
// roll-up so the project list can flag which projects have cost accruing. One
// live QB Time payroll fetch for the whole company is distributed across projects
// via the address mappings (much cheaper than per-project for a list).
func (h *BudgetHandler) LaborEstimateSummary(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	ctx := c.Context()
	out := []LaborSummaryItem{}
	if h.periodSvc == nil {
		return c.JSON(fiber.Map{"data": out})
	}

	// address_key → project_id (a project's pkey is its customer_id).
	addrToProj := map[string]string{}
	rows, err := h.db.Query(ctx, `
		SELECT address_key, customer_id FROM qbtime_project_mappings WHERE company=$1`, company)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for rows.Next() {
		var ak, cid string
		rows.Scan(&ak, &cid)
		addrToProj[ak] = cid
	}
	rows.Close()
	if len(addrToProj) == 0 {
		return c.JSON(fiber.Map{"data": out})
	}

	prRows, _, _, perr := h.periodSvc.CurrentPeriodPayroll(ctx, company)
	if perr != nil {
		return c.JSON(fiber.Map{"data": out})
	}

	costByProj := map[string]float64{}
	for _, pr := range prRows {
		if len(pr.JobcodePath) == 0 || isOverhead(pr.JobcodePath) {
			continue
		}
		pkey, ok := addrToProj[addressKey(pr.JobcodePath)]
		if !ok {
			continue
		}
		regH := float64(pr.RegSeconds) / 3600.0
		otH := float64(pr.OTSeconds) / 3600.0
		costByProj[pkey] += regH*pr.PayRate + otH*(pr.PayRate*1.5)
	}
	for pkey, cost := range costByProj {
		if cost <= 0 {
			continue
		}
		out = append(out, LaborSummaryItem{ProjectID: pkey, TotalCost: round2(cost)})
	}
	return c.JSON(fiber.Map{"data": out})
}

// costCategoryTree groups the project's POs by user-defined budget category.
// Payments are resolved per PO via qb_bill_links (Bill → PurchaseOrder).
// Back charges stay at vendor level (QB vendor credits carry no PO reference).
func (h *BudgetHandler) costCategoryTree(
	ctx context.Context, company, projType, projectID string,
	customerIDs []string, pos []PORow,
) ([]CostCategory, error) {
	// ── Category catalog: every active category for this project type ─────────
	type catDef struct {
		id, name, icon string
		sortOrder      int
	}
	catsByID := map[string]catDef{}
	{
		rows, err := h.db.Query(ctx, `
			SELECT id::text, name, COALESCE(NULLIF(icon,''),'Tag'), sort_order
			FROM budget_categories WHERE active = true AND project_type = $1
		`, projType)
		if err == nil {
			for rows.Next() {
				var cd catDef
				rows.Scan(&cd.id, &cd.name, &cd.icon, &cd.sortOrder)
				catsByID[cd.id] = cd
			}
			rows.Close()
		}
	}

	// ── Effective category budget: per-project override (max_value) → category
	//    default_max → 0. The INDEPENDENT category budget, decoupled from POs. ──
	catLimits := map[string]float64{}
	budgetedCats := map[string]bool{}
	{
		rows, err := h.db.Query(ctx, `
			SELECT bc.id::text,
			       COALESCE(
			           (SELECT max_value FROM budget_project_category_limits
			            WHERE category_id = bc.id AND project_id = $2 AND company = $1),
			           bc.default_max,
			           0
			       ) AS effective_limit
			FROM budget_categories bc
			WHERE bc.active = true AND bc.project_type = $3
		`, company, projectID, projType)
		if err == nil {
			for rows.Next() {
				var catID string
				var limit float64
				rows.Scan(&catID, &limit)
				catLimits[catID] = limit
				if limit > 0 {
					budgetedCats[catID] = true
				}
			}
			rows.Close()
		}
	}

	// Nothing to show: no POs and no budgeted categories.
	if len(pos) == 0 && len(budgetedCats) == 0 {
		return []CostCategory{}, nil
	}

	// ── 1. Payments keyed by (vendorID, po_external_id) ──────────────────────
	// Bills are linked to POs via qb_bill_links (txn_type='PurchaseOrder').
	// LEFT JOIN captures payments on bills with no PO link → poExtID = "".
	type pmtKey struct{ vendorID, poExtID string }
	poPayments := map[pmtKey][]POPayment{}
	{
		rows, err := h.db.Query(ctx, `
			WITH pb AS (
				SELECT b.id AS bill_id, b.external_id AS bill_ext_id,
				       b.vendor_id, b.total_amount,
				       SUM(bl.amount) AS proj_amt
				FROM qb_bills b
				JOIN qb_bill_lines bl ON bl.bill_id = b.id AND bl.company = $1
				WHERE b.company = $1 AND bl.customer_id = ANY($2)
				GROUP BY b.id, b.external_id, b.vendor_id, b.total_amount
			)
			SELECT pb.vendor_id,
			       COALESCE(blinks.txn_id, '') AS po_ext_id,
			       to_char(bp.txn_date,'YYYY-MM-DD'),
			       bpl.amount * CASE WHEN pb.total_amount=0 THEN 0
			                         ELSE pb.proj_amt / pb.total_amount END,
			       COALESCE(NULLIF(bp.doc_number,''), bp.external_id, '')
			FROM pb
			LEFT JOIN qb_bill_links blinks
			       ON blinks.bill_id = pb.bill_id
			      AND blinks.txn_type = 'PurchaseOrder'
			      AND blinks.company  = $1
			JOIN qb_bill_payment_links bpl
			       ON bpl.txn_id    = pb.bill_ext_id
			      AND bpl.txn_type  = 'Bill'
			      AND bpl.company   = $1
			JOIN qb_bill_payments bp ON bp.id = bpl.bill_payment_id AND bp.company = $1
			ORDER BY pb.vendor_id, po_ext_id, bp.txn_date
		`, company, customerIDs)
		if err == nil {
			for rows.Next() {
				var vendorID, poExtID, date, ref string
				var amt float64
				rows.Scan(&vendorID, &poExtID, &date, &amt, &ref)
				k := pmtKey{vendorID, poExtID}
				poPayments[k] = append(poPayments[k], POPayment{Date: date, Amount: amt, RefNumber: ref})
			}
			rows.Close()
		}
	}

	// ── 2. Back charges (vendor credits) per vendor ───────────────────────────
	// qb_vendor_credit_lines has no PO reference in QB, so credits stay vendor-level.
	vendorCredits := map[string][]VendorBackCharge{}
	{
		rows, err := h.db.Query(ctx, `
			SELECT vc.vendor_id,
			       to_char(vc.txn_date,'YYYY-MM-DD'),
			       SUM(vcl.amount),
			       COALESCE(NULLIF(vc.doc_number,''), vc.external_id, '')
			FROM qb_vendor_credits vc
			JOIN qb_vendor_credit_lines vcl ON vcl.vendor_credit_id = vc.id AND vcl.company = $1
			WHERE vc.company = $1 AND vcl.customer_id = ANY($2) AND vc.vendor_id <> ''
			GROUP BY vc.vendor_id, vc.txn_date, vc.doc_number, vc.external_id
			ORDER BY vc.vendor_id, vc.txn_date
		`, company, customerIDs)
		if err == nil {
			for rows.Next() {
				var vid, date, ref string
				var amt float64
				rows.Scan(&vid, &date, &amt, &ref)
				vendorCredits[vid] = append(vendorCredits[vid], VendorBackCharge{Date: date, Amount: amt, RefNumber: ref})
			}
			rows.Close()
		}
	}

	// ── 3. Bill amounts per vendor (billed = Σ bill lines for this project) ───
	vendorBilled := map[string]float64{}
	{
		rows, err := h.db.Query(ctx, `
			SELECT b.vendor_id, SUM(bl.amount)
			FROM qb_bill_lines bl
			JOIN qb_bills b ON b.id = bl.bill_id AND b.company = $1
			WHERE bl.company = $1 AND bl.customer_id = ANY($2) AND b.vendor_id <> ''
			GROUP BY b.vendor_id
		`, company, customerIDs)
		if err == nil {
			for rows.Next() {
				var vid string
				var amt float64
				rows.Scan(&vid, &amt)
				vendorBilled[vid] = amt
			}
			rows.Close()
		}
	}

	// ── 4. Vendor → category: per-project override wins over the global map. ──
	vendorCat := map[string]string{} // vendor_id → category_id
	{
		rows, err := h.db.Query(ctx, `
			SELECT bvc.vendor_id, bvc.category_id::text
			FROM budget_vendor_categories bvc
			JOIN budget_categories bc ON bc.id = bvc.category_id AND bc.active = true
			WHERE bvc.company = $1 AND bvc.project_type = $2
		`, company, projType)
		if err == nil {
			for rows.Next() {
				var vid, cid string
				rows.Scan(&vid, &cid)
				vendorCat[vid] = cid
			}
			rows.Close()
		}
	}
	{
		rows, err := h.db.Query(ctx, `
			SELECT pvc.vendor_id, pvc.category_id::text
			FROM budget_project_vendor_categories pvc
			JOIN budget_categories bc ON bc.id = pvc.category_id AND bc.active = true
			WHERE pvc.company = $1 AND pvc.project_id = $2
		`, company, projectID)
		if err == nil {
			for rows.Next() {
				var vid, cid string
				rows.Scan(&vid, &cid)
				vendorCat[vid] = cid // override
			}
			rows.Close()
		}
	}

	// ── 5. Per-sub budget: (category_id, vendor_id) → amount. ─────────────────
	type subKey struct{ catID, vendorID string }
	vendorLimits := map[subKey]float64{}
	{
		rows, err := h.db.Query(ctx, `
			SELECT category_id::text, vendor_id, amount
			FROM budget_project_vendor_limits
			WHERE company = $1 AND project_id = $2
		`, company, projectID)
		if err == nil {
			for rows.Next() {
				var cid, vid string
				var amt float64
				rows.Scan(&cid, &vid, &amt)
				vendorLimits[subKey{cid, vid}] = amt
			}
			rows.Close()
		}
	}

	// ── 6. Aggregate POs per vendor ───────────────────────────────────────────
	type vendorAgg struct {
		id, name, catID string
		committed, billed float64
		backCharges       []VendorBackCharge
		pos               []PORow
	}
	vendorOrder := []string{}
	vendorMap := map[string]*vendorAgg{}
	for _, po := range pos {
		vid := po.VendorID
		if vid == "" {
			vid = "__" + po.VendorName
		}
		if _, ok := vendorMap[vid]; !ok {
			vendorMap[vid] = &vendorAgg{id: vid, name: po.VendorName, catID: vendorCat[po.VendorID]}
			vendorOrder = append(vendorOrder, vid)
		}
		vd := vendorMap[vid]
		vd.committed += po.Committed
		vd.pos = append(vd.pos, po)
	}
	for _, vid := range vendorOrder {
		vendorMap[vid].billed = vendorBilled[vendorMap[vid].id]
	}
	for vid, credits := range vendorCredits {
		if vd, ok := vendorMap[vid]; ok {
			vd.backCharges = credits
		}
	}

	// ── 7. Group vendors by category ─────────────────────────────────────────
	type catGroup struct {
		def     catDef
		vendors []*vendorAgg
	}
	catOrderSlice := []string{}
	catMap := map[string]*catGroup{}
	var uncatVendors []*vendorAgg

	ensureCat := func(catID string) {
		if _, ok := catMap[catID]; ok {
			return
		}
		def := catsByID[catID]
		if def.id == "" {
			def.id = catID
		}
		catMap[catID] = &catGroup{def: def}
		catOrderSlice = append(catOrderSlice, catID)
	}

	for _, vid := range vendorOrder {
		vd := vendorMap[vid]
		if vd.catID == "" {
			uncatVendors = append(uncatVendors, vd)
			continue
		}
		ensureCat(vd.catID)
		catMap[vd.catID].vendors = append(catMap[vd.catID].vendors, vd)
	}

	// Surface budgeted categories with no PO/spend so they can be seen and edited.
	for catID := range budgetedCats {
		ensureCat(catID)
	}

	sort.Slice(catOrderSlice, func(i, j int) bool {
		a, b := catsByID[catOrderSlice[i]], catsByID[catOrderSlice[j]]
		if a.sortOrder != b.sortOrder {
			return a.sortOrder < b.sortOrder
		}
		return a.name < b.name
	})

	// ── 8. Assemble output ────────────────────────────────────────────────────
	mkPODetail := func(po PORow, vendorID string) PODetail {
		pmts := poPayments[pmtKey{vendorID, po.ExternalID}]
		var paid float64
		for _, p := range pmts {
			paid += p.Amount
		}
		if pmts == nil {
			pmts = []POPayment{}
		}
		status := "open"
		if po.Billed > 0 && paid >= po.Billed {
			status = "settled"
		}
		return PODetail{
			ExternalID: po.ExternalID,
			DocNumber:  po.DocNumber,
			TxnDate:    po.TxnDate,
			Status:     status,
			Committed:  po.Committed,
			Billed:     po.Billed,
			Paid:       paid,
			Open:       max0(po.Committed - paid),
			Payments:   pmts,
		}
	}

	mkVendor := func(vd *vendorAgg) CostVendor {
		details := make([]PODetail, 0, len(vd.pos))
		var paidTotal float64
		for _, po := range vd.pos {
			pod := mkPODetail(po, vd.id)
			paidTotal += pod.Paid
			details = append(details, pod)
		}
		// Add payments not linked to any PO (po_ext_id = "") to vendor total
		for _, p := range poPayments[pmtKey{vd.id, ""}] {
			paidTotal += p.Amount
		}
		bcs := vd.backCharges
		if bcs == nil {
			bcs = []VendorBackCharge{}
		}
		return CostVendor{
			VendorID:       vd.id,
			VendorName:     vd.name,
			BudgetLimit:    vendorLimits[subKey{vd.catID, vd.id}],
			Committed:      vd.committed,
			Billed:         vd.billed,
			Paid:           paidTotal,
			Open:           max0(vd.committed - paidTotal),
			BackCharges:    bcs,
			PurchaseOrders: details,
		}
	}

	mkCat := func(def catDef, vendors []*vendorAgg) CostCategory {
		cc := CostCategory{
			CategoryID:   def.id,
			CategoryName: def.name,
			Icon:         def.icon,
			BudgetLimit:  catLimits[def.id],
			Vendors:      make([]CostVendor, 0, len(vendors)),
		}
		for _, vd := range vendors {
			cv := mkVendor(vd)
			cc.Vendors = append(cc.Vendors, cv)
			cc.Committed += cv.Committed
			cc.Billed += cv.Billed
			cc.Paid += cv.Paid
			cc.Open += cv.Open
		}
		sort.Slice(cc.Vendors, func(i, j int) bool {
			return cc.Vendors[i].Committed > cc.Vendors[j].Committed
		})
		return cc
	}

	out := make([]CostCategory, 0, len(catOrderSlice)+1)
	for _, catID := range catOrderSlice {
		out = append(out, mkCat(catMap[catID].def, catMap[catID].vendors))
	}
	if len(uncatVendors) > 0 {
		out = append(out, mkCat(catDef{name: "Uncategorized", icon: "Tag"}, uncatVendors))
	}
	return out, nil
}

// costAccountTree builds the project's cost broken down by QB GL account, nested
// parent→child via the account hierarchy (sub-accounts roll up into their parent,
// like QB "Profit and Loss by Project"). Vendor credits are negative. Top-level
// nodes are grouped by account type (Cost of Goods Sold / Expense / Other) and a
// parent's amount includes its children.
func (h *BudgetHandler) costAccountTree(ctx context.Context, company string, customerIDs []string) ([]CostAccount, error) {
	// Leaf amounts per account that has activity on this project.
	rows, err := h.db.Query(ctx, `
		WITH exp AS (
			SELECT account_ref_id, account_ref_name, amount FROM qb_bill_lines          WHERE company=$1 AND customer_id=ANY($2)
			UNION ALL SELECT account_ref_id, account_ref_name, amount FROM qb_purchase_lines      WHERE company=$1 AND customer_id=ANY($2)
			UNION ALL SELECT account_ref_id, account_ref_name, -amount FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id=ANY($2)
		)
		SELECT COALESCE(NULLIF(x.account_ref_id,''), 'noacct') AS id,
		       COALESCE(NULLIF(a.name,''), NULLIF(x.account_ref_name,''), 'Uncategorized') AS name,
		       SUM(x.amount) AS amt
		FROM exp x
		LEFT JOIN qb_accounts a ON a.company=$1 AND a.external_id=x.account_ref_id
		GROUP BY 1, 2
		HAVING SUM(x.amount) <> 0
	`, company, customerIDs)
	if err != nil {
		return nil, err
	}
	type leaf struct {
		name        string
		amt         float64
		outstanding float64
	}
	leaves := map[string]leaf{}
	for rows.Next() {
		var id, name string
		var amt float64
		rows.Scan(&id, &name, &amt)
		leaves[id] = leaf{name: name, amt: amt}
	}
	rows.Close()
	if len(leaves) == 0 {
		return []CostAccount{}, nil
	}

	// Outstanding per leaf account: proportional share of unpaid bill balance.
	oRows, err := h.db.Query(ctx, `
		SELECT COALESCE(NULLIF(bl.account_ref_id,''), 'noacct') AS id,
		       SUM(bl.amount * CASE WHEN b.total_amount = 0 THEN 0 ELSE b.balance / b.total_amount END) AS outstanding
		FROM qb_bill_lines bl
		JOIN qb_bills b ON b.id = bl.bill_id AND b.company = $1
		WHERE bl.company=$1 AND bl.customer_id=ANY($2) AND b.balance > 0
		GROUP BY 1
	`, company, customerIDs)
	if err != nil {
		return nil, err
	}
	for oRows.Next() {
		var id string
		var outstanding float64
		oRows.Scan(&id, &outstanding)
		if lf, ok := leaves[id]; ok {
			lf.outstanding = outstanding
			leaves[id] = lf
		}
	}
	oRows.Close()

	// Account directory: id → name, type, parent. Resolves parents that may have no
	// direct postings of their own on this project.
	dir := map[string]struct {
		name, atype, parent string
	}{}
	dRows, err := h.db.Query(ctx, `
		SELECT external_id, COALESCE(name,''), COALESCE(account_type,'Other'), COALESCE(parent_id,'')
		FROM qb_accounts WHERE company=$1
	`, company)
	if err != nil {
		return nil, err
	}
	for dRows.Next() {
		var id, name, atype, parent string
		dRows.Scan(&id, &name, &atype, &parent)
		dir[id] = struct{ name, atype, parent string }{name, atype, parent}
	}
	dRows.Close()

	groupOf := func(atype string) string {
		switch atype {
		case "Cost of Goods Sold", "Expense":
			return atype
		default:
			return "Other"
		}
	}

	type node struct {
		id, name, group, parent string
		direct                  float64
		outstanding             float64
		children                []*node
		isChild                 bool
	}
	nodes := map[string]*node{}
	ensure := func(id string) *node {
		if n, ok := nodes[id]; ok {
			return n
		}
		info := dir[id]
		name := info.name
		if name == "" {
			name = id
		}
		n := &node{id: id, name: name, group: groupOf(info.atype), parent: info.parent}
		nodes[id] = n
		return n
	}

	for id, lf := range leaves {
		n := ensure(id)
		n.direct += lf.amt
		n.outstanding += lf.outstanding
		if dir[id].name == "" && lf.name != "" { // deleted/unsynced account: use line name
			n.name = lf.name
		}
	}

	// Link children to parents (creating parent nodes as needed), up the chain.
	for changed := true; changed; {
		changed = false
		for _, n := range nodes {
			if n.isChild || n.parent == "" {
				continue
			}
			if _, ok := dir[n.parent]; !ok {
				n.parent = "" // parent not a known account → treat as top-level
				continue
			}
			p := ensure(n.parent)
			p.children = append(p.children, n)
			n.isChild = true
			changed = true
		}
	}

	var sumTree func(n *node) (float64, float64)
	sumTree = func(n *node) (float64, float64) {
		amt, out := n.direct, n.outstanding
		for _, c := range n.children {
			ca, co := sumTree(c)
			amt += ca
			out += co
		}
		return amt, out
	}

	var top []CostAccount
	for _, n := range nodes {
		if !n.isChild {
			amt, out := sumTree(n)
			if amt == 0 {
				continue
			}
			ca := CostAccount{ID: n.id, Name: n.name, Group: n.group, Amount: amt, Paid: amt - out, Outstanding: out}
			for _, child := range n.children {
				cAmt, cOut := sumTree(child)
				if cAmt == 0 {
					continue
				}
				ca.Children = append(ca.Children, CostAccount{
					ID: child.id, Name: child.name, Group: child.group,
					Amount: cAmt, Paid: cAmt - cOut, Outstanding: cOut,
				})
			}
			top = append(top, ca)
		}
	}
	groupRank := map[string]int{"Cost of Goods Sold": 0, "Expense": 1, "Other": 2}
	sort.Slice(top, func(i, j int) bool {
		if groupRank[top[i].Group] != groupRank[top[j].Group] {
			return groupRank[top[i].Group] < groupRank[top[j].Group]
		}
		return top[i].Amount > top[j].Amount
	})
	if top == nil {
		top = []CostAccount{}
	}
	return top, nil
}

// ── helpers ────────────────────────────────────────────────────────────────────

func max0(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

func parseYear(s string) (int, bool, error) {
	if s == "" {
		return 0, false, nil
	}
	y, err := strconv.Atoi(s)
	if err != nil {
		return 0, false, fiber.NewError(fiber.StatusBadRequest, "invalid year")
	}
	return y, true, nil
}

func parseMonth(s string) int {
	if s == "" {
		return 0
	}
	m, err := strconv.Atoi(s)
	if err != nil || m < 1 || m > 12 {
		return 0
	}
	return m
}

// periodRange returns the [start, end) date window the flow filters use. With no
// year it returns a full range (0001 → 9999) so the query is identical to the
// unfiltered/cumulative behavior. Year-only = that whole year; year+month = that month.
func periodRange(hasYear bool, year, month int) (time.Time, time.Time) {
	if !hasYear {
		return time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(9999, 12, 31, 0, 0, 0, 0, time.UTC)
	}
	if month >= 1 && month <= 12 {
		start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
		return start, start.AddDate(0, 1, 0)
	}
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(1, 0, 0)
}
