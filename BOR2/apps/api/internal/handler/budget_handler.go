package handler

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"

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
	db *pgxpool.Pool
}

func NewBudgetHandler(db *pgxpool.Pool) *BudgetHandler {
	return &BudgetHandler{db: db}
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
        CASE WHEN strpos(fqn, ':') > 0 THEN trim(split_part(fqn, ':', 1)) ELSE '' END AS client
    FROM cust_proj
)`

// BudgetProject is one project (a single QB job/customer) for the list.
type BudgetProject struct {
	ProjectID         string  `json:"project_id"` // derived hierarchy key
	ClientName        string  `json:"client_name"`
	Name              string  `json:"name"`
	ProjectType       string  `json:"project_type"`
	ProjectedReceive  float64 `json:"projected_receive"` // estimate total (contract)
	Invoiced          float64 `json:"invoiced"`
	Received          float64 `json:"received"`
	ToReceive         float64 `json:"to_receive"` // invoiced - received
	CostTotal         float64 `json:"cost_total"`
	CostCeiling       float64 `json:"cost_ceiling"` // estimate * (1 - margin)
	OverCeiling       bool    `json:"over_ceiling"`
	LaborCommitted    float64 `json:"labor_committed"`
	LaborBilled       float64 `json:"labor_billed"`
	LaborOpen         float64 `json:"labor_open"`
	ToPay             float64 `json:"to_pay"` // open PO + open bill balance
	InProgress        bool    `json:"in_progress"`
	PotentiallyClosed bool    `json:"potentially_closed"`
}

type BudgetSummary struct {
	ProjectedReceive float64 `json:"projected_receive"`
	Invoiced         float64 `json:"invoiced"`
	Received         float64 `json:"received"`
	ToReceive        float64 `json:"to_receive"`
	CostTotal        float64 `json:"cost_total"`
	LaborCommitted   float64 `json:"labor_committed"`
	LaborOpen        float64 `json:"labor_open"`
	ToPay            float64 `json:"to_pay"`
	Projects         int     `json:"projects"`
	InProgress       int     `json:"in_progress"`
}

// projectsQuery returns one row per QB job/customer (project = customer_id).
// %s is the optional year filter appended to the qb_estimates WHERE clause.
const projectsQuery = `WITH ` + custProjCTE + `,
proj AS (
    SELECT pkey, MAX(pname) AS pname, MAX(client) AS client FROM proj_key GROUP BY pkey
),
est AS (
    SELECT pk.pkey, SUM(e.total_amount) AS total
    FROM qb_estimates e JOIN proj_key pk ON pk.customer_id = e.customer_id
    WHERE e.company=$1 AND e.customer_id<>'' %s
    GROUP BY pk.pkey
),
inv AS (
    SELECT pk.pkey, SUM(i.total_amount) AS total, SUM(COALESCE(i.balance,0)) AS balance
    FROM qb_invoices i JOIN proj_key pk ON pk.customer_id = i.customer_id
    WHERE i.company=$1 AND i.customer_id<>''
    GROUP BY pk.pkey
),
pay AS (
    SELECT pk.pkey, SUM(p.total_amount) AS total
    FROM qb_payments p JOIN proj_key pk ON pk.customer_id = p.customer_id
    WHERE p.company=$1 AND p.customer_id<>''
    GROUP BY pk.pkey
),
exp AS (
    SELECT pk.pkey, x.amount FROM (
        SELECT customer_id, amount FROM qb_bill_lines          WHERE company=$1
        UNION ALL SELECT customer_id, amount FROM qb_purchase_lines      WHERE company=$1
        UNION ALL SELECT customer_id, amount FROM qb_vendor_credit_lines WHERE company=$1
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
)
SELECT p.pkey, p.client, p.pname,
       COALESCE(e.total,0), COALESCE(i.total,0), COALESCE(pa.total,0), COALESCE(co.total,0),
       COALESCE(op.total,0), COALESCE(pp.committed,0), COALESCE(pp.billed,0), COALESCE(pp.open_commit,0),
       COALESCE(i.balance,0)
FROM proj p
LEFT JOIN est          e  ON e.pkey  = p.pkey
LEFT JOIN inv          i  ON i.pkey  = p.pkey
LEFT JOIN pay          pa ON pa.pkey = p.pkey
LEFT JOIN cost         co ON co.pkey = p.pkey
LEFT JOIN open_payable op ON op.pkey = p.pkey
LEFT JOIN po           pp ON pp.pkey = p.pkey
WHERE COALESCE(e.total,0) <> 0 OR COALESCE(i.total,0) <> 0 OR COALESCE(pa.total,0) <> 0
   OR COALESCE(co.total,0) <> 0 OR COALESCE(pp.committed,0) <> 0
ORDER BY COALESCE(e.total,0) DESC, COALESCE(pp.committed,0) DESC
`

func (h *BudgetHandler) queryProjects(c *fiber.Ctx, company string, year int, hasYear bool) ([]BudgetProject, error) {
	yearFilter := ""
	args := []any{company}
	if hasYear {
		yearFilter = " AND EXTRACT(YEAR FROM txn_date) = $2"
		args = append(args, year)
	}
	q := fmt.Sprintf(projectsQuery, yearFilter)

	rows, err := h.db.Query(c.Context(), q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	const eps = 1.0 // dollars tolerance for "settled"
	var out []BudgetProject
	for rows.Next() {
		var p BudgetProject
		var openPayable, invBalance float64
		if err := rows.Scan(
			&p.ProjectID, &p.ClientName, &p.Name,
			&p.ProjectedReceive, &p.Invoiced, &p.Received, &p.CostTotal, &openPayable,
			&p.LaborCommitted, &p.LaborBilled, &p.LaborOpen, &invBalance,
		); err != nil {
			return nil, err
		}
		p.ProjectType = projectType(p.Name)
		p.ToReceive = max0(invBalance)
		p.ToPay = max0(p.LaborOpen) + max0(openPayable)
		p.CostCeiling = p.ProjectedReceive * (1 - profitMargin)
		p.OverCeiling = p.CostCeiling > 0 && p.CostTotal > p.CostCeiling
		hasActivity := p.Received > 0 || p.CostTotal > 0 || p.Invoiced > 0
		p.PotentiallyClosed = hasActivity && p.ToReceive <= eps && p.ToPay <= eps
		p.InProgress = hasActivity && !p.PotentiallyClosed
		out = append(out, p)
	}
	return out, rows.Err()
}

// GET /api/v1/budget/projects?company=hvac[&year=2025][&status=in_progress|settled]
func (h *BudgetHandler) Projects(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	year, hasYear, err := parseYear(c.Query("year"))
	if err != nil {
		return err
	}
	statusFilter := c.Query("status")

	projects, qerr := h.queryProjects(c, company, year, hasYear)
	if qerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, qerr.Error())
	}

	filtered := projects[:0]
	for _, p := range projects {
		switch statusFilter {
		case "in_progress":
			if !p.InProgress {
				continue
			}
		case "settled":
			if !p.PotentiallyClosed {
				continue
			}
		}
		filtered = append(filtered, p)
	}
	if filtered == nil {
		filtered = []BudgetProject{}
	}
	return c.JSON(fiber.Map{"data": filtered})
}

// GET /api/v1/budget/summary?company=hvac[&year=2025]
func (h *BudgetHandler) Summary(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	year, hasYear, err := parseYear(c.Query("year"))
	if err != nil {
		return err
	}

	projects, qerr := h.queryProjects(c, company, year, hasYear)
	if qerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, qerr.Error())
	}

	sum := BudgetSummary{Projects: len(projects)}
	for _, p := range projects {
		sum.ProjectedReceive += p.ProjectedReceive
		sum.Invoiced += p.Invoiced
		sum.Received += p.Received
		sum.ToReceive += p.ToReceive
		sum.CostTotal += p.CostTotal
		sum.LaborCommitted += p.LaborCommitted
		sum.LaborOpen += p.LaborOpen
		sum.ToPay += p.ToPay
		if p.InProgress {
			sum.InProgress++
		}
	}
	return c.JSON(fiber.Map{"data": sum})
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

// VendorPayment is one recorded payment against a vendor's bills for a project.
type VendorPayment struct {
	Date      string  `json:"date"`
	Amount    float64 `json:"amount"`
	RefNumber string  `json:"ref_number"`
}

// CostVendor aggregates one subcontractor's PO commitments and payment history.
type CostVendor struct {
	VendorID       string          `json:"vendor_id"`
	VendorName     string          `json:"vendor_name"`
	Committed      float64         `json:"committed"`
	Billed         float64         `json:"billed"`
	Paid           float64         `json:"paid"`
	Open           float64         `json:"open"` // max(committed − paid, 0)
	Payments       []VendorPayment `json:"payments"`
	PurchaseOrders []PORow         `json:"purchase_orders"`
}

// CostCategory groups subcontractors (vendors) by the user-defined budget category.
type CostCategory struct {
	CategoryID   string       `json:"category_id"`
	CategoryName string       `json:"category_name"`
	Icon         string       `json:"icon"`
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
type CostAccount struct {
	Name        string  `json:"name"`
	Group       string  `json:"-"` // internal sort key, not exposed
	Amount      float64 `json:"amount"`
	Paid        float64 `json:"paid"`
	Outstanding float64 `json:"outstanding"`
}

type BudgetProjectDetail struct {
	ProjectID    string  `json:"project_id"`
	ClientName   string  `json:"client_name"`
	Name         string  `json:"name"`
	ProjectType  string  `json:"project_type"`
	MarginTarget float64 `json:"margin_target"`

	// Income (a receber)
	ProjectedReceive float64         `json:"projected_receive"` // contract / estimate
	Invoiced         float64         `json:"invoiced"`          // total billed (gross)
	IncomeActual     float64         `json:"income_actual"`     // earned income = Σ categories (QB P&L income)
	Received         float64         `json:"received"`          // cash received (payments)
	ToReceive        float64         `json:"to_receive"`        // open invoice balance (AR)
	IncomeAccounts   []IncomeAccount `json:"income_accounts"`

	// Cost (a pagar) — incurred via bills/purchases/vendor credits
	CostTotal    float64       `json:"cost_total"`
	CostCeiling  float64       `json:"cost_ceiling"` // estimate * (1 - margin)
	Paid         float64       `json:"paid"`         // cost_total - open vendor bill balance
	OpenPayable  float64       `json:"open_payable"` // outstanding vendor bill balance
	ToPay        float64       `json:"to_pay"`       // open_payable + open PO commitment
	CostAccounts []CostAccount `json:"cost_accounts"`

	// Forward subcontractor commitment (Purchase Orders)
	LaborCommitted float64 `json:"labor_committed"`
	LaborBilled    float64 `json:"labor_billed"`
	LaborOpen      float64 `json:"labor_open"`
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
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(SUM(total_amount),0) FROM qb_payments  WHERE company=$1 AND customer_id=ANY($2)`, company, customerIDs).Scan(&d.Received)
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

	d.CostCategories, _ = h.costCategoryTree(ctx, company, d.ProjectType, customerIDs, d.PurchaseOrders)

	return c.JSON(fiber.Map{"data": d})
}

