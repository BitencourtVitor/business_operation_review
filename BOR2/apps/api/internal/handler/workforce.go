package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

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
	UploadID       string  `json:"uploadId"`
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

type attributionRule struct {
	Conditions    map[string]string
	TargetCompany string
}

// loadRules fetches all attribution rules from the DB.
// Returns empty slice (not error) if table doesn't exist yet.
func (h *WorkforceHandler) loadRules(ctx context.Context) []attributionRule {
	rows, err := h.db.Query(ctx,
		`SELECT conditions, target_company FROM workforce_attribution_rules ORDER BY created_at ASC`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var rules []attributionRule
	for rows.Next() {
		var condJSON []byte
		var target string
		if err := rows.Scan(&condJSON, &target); err != nil {
			continue
		}
		var cond map[string]string
		if err := json.Unmarshal(condJSON, &cond); err != nil {
			continue
		}
		rules = append(rules, attributionRule{Conditions: cond, TargetCompany: target})
	}
	return rules
}

// applyRule checks if a row matches a rule's conditions (all non-empty fields must match).
func applyRule(r workforceRow, rule attributionRule) bool {
	if v := rule.Conditions["company"];  v != "" && r.Company  != v { return false }
	if v := rule.Conditions["client"];   v != "" && r.Client   != v { return false }
	if v := rule.Conditions["jobsite"];  v != "" && r.Jobsite  != v { return false }
	if v := rule.Conditions["worktype"]; v != "" && r.Worktype != v { return false }
	return true
}

func (h *WorkforceHandler) List(c *fiber.Ctx) error {
	company  := c.Query("company")
	month    := c.Query("month")
	worktype := c.Query("worktype")
	jobsite  := c.Query("jobsite")

	ctx := context.Background()

	// Load attribution rules first (before SQL query)
	rules := h.loadRules(ctx)

	// Fetch ALL rows — no company filter at DB level.
	// Rules are applied in Go so rows from other companies that redirect
	// to the requested company are included correctly.
	query := `
		SELECT id, COALESCE(upload_id::text,''), COALESCE(client,''), COALESCE(jobsite,''),
		       COALESCE(lot_building,''), COALESCE(worktype,''), COALESCE(employee_name,''),
		       COALESCE(regular_rate,0), COALESCE(regular_hours,0),
		       COALESCE(reference_month,''), COALESCE(company,'')
		FROM workforce_productivity
		WHERE ($1 = '' OR reference_month = $1)
		  AND ($2 = '' OR worktype        = $2)
		  AND ($3 = '' OR jobsite ILIKE '%' || $3 || '%')
		ORDER BY reference_month DESC, regular_hours DESC
	`

	dbRows, err := h.db.Query(ctx, query, month, worktype, jobsite)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("query: %v", err), "code": "INTERNAL_ERROR",
		})
	}
	defer dbRows.Close()

	var all []workforceRow
	for dbRows.Next() {
		var r workforceRow
		if err := dbRows.Scan(&r.ID, &r.UploadID, &r.Client, &r.Jobsite, &r.LotBuilding,
			&r.Worktype, &r.EmployeeName, &r.RegularRate, &r.RegularHours,
			&r.ReferenceMonth, &r.Company); err != nil {
			continue
		}
		// Apply attribution rules: first matching rule overrides company
		for _, rule := range rules {
			if applyRule(r, rule) {
				r.Company = rule.TargetCompany
				break
			}
		}
		all = append(all, r)
	}

	// Filter by company in Go (after rules have been applied)
	results := all
	if company != "" {
		results = results[:0]
		for _, r := range all {
			if strings.EqualFold(r.Company, company) {
				results = append(results, r)
			}
		}
	}

	if results == nil {
		results = []workforceRow{}
	}

	return c.JSON(fiber.Map{"data": results})
}
