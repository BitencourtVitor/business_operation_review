package handler

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBAccountingHandler struct {
	db *pgxpool.Pool
}

func NewQBAccountingHandler(db *pgxpool.Pool) *QBAccountingHandler {
	return &QBAccountingHandler{db: db}
}

// ChartPoint represents one period on the cash flow chart.
type ChartPoint struct {
	Period   string  `json:"period"`
	Received float64 `json:"received"`
	Paid     float64 `json:"paid"`
}

// ProjectCard represents one project in the carousel.
type ProjectCard struct {
	Name      string  `json:"name"`
	Estimate  float64 `json:"estimate"`
	Invoiced  float64 `json:"invoiced"`
	Expenses  float64 `json:"expenses"`
	Profit    float64 `json:"profit"`
	ProfitPct float64 `json:"profit_pct"`
}

// GET /api/v1/qb/accounting/chart?company=hvac&year=2025[&month=04]
// Returns paid vs received per period (monthly or daily).
func (h *QBAccountingHandler) Chart(c *fiber.Ctx) error {
	company := c.Query("company")
	yearStr := c.Query("year")
	monthStr := c.Query("month")

	if company == "" || yearStr == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and year are required")
	}
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid year")
	}

	byDay := monthStr != ""
	var month int
	if byDay {
		month, err = strconv.Atoi(monthStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid month")
		}
	}

	var truncFmt, labelFmt string
	if byDay {
		truncFmt = "day"
		labelFmt = "YYYY-MM-DD"
	} else {
		truncFmt = "month"
		labelFmt = "YYYY-MM"
	}

	// Received = customer payments
	receivedQ := `
		SELECT TO_CHAR(DATE_TRUNC($1, txn_date), $2) as period, COALESCE(SUM(total_amount), 0)
		FROM qb_payments
		WHERE company = $3 AND EXTRACT(YEAR FROM txn_date) = $4
	`
	args := []any{truncFmt, labelFmt, company, year}
	if byDay {
		receivedQ += ` AND EXTRACT(MONTH FROM txn_date) = $5`
		args = append(args, month)
	}
	receivedQ += ` GROUP BY 1 ORDER BY 1`

	rows, err := h.db.Query(c.Context(), receivedQ, args...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	received := map[string]float64{}
	for rows.Next() {
		var period string
		var amount float64
		rows.Scan(&period, &amount)
		received[period] = amount
	}
	rows.Close()

	// Paid = vendor bill payments
	paidArgs := []any{truncFmt, labelFmt, company, year}
	paidQ := `
		SELECT TO_CHAR(DATE_TRUNC($1, txn_date), $2) as period, COALESCE(SUM(total_amount), 0)
		FROM qb_bill_payments
		WHERE company = $3 AND EXTRACT(YEAR FROM txn_date) = $4
	`
	if byDay {
		paidQ += ` AND EXTRACT(MONTH FROM txn_date) = $5`
		paidArgs = append(paidArgs, month)
	}
	paidQ += ` GROUP BY 1 ORDER BY 1`

	rows2, err := h.db.Query(c.Context(), paidQ, paidArgs...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	paid := map[string]float64{}
	for rows2.Next() {
		var period string
		var amount float64
		rows2.Scan(&period, &amount)
		paid[period] = amount
	}
	rows2.Close()

	// Merge periods
	periods := map[string]bool{}
	for k := range received {
		periods[k] = true
	}
	for k := range paid {
		periods[k] = true
	}

	// Fill missing periods in range
	if !byDay {
		for m := 1; m <= 12; m++ {
			key := time.Date(year, time.Month(m), 1, 0, 0, 0, 0, time.UTC).Format("2006-01")
			periods[key] = true
		}
	}

	points := make([]ChartPoint, 0, len(periods))
	for p := range periods {
		points = append(points, ChartPoint{
			Period:   p,
			Received: received[p],
			Paid:     paid[p],
		})
	}

	// Sort by period
	for i := 0; i < len(points); i++ {
		for j := i + 1; j < len(points); j++ {
			if points[i].Period > points[j].Period {
				points[i], points[j] = points[j], points[i]
			}
		}
	}

	return c.JSON(fiber.Map{"data": points})
}

// GET /api/v1/qb/accounting/projects?company=hvac[&year=2025]
// Returns one card per project (grouped by customer_name on estimates).
func (h *QBAccountingHandler) Projects(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	yearStr := c.Query("year")

	yearFilter := ""
	args := []any{company}
	if yearStr != "" {
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid year")
		}
		yearFilter = " AND EXTRACT(YEAR FROM txn_date) = $2"
		args = append(args, year)
	}

	query := `
		WITH estimates AS (
			SELECT customer_name, SUM(total_amount) AS total
			FROM qb_estimates
			WHERE company = $1` + yearFilter + `
			GROUP BY customer_name
		),
		invoices AS (
			SELECT customer_name, SUM(total_amount) AS total
			FROM qb_invoices
			WHERE company = $1` + yearFilter + `
			GROUP BY customer_name
		),
		bill_exp AS (
			SELECT bl.customer_name, SUM(bl.amount) AS total
			FROM qb_bill_lines bl
			WHERE bl.company = $1 AND bl.customer_name IS NOT NULL AND bl.customer_name <> ''
			GROUP BY bl.customer_name
		),
		purchase_exp AS (
			SELECT pl.customer_name, SUM(pl.amount) AS total
			FROM qb_purchase_lines pl
			WHERE pl.company = $1 AND pl.customer_name IS NOT NULL AND pl.customer_name <> ''
			GROUP BY pl.customer_name
		),
		expenses AS (
			SELECT customer_name, SUM(total) AS total
			FROM (
				SELECT customer_name, total FROM bill_exp
				UNION ALL
				SELECT customer_name, total FROM purchase_exp
			) x
			GROUP BY customer_name
		)
		SELECT
			e.customer_name,
			e.total                             AS estimate,
			COALESCE(i.total, 0)               AS invoiced,
			COALESCE(exp.total, 0)             AS expenses
		FROM estimates e
		LEFT JOIN invoices i   ON i.customer_name   = e.customer_name
		LEFT JOIN expenses exp ON exp.customer_name = e.customer_name
		WHERE e.customer_name IS NOT NULL AND e.customer_name <> ''
		ORDER BY e.total DESC
	`

	rows, err := h.db.Query(c.Context(), query, args...)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	var projects []ProjectCard
	for rows.Next() {
		var p ProjectCard
		rows.Scan(&p.Name, &p.Estimate, &p.Invoiced, &p.Expenses)
		p.Profit = p.Invoiced - p.Expenses
		if p.Invoiced > 0 {
			p.ProfitPct = (p.Profit / p.Invoiced) * 100
		}
		projects = append(projects, p)
	}
	if projects == nil {
		projects = []ProjectCard{}
	}

	return c.JSON(fiber.Map{"data": projects})
}
