package handler

import (
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetHandler powers the Budget Control page. Per project it tracks the
// receivable side (estimate → invoiced → received) and the subcontractor / labor
// side, which is driven entirely by Purchase Orders (committed vs billed vs open).
// There is no "total projected spend": QuickBooks has no such figure and the
// business hasn't defined one yet, so that metric is intentionally absent.
type BudgetHandler struct {
	db *pgxpool.Pool
}

func NewBudgetHandler(db *pgxpool.Pool) *BudgetHandler {
	return &BudgetHandler{db: db}
}

// BudgetProject is one project (customer) row.
type BudgetProject struct {
	CustomerID       string  `json:"customer_id"`
	Name             string  `json:"name"`
	ProjectedReceive float64 `json:"projected_receive"` // estimate total
	Invoiced         float64 `json:"invoiced"`          // customer invoices
	Received         float64 `json:"received"`          // customer payments
	LaborCommitted   float64 `json:"labor_committed"`   // purchase-order line total
	LaborBilled      float64 `json:"labor_billed"`      // purchase-order received
	LaborOpen        float64 `json:"labor_open"`        // open PO commitment (committed - billed)
}

// BudgetSummary aggregates the project rows into KPIs.
type BudgetSummary struct {
	ProjectedReceive float64 `json:"projected_receive"`
	Invoiced         float64 `json:"invoiced"`
	Received         float64 `json:"received"`
	LaborCommitted   float64 `json:"labor_committed"`
	LaborBilled      float64 `json:"labor_billed"`
	LaborOpen        float64 `json:"labor_open"`
	Projects         int     `json:"projects"`
}

// projectsQuery returns one row per project (customer), optionally scoped to a
// year (applied to estimates). Actuals are lifetime, mirroring Accounting.
const projectsQuery = `
WITH est AS (
	SELECT customer_id, MAX(customer_name) AS name, SUM(total_amount) AS total
	FROM qb_estimates
	WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> '' %s
	GROUP BY customer_id
),
inv AS (
	SELECT customer_id, SUM(total_amount) AS total
	FROM qb_invoices
	WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
),
pay AS (
	SELECT customer_id, SUM(total_amount) AS total
	FROM qb_payments
	WHERE company = $1 AND customer_id IS NOT NULL AND customer_id <> ''
	GROUP BY customer_id
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
SELECT b.customer_id, b.name,
       COALESCE(e.total, 0)        AS projected_receive,
       COALESCE(i.total, 0)        AS invoiced,
       COALESCE(p.total, 0)        AS received,
       COALESCE(pp.committed, 0)   AS labor_committed,
       COALESCE(pp.billed, 0)      AS labor_billed,
       COALESCE(pp.open_commit, 0) AS labor_open
FROM base b
LEFT JOIN est e  ON e.customer_id  = b.customer_id
LEFT JOIN inv i  ON i.customer_id  = b.customer_id
LEFT JOIN pay p  ON p.customer_id  = b.customer_id
LEFT JOIN po  pp ON pp.customer_id = b.customer_id
WHERE b.name IS NOT NULL AND b.name <> ''
ORDER BY labor_committed DESC, projected_receive DESC
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

	var out []BudgetProject
	for rows.Next() {
		var p BudgetProject
		if err := rows.Scan(
			&p.CustomerID, &p.Name,
			&p.ProjectedReceive, &p.Invoiced, &p.Received,
			&p.LaborCommitted, &p.LaborBilled, &p.LaborOpen,
		); err != nil {
			return nil, err
		}
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

	projects, qerr := h.queryProjects(c, company, year, hasYear)
	if qerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, qerr.Error())
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

	projects, qerr := h.queryProjects(c, company, year, hasYear)
	if qerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, qerr.Error())
	}

	sum := BudgetSummary{Projects: len(projects)}
	for _, p := range projects {
		sum.ProjectedReceive += p.ProjectedReceive
		sum.Invoiced += p.Invoiced
		sum.Received += p.Received
		sum.LaborCommitted += p.LaborCommitted
		sum.LaborBilled += p.LaborBilled
		sum.LaborOpen += p.LaborOpen
	}
	return c.JSON(fiber.Map{"data": sum})
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
