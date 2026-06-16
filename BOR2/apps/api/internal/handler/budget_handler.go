package handler

import (
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetHandler powers the Budget Control page. It reads QuickBooks data directly
// (estimates, payments, expense lines, purchase orders) and the qb_budget_settings
// config. Subcontractor cost is identified by chart-of-accounts sub-type
// 'CostOfLaborCos'; the projected subcontractor cost comes from Purchase Orders.
type BudgetHandler struct {
	db *pgxpool.Pool
}

func NewBudgetHandler(db *pgxpool.Pool) *BudgetHandler {
	return &BudgetHandler{db: db}
}

// BudgetProject is one project row.
type BudgetProject struct {
	CustomerID       string  `json:"customer_id"`
	Name             string  `json:"name"`
	ProjectedReceive float64 `json:"projected_receive"` // estimate total
	Received         float64 `json:"received"`          // customer payments
	ProjectedSpend   float64 `json:"projected_spend"`   // projected_receive * cost_ratio
	Spent            float64 `json:"spent"`             // bill + purchase + vendor-credit lines
	SubProjected     float64 `json:"sub_projected"`     // purchase-order line total
	SubBilled        float64 `json:"sub_billed"`        // purchase-order line received
	SubPaid          float64 `json:"sub_paid"`          // paid portion of subcontractor expense
	SubOpen          float64 `json:"sub_open"`          // open PO commitment (amount - received)
	SubIncurred      float64 `json:"sub_incurred"`      // subcontractor expense lines recorded
}

// BudgetSummary aggregates the project rows into KPIs.
type BudgetSummary struct {
	ProjectedReceive float64 `json:"projected_receive"`
	Received         float64 `json:"received"`
	ProjectedSpend   float64 `json:"projected_spend"`
	Spent            float64 `json:"spent"`
	SubProjected     float64 `json:"sub_projected"`
	SubPaid          float64 `json:"sub_paid"`
	SubOpen          float64 `json:"sub_open"`
	Projects         int     `json:"projects"`
	CostRatio        float64 `json:"cost_ratio"`
	BudgetSource     string  `json:"budget_source"`
}

func (h *BudgetHandler) costRatio(c *fiber.Ctx, company string) (float64, string) {
	ratio := 0.70
	source := "estimate_margin"
	_ = h.db.QueryRow(c.Context(),
		`SELECT cost_ratio, budget_source FROM qb_budget_settings WHERE company=$1`, company,
	).Scan(&ratio, &source)
	return ratio, source
}

// projectsQuery returns one row per project (customer) for the company, optionally
// scoped to a year (applied to estimates). Actuals are lifetime, mirroring Accounting.
const projectsQuery = `
WITH sub_acct AS (
	SELECT external_id FROM qb_accounts
	WHERE company = $1 AND account_sub_type = 'CostOfLaborCos'
),
exp AS (
	SELECT customer_id, amount, account_ref_id FROM qb_bill_lines          WHERE company = $1
	UNION ALL
	SELECT customer_id, amount, account_ref_id FROM qb_purchase_lines      WHERE company = $1
	UNION ALL
	SELECT customer_id, amount, account_ref_id FROM qb_vendor_credit_lines WHERE company = $1
),
est AS (
	SELECT customer_id, MAX(customer_name) AS name, SUM(total_amount) AS total
	FROM qb_estimates
	WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> '' %s
	GROUP BY customer_id
),
po AS (
	SELECT pol.customer_id,
	       MAX(pol.customer_name) AS name,
	       SUM(pol.amount)                                                          AS projected,
	       SUM(COALESCE(pol.received, 0))                                           AS billed,
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
),
received AS (
	SELECT customer_id, SUM(total_amount) AS total
	FROM qb_payments
	WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
),
spent AS (
	SELECT customer_id, SUM(amount) AS total
	FROM exp WHERE customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
),
sub_incurred AS (
	SELECT customer_id, SUM(amount) AS total
	FROM exp
	WHERE customer_id IS NOT NULL AND customer_id <> ''
	  AND account_ref_id IN (SELECT external_id FROM sub_acct)
	GROUP BY customer_id
),
sub_paid_purch AS (
	SELECT customer_id, SUM(amount) AS total
	FROM qb_purchase_lines
	WHERE company = $1 AND customer_id <> ''
	  AND account_ref_id IN (SELECT external_id FROM sub_acct)
	GROUP BY customer_id
),
sub_paid_bill AS (
	SELECT bl.customer_id,
	       SUM(bl.amount * CASE WHEN b.total_amount > 0
	            THEN GREATEST(0, (b.total_amount - COALESCE(b.balance, 0)) / b.total_amount) ELSE 0 END) AS total
	FROM qb_bill_lines bl
	JOIN qb_bills b ON b.id = bl.bill_id
	WHERE bl.company = $1 AND bl.customer_id <> ''
	  AND bl.account_ref_id IN (SELECT external_id FROM sub_acct)
	GROUP BY bl.customer_id
)
SELECT b.customer_id, b.name,
       COALESCE(e.total, 0)                              AS projected_receive,
       COALESCE(r.total, 0)                              AS received,
       COALESCE(s.total, 0)                              AS spent,
       COALESCE(si.total, 0)                             AS sub_incurred,
       COALESCE(spp.total, 0) + COALESCE(spb.total, 0)   AS sub_paid,
       COALESCE(p.projected, 0)                          AS sub_projected,
       COALESCE(p.billed, 0)                             AS sub_billed,
       COALESCE(p.open_commit, 0)                        AS sub_open
FROM base b
LEFT JOIN est            e   ON e.customer_id   = b.customer_id
LEFT JOIN received       r   ON r.customer_id   = b.customer_id
LEFT JOIN spent          s   ON s.customer_id   = b.customer_id
LEFT JOIN sub_incurred   si  ON si.customer_id  = b.customer_id
LEFT JOIN sub_paid_purch spp ON spp.customer_id = b.customer_id
LEFT JOIN sub_paid_bill  spb ON spb.customer_id = b.customer_id
LEFT JOIN po             p   ON p.customer_id   = b.customer_id
WHERE b.name IS NOT NULL AND b.name <> ''
ORDER BY projected_receive DESC, sub_projected DESC
`

func (h *BudgetHandler) queryProjects(c *fiber.Ctx, company string, year int, hasYear bool, ratio float64) ([]BudgetProject, error) {
	yearFilter := ""
	args := []any{company}
	if hasYear {
		yearFilter = " AND EXTRACT(YEAR FROM txn_date) = $2"
		args = append(args, year)
	}
	// %s is the estimate year filter; it only references $2 which is appended above.
	q := fmt.Sprintf(projectsQuery, yearFilter)

	rows, err := h.db.Query(c.Context(), q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BudgetProject
	for rows.Next() {
		var p BudgetProject
		if err := rows.Scan(
			&p.CustomerID, &p.Name,
			&p.ProjectedReceive, &p.Received, &p.Spent, &p.SubIncurred,
			&p.SubPaid, &p.SubProjected, &p.SubBilled, &p.SubOpen,
		); err != nil {
			return nil, err
		}
		p.ProjectedSpend = p.ProjectedReceive * ratio
		out = append(out, p)
	}
	return out, rows.Err()
}

// GET /api/v1/budget/projects?company=hvac[&year=2025]
func (h *BudgetHandler) Projects(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	year, hasYear, err := parseYear(c.Query("year"))
	if err != nil {
		return err
	}
	ratio, _ := h.costRatio(c, company)

	projects, err := h.queryProjects(c, company, year, hasYear, ratio)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if projects == nil {
		projects = []BudgetProject{}
	}
	return c.JSON(fiber.Map{"data": projects})
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
	ratio, source := h.costRatio(c, company)

	projects, qerr := h.queryProjects(c, company, year, hasYear, ratio)
	if qerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, qerr.Error())
	}

	sum := BudgetSummary{CostRatio: ratio, BudgetSource: source, Projects: len(projects)}
	for _, p := range projects {
		sum.ProjectedReceive += p.ProjectedReceive
		sum.Received += p.Received
		sum.ProjectedSpend += p.ProjectedSpend
		sum.Spent += p.Spent
		sum.SubProjected += p.SubProjected
		sum.SubPaid += p.SubPaid
		sum.SubOpen += p.SubOpen
	}
	return c.JSON(fiber.Map{"data": sum})
}

// GET /api/v1/budget/settings?company=hvac
func (h *BudgetHandler) GetSettings(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	ratio, source := h.costRatio(c, company)
	return c.JSON(fiber.Map{"data": fiber.Map{
		"company": company, "cost_ratio": ratio, "budget_source": source,
	}})
}

// PUT /api/v1/budget/settings/:company   body: { "cost_ratio": 0.7 }
func (h *BudgetHandler) UpdateSettings(c *fiber.Ctx) error {
	company := c.Params("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	var body struct {
		CostRatio float64 `json:"cost_ratio"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if body.CostRatio < 0 || body.CostRatio > 5 {
		return fiber.NewError(fiber.StatusBadRequest, "cost_ratio must be between 0 and 5")
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO qb_budget_settings (company, cost_ratio, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (company) DO UPDATE SET cost_ratio = EXCLUDED.cost_ratio, updated_at = now()
	`, company, body.CostRatio)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true, "company": company, "cost_ratio": body.CostRatio})
}

// ── helpers ────────────────────────────────────────────────────────────────────

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
