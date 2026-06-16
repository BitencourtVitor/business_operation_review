package handler

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetHandler powers the Budget Control page. Per project it tracks receivables
// (estimate → invoiced → received), total cost (all expenses) broken down by
// category, and subcontractor / labor via Purchase Orders. Every project targets a
// 30% profit margin, so the cost ceiling is 70% of the contract (estimate).
type BudgetHandler struct {
	db *pgxpool.Pool
}

func NewBudgetHandler(db *pgxpool.Pool) *BudgetHandler {
	return &BudgetHandler{db: db}
}

const profitMargin = 0.30 // every project (house & building) targets 30% margin

// projectType is derived from the Project name: "building" → building, "lot" →
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

// BudgetProject is one project (customer) row for the list view.
type BudgetProject struct {
	CustomerID       string  `json:"customer_id"`
	Name             string  `json:"name"`
	ProjectType      string  `json:"project_type"`
	ProjectedReceive float64 `json:"projected_receive"` // estimate total (contract)
	Invoiced         float64 `json:"invoiced"`
	Received         float64 `json:"received"`
	ToReceive        float64 `json:"to_receive"` // invoiced - received
	CostTotal        float64 `json:"cost_total"`
	CostCeiling      float64 `json:"cost_ceiling"` // estimate * (1 - margin)
	OverCeiling      bool    `json:"over_ceiling"`
	LaborCommitted   float64 `json:"labor_committed"`
	LaborBilled      float64 `json:"labor_billed"`
	LaborOpen        float64 `json:"labor_open"`
	ToPay            float64 `json:"to_pay"` // open PO + open bill balance
	InProgress       bool    `json:"in_progress"`
	PotentiallyClosed bool   `json:"potentially_closed"`
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

const projectsQuery = `
WITH est AS (
	SELECT customer_id, MAX(customer_name) AS name, SUM(total_amount) AS total
	FROM qb_estimates
	WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> '' %s
	GROUP BY customer_id
),
inv AS (
	SELECT customer_id, SUM(total_amount) AS total
	FROM qb_invoices WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
),
pay AS (
	SELECT customer_id, SUM(total_amount) AS total
	FROM qb_payments WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
),
exp AS (
	SELECT customer_id, amount FROM qb_bill_lines          WHERE company = $1
	UNION ALL
	SELECT customer_id, amount FROM qb_purchase_lines      WHERE company = $1
	UNION ALL
	SELECT customer_id, amount FROM qb_vendor_credit_lines WHERE company = $1
),
cost AS (
	SELECT customer_id, SUM(amount) AS total
	FROM exp WHERE customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
),
bill_cust AS (
	SELECT bl.bill_id, bl.customer_id, SUM(bl.amount) AS cust_amt
	FROM qb_bill_lines bl
	WHERE bl.company = $1 AND bl.customer_id IS NOT NULL AND bl.customer_id <> ''
	GROUP BY bl.bill_id, bl.customer_id
),
open_payable AS (
	SELECT bc.customer_id,
	       SUM(b.balance * (bc.cust_amt / NULLIF(b.total_amount, 0))) AS total
	FROM bill_cust bc
	JOIN qb_bills b ON b.id = bc.bill_id
	WHERE b.balance > 0
	GROUP BY bc.customer_id
),
po AS (
	SELECT pol.customer_id,
	       MAX(pol.customer_name) AS name,
	       SUM(pol.amount)                AS committed,
	       SUM(COALESCE(pol.received, 0)) AS billed,
	       SUM(CASE WHEN o.po_status = 'Open'
	                THEN GREATEST(pol.amount - COALESCE(pol.received, 0), 0) ELSE 0 END) AS open_commit
	FROM qb_purchase_order_lines pol
	JOIN qb_purchase_orders o ON o.id = pol.po_id
	WHERE pol.company = $1 AND pol.customer_id IS NOT NULL AND pol.customer_id <> ''
	GROUP BY pol.customer_id
),
base AS (
	SELECT customer_id, MAX(name) AS name FROM (
		SELECT customer_id, name FROM est
		UNION ALL
		SELECT customer_id, name FROM po
	) z
	GROUP BY customer_id
)
SELECT b.customer_id,
       COALESCE(
         CASE WHEN qc.fully_qualified_name LIKE '%:%'
              THEN substring(qc.fully_qualified_name FROM position(':' IN qc.fully_qualified_name) + 1)
              ELSE NULLIF(qc.fully_qualified_name, '')
         END,
         b.name
       ) AS name,
       COALESCE(e.total, 0)        AS projected_receive,
       COALESCE(i.total, 0)        AS invoiced,
       COALESCE(p.total, 0)        AS received,
       COALESCE(co.total, 0)       AS cost_total,
       COALESCE(op.total, 0)       AS open_payable,
       COALESCE(pp.committed, 0)   AS labor_committed,
       COALESCE(pp.billed, 0)      AS labor_billed,
       COALESCE(pp.open_commit, 0) AS labor_open
FROM base b
LEFT JOIN qb_customers qc ON qc.company = $1 AND qc.external_id = b.customer_id
LEFT JOIN est          e  ON e.customer_id  = b.customer_id
LEFT JOIN inv          i  ON i.customer_id  = b.customer_id
LEFT JOIN pay          p  ON p.customer_id  = b.customer_id
LEFT JOIN cost         co ON co.customer_id = b.customer_id
LEFT JOIN open_payable op ON op.customer_id = b.customer_id
LEFT JOIN po           pp ON pp.customer_id = b.customer_id
WHERE b.name IS NOT NULL AND b.name <> ''
ORDER BY projected_receive DESC, labor_committed DESC
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
		var openPayable float64
		if err := rows.Scan(
			&p.CustomerID, &p.Name,
			&p.ProjectedReceive, &p.Invoiced, &p.Received, &p.CostTotal, &openPayable,
			&p.LaborCommitted, &p.LaborBilled, &p.LaborOpen,
		); err != nil {
			return nil, err
		}
		p.ProjectType = projectType(p.Name)
		p.ToReceive = max0(p.Invoiced - p.Received)
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

// ── Project detail ──────────────────────────────────────────────────────────

type CategoryCost struct {
	Name     string  `json:"name"`
	Icon     string  `json:"icon"`
	Actual   float64 `json:"actual"`
	Max      float64 `json:"max"`       // 0 = no limit set
	AlertPct float64 `json:"alert_pct"` // actual/max*100 (0 if no limit)
}

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
	VendorName string      `json:"vendor_name"`
	Category   string      `json:"category"`
	POStatus   string      `json:"po_status"`
	Committed  float64     `json:"committed"`
	Billed     float64     `json:"billed"`
	Open       float64     `json:"open"`
	Lines      []POLineRow `json:"lines"`
}

type BudgetProjectDetail struct {
	CustomerID       string         `json:"customer_id"`
	Name             string         `json:"name"`
	ProjectType      string         `json:"project_type"`
	ProjectedReceive float64        `json:"projected_receive"`
	Invoiced         float64        `json:"invoiced"`
	Received         float64        `json:"received"`
	CostTotal        float64        `json:"cost_total"`
	CostCeiling      float64        `json:"cost_ceiling"`
	MarginTarget     float64        `json:"margin_target"`
	Categories       []CategoryCost `json:"categories"`
	Uncategorized    float64        `json:"uncategorized"`
	PurchaseOrders   []PORow        `json:"purchase_orders"`
}

// GET /api/v1/budget/projects/detail?company=hvac&customer_id=123
func (h *BudgetHandler) ProjectDetail(c *fiber.Ctx) error {
	company := c.Query("company")
	customerID := c.Query("customer_id")
	if company == "" || customerID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and customer_id are required")
	}
	ctx := c.Context()

	d := BudgetProjectDetail{CustomerID: customerID, MarginTarget: profitMargin}

	// Header figures
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(customer_name),''), COALESCE(SUM(total_amount),0)
		FROM qb_estimates WHERE company=$1 AND customer_id=$2
	`, company, customerID).Scan(&d.Name, &d.ProjectedReceive)
	if d.Name == "" {
		_ = h.db.QueryRow(ctx, `
			SELECT COALESCE(MAX(customer_name),'') FROM qb_purchase_order_lines
			WHERE company=$1 AND customer_id=$2
		`, company, customerID).Scan(&d.Name)
	}
	d.ProjectType = projectType(d.Name)
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(SUM(total_amount),0) FROM qb_invoices WHERE company=$1 AND customer_id=$2`, company, customerID).Scan(&d.Invoiced)
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(SUM(total_amount),0) FROM qb_payments WHERE company=$1 AND customer_id=$2`, company, customerID).Scan(&d.Received)
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount),0) FROM (
			SELECT amount FROM qb_bill_lines          WHERE company=$1 AND customer_id=$2
			UNION ALL SELECT amount FROM qb_purchase_lines      WHERE company=$1 AND customer_id=$2
			UNION ALL SELECT amount FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id=$2
		) x
	`, company, customerID).Scan(&d.CostTotal)
	d.CostCeiling = d.ProjectedReceive * (1 - profitMargin)

	// Cost by category (account → category for this project's type), with per-project limits.
	catRows, err := h.db.Query(ctx, `
		WITH exp AS (
			SELECT account_ref_id, amount FROM qb_bill_lines          WHERE company=$1 AND customer_id=$2
			UNION ALL SELECT account_ref_id, amount FROM qb_purchase_lines      WHERE company=$1 AND customer_id=$2
			UNION ALL SELECT account_ref_id, amount FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id=$2
		)
		SELECT cat.id, cat.name, cat.icon, SUM(x.amount) AS actual,
		       COALESCE(lim.max_value, cat.default_max, 0) AS max
		FROM exp x
		JOIN budget_account_categories bac
		  ON bac.company=$1 AND bac.account_ref_id=x.account_ref_id AND bac.project_type=$3
		JOIN budget_categories cat ON cat.id=bac.category_id
		LEFT JOIN budget_project_category_limits lim
		  ON lim.company=$1 AND lim.customer_id=$2 AND lim.category_id=cat.id
		GROUP BY cat.id, cat.name, cat.icon, COALESCE(lim.max_value, cat.default_max, 0)
		ORDER BY actual DESC
	`, company, customerID, d.ProjectType)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	var categorized float64
	d.Categories = []CategoryCost{}
	for catRows.Next() {
		var id string
		var cc CategoryCost
		catRows.Scan(&id, &cc.Name, &cc.Icon, &cc.Actual, &cc.Max)
		if cc.Max > 0 {
			cc.AlertPct = cc.Actual / cc.Max * 100
		}
		categorized += cc.Actual
		d.Categories = append(d.Categories, cc)
	}
	catRows.Close()
	d.Uncategorized = d.CostTotal - categorized

	// Purchase orders (this customer), with lines.
	poRows, err := h.db.Query(ctx, `
		SELECT DISTINCT o.id::text, o.external_id, COALESCE(o.doc_number,''),
		       to_char(o.txn_date,'YYYY-MM-DD'), COALESCE(o.vendor_name,''), COALESCE(o.po_status,''),
		       COALESCE(vc_cat.name, '')
		FROM qb_purchase_orders o
		JOIN qb_purchase_order_lines pol ON pol.po_id = o.id
		LEFT JOIN budget_vendor_categories bvc
		  ON bvc.company=$1 AND bvc.vendor_id=o.vendor_id AND bvc.project_type=$3
		LEFT JOIN budget_categories vc_cat ON vc_cat.id = bvc.category_id
		WHERE o.company=$1 AND pol.customer_id=$2
		ORDER BY o.external_id
	`, company, customerID, d.ProjectType)
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
			&m.row.VendorName, &m.row.POStatus, &m.row.Category)
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
			WHERE company=$1 AND customer_id=$2 AND po_id::text = ANY($3)
			ORDER BY po_id
		`, company, customerID, ids)
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

	return c.JSON(fiber.Map{"data": d})
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
