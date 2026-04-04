package handler

import (
	"context"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WorkforceHandler struct {
	db *pgxpool.Pool
}

func NewWorkforceHandler(db *pgxpool.Pool) *WorkforceHandler {
	return &WorkforceHandler{db: db}
}

type workforceRow struct {
	ID             string  `json:"id"`
	Client         string  `json:"client"`
	Jobsite        string  `json:"jobsite"`
	LotBuilding    string  `json:"lotBuilding"`
	Worktype       string  `json:"worktype"`
	EmployeeName   string  `json:"employeeName"`
	RegularRate    float64 `json:"regularRate"`
	RegularHours   float64 `json:"regularHours"`
	ReferenceMonth string  `json:"referenceMonth"`
	Company        string  `json:"company"`
}

func (h *WorkforceHandler) List(c *fiber.Ctx) error {
	company := c.Query("company")
	month := c.Query("month") // YYYY-MM format

	query := `
		SELECT id, COALESCE(client,''), COALESCE(jobsite,''), COALESCE(lot_building,''),
		       COALESCE(worktype,''), COALESCE(employee_name,''), COALESCE(regular_rate,0),
		       COALESCE(regular_hours,0), COALESCE(reference_month,''), COALESCE(company,'')
		FROM timesheet_data_new
		WHERE ($1 = '' OR company = $1)
		  AND ($2 = '' OR reference_month = $2)
		ORDER BY regular_hours DESC
	`

	rows, err := h.db.Query(context.Background(), query, company, month)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("query: %v", err), "code": "INTERNAL_ERROR"})
	}
	defer rows.Close()

	var results []workforceRow
	for rows.Next() {
		var r workforceRow
		if err := rows.Scan(&r.ID, &r.Client, &r.Jobsite, &r.LotBuilding, &r.Worktype,
			&r.EmployeeName, &r.RegularRate, &r.RegularHours, &r.ReferenceMonth, &r.Company); err != nil {
			continue
		}
		results = append(results, r)
	}

	return c.JSON(fiber.Map{"data": results})
}
