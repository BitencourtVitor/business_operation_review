package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BudgetMappingHandler struct {
	db *pgxpool.Pool
}

func NewBudgetMappingHandler(db *pgxpool.Pool) *BudgetMappingHandler {
	return &BudgetMappingHandler{db: db}
}

type ProjectMapping struct {
	CustomerID string `json:"customer_id"`
	ClientID   *int64 `json:"client_id"`
	JobSiteID  *int64 `json:"job_site_id"`
}

// GET /budget/project-mappings?company=framing
func (h *BudgetMappingHandler) List(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	rows, err := h.db.Query(c.Context(),
		`SELECT customer_id, client_id, job_site_id FROM budget_project_mappings WHERE company=$1`,
		company)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []ProjectMapping{}
	for rows.Next() {
		var m ProjectMapping
		rows.Scan(&m.CustomerID, &m.ClientID, &m.JobSiteID)
		out = append(out, m)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /budget/project-mappings  body {company, customer_id, client_id|null, job_site_id|null}
func (h *BudgetMappingHandler) Set(c *fiber.Ctx) error {
	var b struct {
		Company    string `json:"company"`
		CustomerID string `json:"customer_id"`
		ClientID   *int64 `json:"client_id"`
		JobSiteID  *int64 `json:"job_site_id"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.CustomerID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and customer_id are required")
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO budget_project_mappings (company, customer_id, client_id, job_site_id, updated_at)
		VALUES ($1,$2,$3,$4,now())
		ON CONFLICT (company, customer_id) DO UPDATE SET client_id=EXCLUDED.client_id, job_site_id=EXCLUDED.job_site_id, updated_at=now()
	`, b.Company, b.CustomerID, b.ClientID, b.JobSiteID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}
