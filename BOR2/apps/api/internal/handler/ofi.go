package handler

import (
	"context"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OFIHandler struct {
	db *pgxpool.Pool
}

func NewOFIHandler(db *pgxpool.Pool) *OFIHandler {
	return &OFIHandler{db: db}
}

type ofiRow struct {
	ID             string  `json:"id"`
	ObraID         string  `json:"obraId"`
	ReferenceMonth int     `json:"referenceMonth"`
	ReferenceYear  int     `json:"referenceYear"`
	FieldwireScore float64 `json:"fieldwireScore"`
	MachinesScore  float64 `json:"machinesScore"`
	ContractScore  float64 `json:"contractScore"`
	SystemsScore   float64 `json:"systemsScore"`
	TotalScore     float64 `json:"totalScore"`
	ProjectName    string  `json:"projectName"`
}

func (h *OFIHandler) List(c *fiber.Ctx) error {
	year, _ := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	query := `
		SELECT o.id, o.obra_id, o.reference_month, o.reference_year,
		       o.fieldwire_score, o.machines_score, o.contract_score, o.systems_score, o.total_score,
		       COALESCE(f.name, f.job_site, o.obra_id) as project_name
		FROM operational_forecast_index o
		LEFT JOIN forecast_projects f ON f.id = o.obra_id
		WHERE ($1 = 0 OR o.reference_year = $1)
		  AND ($2 = 0 OR o.reference_month = $2)
		ORDER BY o.total_score DESC
	`

	rows, err := h.db.Query(context.Background(), query, year, month)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("query: %v", err), "code": "INTERNAL_ERROR"})
	}
	defer rows.Close()

	var results []ofiRow
	for rows.Next() {
		var r ofiRow
		if err := rows.Scan(&r.ID, &r.ObraID, &r.ReferenceMonth, &r.ReferenceYear,
			&r.FieldwireScore, &r.MachinesScore, &r.ContractScore, &r.SystemsScore, &r.TotalScore,
			&r.ProjectName); err != nil {
			continue
		}
		results = append(results, r)
	}

	return c.JSON(fiber.Map{"data": results})
}