// costCategoryTree groups the project's POs by user-defined budget category, adding
// per-vendor payment history sourced from bills that have lines on this project.
// open = max(committed − paid, 0) — total uncommitted exposure per vendor.
func (h *BudgetHandler) costCategoryTree(
	ctx context.Context, company, projType string,
	customerIDs []string, pos []PORow,
) ([]CostCategory, error) {
	if len(pos) == 0 {
		return []CostCategory{}, nil
	}

	// ── 1. Payments per vendor via bills with lines on this project's customers ─
	type pmt struct {
		date, ref string
		amount    float64
	}
	vendorPmts := map[string][]pmt{}
	{
		rows, err := h.db.Query(ctx, `
			WITH pb AS (
				SELECT b.id, b.external_id, b.vendor_id, b.total_amount,
				       SUM(bl.amount) AS proj_amt
				FROM qb_bills b
				JOIN qb_bill_lines bl ON bl.bill_id = b.id AND bl.company = $1
				WHERE b.company = $1 AND bl.customer_id = ANY($2)
				GROUP BY b.id, b.external_id, b.vendor_id, b.total_amount
			)
			SELECT pb.vendor_id,
			       to_char(bp.txn_date,'YYYY-MM-DD'),
			       bpl.amount * CASE WHEN pb.total_amount = 0 THEN 0 ELSE pb.proj_amt / pb.total_amount END,
			       COALESCE(NULLIF(bp.doc_number,''), bp.external_id, '')
			FROM pb
			JOIN qb_bill_payment_links bpl
			     ON bpl.txn_id = pb.external_id AND bpl.txn_type = 'Bill' AND bpl.company = $1
			JOIN qb_bill_payments bp ON bp.id = bpl.bill_payment_id AND bp.company = $1
			ORDER BY pb.vendor_id, bp.txn_date
		`, company, customerIDs)
		if err == nil {
			for rows.Next() {
				var vendorID, date, ref string
				var amt float64
				rows.Scan(&vendorID, &date, &amt, &ref)
				vendorPmts[vendorID] = append(vendorPmts[vendorID], pmt{date, ref, amt})
			}
			rows.Close()
		}
	}

	// ── 2. Vendor → category mapping ─────────────────────────────────────────
	type catDef struct {
		id, name, icon string
		sortOrder      int
	}
	vendorCat := map[string]catDef{}
	catsByID := map[string]catDef{}
	{
		rows, err := h.db.Query(ctx, `
			SELECT bvc.vendor_id, bc.id::text, bc.name, COALESCE(NULLIF(bc.icon,''),'Tag'), bc.sort_order
			FROM budget_vendor_categories bvc
			JOIN budget_categories bc ON bc.id = bvc.category_id AND bc.active = true
			WHERE bvc.company = $1 AND bvc.project_type = $2
		`, company, projType)
		if err == nil {
			for rows.Next() {
				var vendorID, catID, catName, icon string
				var sortOrder int
				rows.Scan(&vendorID, &catID, &catName, &icon, &sortOrder)
				cd := catDef{catID, catName, icon, sortOrder}
				vendorCat[vendorID] = cd
				catsByID[catID] = cd
			}
			rows.Close()
		}
	}

	// ── 3. Aggregate POs per vendor (preserving insertion order) ─────────────
	type vendorAgg struct {
		id, name, catID string
		committed, billed float64
		pmts []VendorPayment
		pos  []PORow
	}
	vendorOrder := []string{}
	vendorMap := map[string]*vendorAgg{}
	for _, po := range pos {
		vid := po.VendorID
		if vid == "" {
			vid = "__" + po.VendorName
		}
		if _, ok := vendorMap[vid]; !ok {
			cat := vendorCat[vid]
			vendorMap[vid] = &vendorAgg{id: vid, name: po.VendorName, catID: cat.id}
			vendorOrder = append(vendorOrder, vid)
		}
		vd := vendorMap[vid]
		vd.committed += po.Committed
		vd.billed += po.Billed
		vd.pos = append(vd.pos, po)
	}

	// attach payment records
	for vid, pmts := range vendorPmts {
		if vd, ok := vendorMap[vid]; ok {
			for _, p := range pmts {
				vd.pmts = append(vd.pmts, VendorPayment{Date: p.date, Amount: p.amount, RefNumber: p.ref})
			}
		}
	}

	// ── 4. Group vendors by category ─────────────────────────────────────────
	type catGroup struct {
		def     catDef
		vendors []*vendorAgg
	}
	catOrderSlice := []string{}
	catMap := map[string]*catGroup{}
	var uncatVendors []*vendorAgg

	for _, vid := range vendorOrder {
		vd := vendorMap[vid]
		if vd.catID == "" {
			uncatVendors = append(uncatVendors, vd)
			continue
		}
		if _, ok := catMap[vd.catID]; !ok {
			catMap[vd.catID] = &catGroup{def: catsByID[vd.catID]}
			catOrderSlice = append(catOrderSlice, vd.catID)
		}
		catMap[vd.catID].vendors = append(catMap[vd.catID].vendors, vd)
	}

	sort.Slice(catOrderSlice, func(i, j int) bool {
		a, b := catsByID[catOrderSlice[i]], catsByID[catOrderSlice[j]]
		if a.sortOrder != b.sortOrder {
			return a.sortOrder < b.sortOrder
		}
		return a.name < b.name
	})

	// ── 5. Assemble output ────────────────────────────────────────────────────
	mkVendor := func(vd *vendorAgg) CostVendor {
		var paidTotal float64
		for _, p := range vd.pmts {
			paidTotal += p.Amount
		}
		pmts := vd.pmts
		if pmts == nil {
			pmts = []VendorPayment{}
		}
		poSlice := vd.pos
		if poSlice == nil {
			poSlice = []PORow{}
		}
		return CostVendor{
			VendorID:       vd.id,
			VendorName:     vd.name,
			Committed:      vd.committed,
			Billed:         vd.billed,
			Paid:           paidTotal,
			Open:           max0(vd.committed - paidTotal),
			Payments:       pmts,
			PurchaseOrders: poSlice,
		}
	}

	mkCat := func(def catDef, vendors []*vendorAgg) CostCategory {
		cc := CostCategory{
			CategoryID:   def.id,
			CategoryName: def.name,
			Icon:         def.icon,
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
		cg := catMap[catID]
		out = append(out, mkCat(cg.def, cg.vendors))
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
			top = append(top, CostAccount{Name: n.name, Group: n.group, Amount: amt, Paid: amt - out, Outstanding: out})
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
