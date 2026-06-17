package handler

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetHandler powers the Budget Control page. A "project" is derived from the
// QuickBooks customer hierarchy: the fully-qualified name "GC : Development :
// Building" rolls every building up into its development. Per project it tracks
// receivables (estimate → invoiced → received), total cost (all expenses) broken
// down by category, and subcontractor / labor via Purchase Orders. Every project
// targets a 30% profit margin, so the cost ceiling is 70% of the contract.
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

// custProjCTE derives, for every QB customer that appears in any budget source,
// its project key/name/client from the fully-qualified name. The project is the
// first two hierarchy levels ("GC : Development"); the development is the display
// name. Single-level customers are their own project. $1 = company.
// Used verbatim by both the list query and the detail endpoint so the derived
// project_id is identical on both sides.
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
           COALESCE(NULLIF(qc.fully_qualified_name,''), NULLIF(qc.display_name,''), ac.customer_id) AS fqn
    FROM all_cust ac
    LEFT JOIN qb_customers qc ON qc.company=$1 AND qc.external_id=ac.customer_id
),
proj_key AS (
    SELECT customer_id, fqn,
        CASE WHEN trim(split_part(fqn,':',2))='' THEN trim(split_part(fqn,':',1))
             ELSE trim(split_part(fqn,':',1))||' : '||trim(split_part(fqn,':',2)) END AS pkey,
        CASE WHEN trim(split_part(fqn,':',2))='' THEN trim(split_part(fqn,':',1))
             ELSE trim(split_part(fqn,':',2)) END AS pname,
        CASE WHEN trim(split_part(fqn,':',2))='' THEN ''
             ELSE trim(split_part(fqn,':',1)) END AS client
    FROM cust_proj
)`

// BudgetProject is one project (a QB customer-hierarchy development) for the list.
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

// projectsQuery groups every QB customer into its hierarchy-derived project.
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
    SELECT pk.pkey, SUM(i.total_amount) AS total
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
       COALESCE(op.total,0), COALESCE(pp.committed,0), COALESCE(pp.billed,0), COALESCE(pp.open_commit,0)
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
		var openPayable float64
		if err := rows.Scan(
			&p.ProjectID, &p.ClientName, &p.Name,
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

// SubcontractorCategory aggregates Purchase Order commitment by vendor category.
// committed = total PO amount, billed ≈ incurred, open = still to pay (open POs).
type SubcontractorCategory struct {
	Name      string  `json:"name"`
	Icon      string  `json:"icon"`
	Committed float64 `json:"committed"`
	Billed    float64 `json:"billed"`
	Open      float64 `json:"open"`
}

type BudgetProjectDetail struct {
	ProjectID    string  `json:"project_id"`
	ClientName   string  `json:"client_name"`
	Name         string  `json:"name"`
	ProjectType  string  `json:"project_type"`
	MarginTarget float64 `json:"margin_target"`

	// Income (receivable lifecycle)
	ProjectedReceive float64 `json:"projected_receive"` // contract / estimate
	Invoiced         float64 `json:"invoiced"`
	Received         float64 `json:"received"`
	ToReceive        float64 `json:"to_receive"` // invoiced - received

	// Cost (incurred via bills/purchases/vendor credits)
	CostTotal   float64 `json:"cost_total"`
	CostCeiling float64 `json:"cost_ceiling"` // estimate * (1 - margin)
	Paid        float64 `json:"paid"`         // cost_total - open vendor bill balance
	OpenPayable float64 `json:"open_payable"` // outstanding vendor bill balance
	ToPay       float64 `json:"to_pay"`       // open_payable + open PO commitment

	// Forward subcontractor commitment (Purchase Orders)
	LaborCommitted float64 `json:"labor_committed"`
	LaborBilled    float64 `json:"labor_billed"`
	LaborOpen      float64 `json:"labor_open"`

	// Breakdowns
	Categories              []CategoryCost          `json:"categories"`               // incurred cost by account category (materials/other)
	SubcontractorCategories []SubcontractorCategory `json:"subcontractor_categories"` // PO commitment by vendor category
	Uncategorized           float64                 `json:"uncategorized"`
	PurchaseOrders          []PORow                 `json:"purchase_orders"`
}

// GET /api/v1/budget/projects/detail?company=hvac&project_id=<hierarchy key>
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

	d.Categories = []CategoryCost{}
	d.SubcontractorCategories = []SubcontractorCategory{}
	d.PurchaseOrders = []PORow{}

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
			UNION ALL SELECT amount FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id=ANY($2)
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

	d.CostCeiling = d.ProjectedReceive * (1 - profitMargin)
	d.ToReceive = max0(d.Invoiced - d.Received)
	d.Paid = max0(d.CostTotal - d.OpenPayable)

	// Cost by account category (materials/other), with per-project limit override.
	catRows, err := h.db.Query(ctx, `
		WITH exp AS (
			SELECT account_ref_id, amount FROM qb_bill_lines          WHERE company=$1 AND customer_id=ANY($2)
			UNION ALL SELECT account_ref_id, amount FROM qb_purchase_lines      WHERE company=$1 AND customer_id=ANY($2)
			UNION ALL SELECT account_ref_id, amount FROM qb_vendor_credit_lines WHERE company=$1 AND customer_id=ANY($2)
		)
		SELECT cat.id, cat.name, cat.icon, SUM(x.amount) AS actual,
		       COALESCE(lim.max_value, cat.default_max, 0) AS max
		FROM exp x
		JOIN budget_account_categories bac
		  ON bac.company=$1 AND bac.account_ref_id=x.account_ref_id AND bac.project_type=$3
		JOIN budget_categories cat ON cat.id=bac.category_id
		LEFT JOIN budget_project_category_limits lim
		  ON lim.company=$1 AND lim.project_id=$4 AND lim.category_id=cat.id
		GROUP BY cat.id, cat.name, cat.icon, COALESCE(lim.max_value, cat.default_max, 0)
		ORDER BY actual DESC
	`, company, customerIDs, d.ProjectType, projectID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	var categorized float64
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

	// Purchase orders for all customers of the project, with lines.
	poRows, err := h.db.Query(ctx, `
		SELECT DISTINCT o.id::text, o.external_id, COALESCE(o.doc_number,''),
		       to_char(o.txn_date,'YYYY-MM-DD'), COALESCE(o.vendor_name,''), COALESCE(o.po_status,''),
		       COALESCE(vc_cat.name, ''), COALESCE(vc_cat.icon, '')
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
		internalID   string
		categoryIcon string
		row          PORow
	}
	var pos []poMeta
	for poRows.Next() {
		var m poMeta
		poRows.Scan(&m.internalID, &m.row.ExternalID, &m.row.DocNumber, &m.row.TxnDate,
			&m.row.VendorName, &m.row.POStatus, &m.row.Category, &m.categoryIcon)
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

	// Subcontractor commitment aggregated by vendor category + labor totals.
	type scAgg struct {
		icon                    string
		committed, billed, open float64
	}
	scMap := map[string]*scAgg{}
	for _, p := range pos {
		d.LaborCommitted += p.row.Committed
		d.LaborBilled += p.row.Billed
		d.LaborOpen += p.row.Open
		cat := p.row.Category
		icon := p.categoryIcon
		if cat == "" {
			cat = "Uncategorized"
			icon = "HelpCircle"
		}
		a := scMap[cat]
		if a == nil {
			a = &scAgg{icon: icon}
			scMap[cat] = a
		}
		a.committed += p.row.Committed
		a.billed += p.row.Billed
		a.open += p.row.Open
	}
	for name, a := range scMap {
		d.SubcontractorCategories = append(d.SubcontractorCategories, SubcontractorCategory{
			Name: name, Icon: a.icon, Committed: a.committed, Billed: a.billed, Open: a.open,
		})
	}
	sort.Slice(d.SubcontractorCategories, func(i, j int) bool {
		return d.SubcontractorCategories[i].Committed > d.SubcontractorCategories[j].Committed
	})

	d.ToPay = max0(d.OpenPayable) + max0(d.LaborOpen)

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
