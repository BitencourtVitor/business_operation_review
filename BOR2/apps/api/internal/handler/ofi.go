package handler

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OFIHandler struct {
	db *pgxpool.Pool
}

func NewOFIHandler(db *pgxpool.Pool) *OFIHandler {
	return &OFIHandler{db: db}
}

// ─── Response types ───────────────────────────────────────────────────────────

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
	CaptureDate    string  `json:"captureDate"`
	ProjectName    string  `json:"projectName"`
	Address        string  `json:"address"`
}

type executionRow struct {
	ID               string `json:"id"`
	ObraID           string `json:"obraId"`
	ReferenceMonth   int    `json:"referenceMonth"`
	ReferenceYear    int    `json:"referenceYear"`
	PlannedStatus    string `json:"plannedStatus"`
	ActualStatus     string `json:"actualStatus"`
	Reason           string `json:"reason"`
	Subcontractor    string `json:"subcontractor"`
	IsCycleCompleted bool   `json:"isCycleCompleted"`
	ProjectName      string `json:"projectName"`
	JobSite          string `json:"jobSite"`
	Address          string `json:"address"`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func validOFIPeriod(month, year int) bool {
	return month >= 1 && month <= 12 && year >= 2000 && year <= 9999
}

func ofiInternalErr(c *fiber.Ctx, op string, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": fmt.Sprintf("%s: %v", op, err),
		"code":  "INTERNAL_ERROR",
	})
}

// calcFieldwireScore scores forecast_fieldwire documents. The column is text
// carrying the three states from BD-07 (pending, completed, dispensed), not a
// boolean — a dispensed document is satisfied, same rule the e-mail trigger and
// the HVAC metrics page already apply. NULL and "none" mean still pending.
func calcFieldwireScore(ctx context.Context, db pgx.Tx, id string, weight float64) (float64, error) {
	rows, err := db.Query(ctx,
		`SELECT COALESCE(status, '') FROM forecast_fieldwire WHERE project_id = $1`, id)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var total, done int
	for rows.Next() {
		var status string
		if err := rows.Scan(&status); err != nil {
			return 0, err
		}
		total++
		switch strings.ToLower(strings.TrimSpace(status)) {
		case "completed", "dispensed":
			done++
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	return round2(float64(done) / float64(total) * weight), nil
}

// calcBoolScore queries a boolean-status table and returns (done/total)*weight.
func calcBoolScore(ctx context.Context, db pgx.Tx, query, id string, weight float64) (float64, error) {
	rows, err := db.Query(ctx, query, id)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var total, done int
	for rows.Next() {
		var status bool
		if err := rows.Scan(&status); err != nil {
			return 0, err
		}
		total++
		if status {
			done++
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	return round2(float64(done) / float64(total) * weight), nil
}

// calcMachineScore queries forecast_machines and counts 'scheduled'/'dispensed'.
// Private-client obras never get machines seeded (no catalog entries for that
// client), so an empty list there means "not applicable", not "not ready" —
// score them as fully satisfied instead of 0.
func calcMachineScore(ctx context.Context, db pgx.Tx, id, cliente string) (float64, error) {
	if strings.EqualFold(strings.TrimSpace(cliente), "private") {
		return 2, nil
	}
	rows, err := db.Query(ctx,
		`SELECT COALESCE(status,'') FROM forecast_machines WHERE project_id = $1`, id)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var total, done int
	for rows.Next() {
		var status string
		if err := rows.Scan(&status); err != nil {
			return 0, err
		}
		total++
		if s := strings.ToLower(status); s == "scheduled" || s == "dispensed" {
			done++
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	return round2(float64(done) / float64(total) * 2), nil
}

// ─── GET /ofi ─────────────────────────────────────────────────────────────────

func (h *OFIHandler) List(c *fiber.Ctx) error {
	year, _ := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	rows, err := h.db.Query(context.Background(), `
		SELECT o.id, o.obra_id, o.reference_month, o.reference_year,
		       o.fieldwire_score, o.machines_score, o.contract_score, o.systems_score, o.total_score,
		       COALESCE(o.capture_date::text, ''),
		       CASE
		         WHEN NULLIF(fc.name,'')     IS NOT NULL AND NULLIF(fc.lote_bld,'') IS NOT NULL THEN fc.name     || ' - ' || fc.lote_bld
		         WHEN NULLIF(fc.name,'')     IS NOT NULL                                        THEN fc.name
		         WHEN NULLIF(fc.job_site,'') IS NOT NULL AND NULLIF(fc.lote_bld,'') IS NOT NULL THEN fc.job_site || ' - ' || fc.lote_bld
		         WHEN NULLIF(fc.job_site,'') IS NOT NULL                                        THEN fc.job_site
		         WHEN NULLIF(fc.lote_bld,'') IS NOT NULL                                        THEN fc.lote_bld
		         ELSE o.obra_id
		       END AS project_name,
		       COALESCE(fc.address, '') AS address
		FROM   operational_forecast_index o
		LEFT   JOIN forecast_core fc ON LOWER(fc.id) = LOWER(o.obra_id)
		WHERE  ($1 = 0 OR o.reference_year  = $1)
		  AND  ($2 = 0 OR o.reference_month = $2)
		ORDER BY o.reference_year DESC, o.reference_month DESC, o.total_score DESC
	`, year, month)
	if err != nil {
		return ofiInternalErr(c, "list ofi", err)
	}
	defer rows.Close()

	results := []ofiRow{}
	for rows.Next() {
		var r ofiRow
		if err := rows.Scan(
			&r.ID, &r.ObraID, &r.ReferenceMonth, &r.ReferenceYear,
			&r.FieldwireScore, &r.MachinesScore, &r.ContractScore, &r.SystemsScore, &r.TotalScore,
			&r.CaptureDate, &r.ProjectName, &r.Address,
		); err != nil {
			continue
		}
		results = append(results, r)
	}
	return c.JSON(fiber.Map{"data": results})
}

// ─── GET /ofi/monthly-execution ───────────────────────────────────────────────

func (h *OFIHandler) ListExecution(c *fiber.Ctx) error {
	year, _ := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	rows, err := h.db.Query(context.Background(), `
		SELECT e.id, e.obra_id, e.reference_month, e.reference_year,
		       e.planned_status, e.actual_status, e.reason, e.subcontractor, e.is_cycle_completed,
		       CASE
		         WHEN NULLIF(fc.name,'') IS NOT NULL AND fc.name != COALESCE(fc.lote_bld,'') AND NULLIF(fc.lote_bld,'') IS NOT NULL THEN fc.name || ' - ' || fc.lote_bld
		         WHEN NULLIF(fc.name,'') IS NOT NULL AND fc.name != COALESCE(fc.lote_bld,'')                                     THEN fc.name
		         WHEN NULLIF(fc.job_site,'') IS NOT NULL AND NULLIF(fc.lote_bld,'') IS NOT NULL THEN fc.job_site || ' - ' || fc.lote_bld
		         WHEN NULLIF(fc.job_site,'') IS NOT NULL                                        THEN fc.job_site
		         WHEN NULLIF(fc.lote_bld,'') IS NOT NULL                                        THEN fc.lote_bld
		         ELSE e.obra_id
		       END AS project_name,
		       COALESCE(fc.job_site, '') AS job_site,
		       COALESCE(fc.address,  '') AS address
		FROM   monthly_execution_history e
		LEFT   JOIN forecast_core fc ON LOWER(fc.id) = LOWER(e.obra_id)
		WHERE  ($1 = 0 OR e.reference_year  = $1)
		  AND  ($2 = 0 OR e.reference_month = $2)
		ORDER BY e.reference_year DESC, e.reference_month DESC, project_name ASC
	`, year, month)
	if err != nil {
		return ofiInternalErr(c, "list execution", err)
	}
	defer rows.Close()

	results := []executionRow{}
	for rows.Next() {
		var r executionRow
		if err := rows.Scan(
			&r.ID, &r.ObraID, &r.ReferenceMonth, &r.ReferenceYear,
			&r.PlannedStatus, &r.ActualStatus, &r.Reason, &r.Subcontractor, &r.IsCycleCompleted,
			&r.ProjectName, &r.JobSite, &r.Address,
		); err != nil {
			continue
		}
		results = append(results, r)
	}
	return c.JSON(fiber.Map{"data": results})
}

// ─── PATCH /ofi/monthly-execution/:id ────────────────────────────────────────

func (h *OFIHandler) UpdateExecutionReason(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid body", "code": "BAD_REQUEST",
		})
	}
	tag, err := h.db.Exec(context.Background(),
		`UPDATE monthly_execution_history SET reason = $1 WHERE id = $2`,
		body.Reason, id,
	)
	if err != nil || tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "record not found", "code": "NOT_FOUND",
		})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─── POST /ofi/calculate ──────────────────────────────────────────────────────
// Ports the BOR1 ofi_calculator.ts Supabase Edge Function to Go.
//
// Pipeline 1 — Execution: closes the execution month by snapshotting current
//   obra statuses from forecast_core into monthly_execution_history.
// Pipeline 2 — Planning: scores obras whose previous_start_date falls in the
//   target month and writes results to operational_forecast_index.
//
// Request body (all optional — defaults to current month / next month):
//   executionMonth int, executionYear int
//   month int, year int

func (h *OFIHandler) Calculate(c *fiber.Ctx) error {
	ctx := context.Background()
	location, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return ofiInternalErr(c, "load business timezone", err)
	}
	now := time.Now().In(location)

	var req struct {
		ExecutionMonth int  `json:"executionMonth"`
		ExecutionYear  int  `json:"executionYear"`
		Month          int  `json:"month"`
		Year           int  `json:"year"`
		DryRun         bool `json:"dryRun"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid body", "code": "BAD_REQUEST",
		})
	}
	if !validOFIPeriod(req.ExecutionMonth, req.ExecutionYear) ||
		!validOFIPeriod(req.Month, req.Year) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "executionMonth, executionYear, month and year are required and must be valid",
			"code":  "BAD_REQUEST",
		})
	}

	execMonth, execYear := req.ExecutionMonth, req.ExecutionYear
	targetMonth, targetYear := req.Month, req.Year
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return ofiInternalErr(c, "begin OFI calculation", err)
	}
	defer tx.Rollback(ctx)

	planRows, err := tx.Query(ctx, `
		SELECT DISTINCT obra_id FROM operational_forecast_index
		WHERE reference_month = $1 AND reference_year = $2`, execMonth, execYear)
	if err != nil {
		return ofiInternalErr(c, "load planned obras", err)
	}
	var plannedIDs []string
	for planRows.Next() {
		var id string
		if err := planRows.Scan(&id); err != nil {
			planRows.Close()
			return ofiInternalErr(c, "scan planned obra", err)
		}
		plannedIDs = append(plannedIDs, id)
	}
	if err := planRows.Err(); err != nil {
		planRows.Close()
		return ofiInternalErr(c, "read planned obras", err)
	}
	planRows.Close()

	type preservedExecution struct {
		plannedStatus string
		reason        string
		subcontractor string
	}
	preserved := map[string]preservedExecution{}
	preservedRows, err := tx.Query(ctx, `
		SELECT obra_id, COALESCE(planned_status,''), COALESCE(reason,''), COALESCE(subcontractor,'')
		FROM monthly_execution_history
		WHERE reference_month = $1 AND reference_year = $2`, execMonth, execYear)
	if err != nil {
		return ofiInternalErr(c, "load preserved execution data", err)
	}
	for preservedRows.Next() {
		var obraID string
		var value preservedExecution
		if err := preservedRows.Scan(&obraID, &value.plannedStatus, &value.reason, &value.subcontractor); err != nil {
			preservedRows.Close()
			return ofiInternalErr(c, "scan preserved execution data", err)
		}
		preserved[obraID] = value
	}
	if err := preservedRows.Err(); err != nil {
		preservedRows.Close()
		return ofiInternalErr(c, "read preserved execution data", err)
	}
	preservedRows.Close()

	if _, err = tx.Exec(ctx, `
		DELETE FROM monthly_execution_history
		WHERE reference_month = $1 AND reference_year = $2`, execMonth, execYear); err != nil {
		return ofiInternalErr(c, "delete old execution", err)
	}

	execCount := 0
	startedCount := 0
	for _, obraID := range plannedIDs {
		var status string
		var startDate, endDate *time.Time
		if err := tx.QueryRow(ctx, `
			SELECT COALESCE(status,''), previous_start_date, previous_end_date
			FROM forecast_core WHERE id = $1`, obraID).Scan(&status, &startDate, &endDate); err != nil {
			return ofiInternalErr(c, "load execution obra", err)
		}

		statusLower := strings.ToLower(strings.TrimSpace(status))
		isStarted := statusLower == "open" || statusLower == "started" || statusLower == "closed"
		isCompleted := statusLower == "closed"
		actualStatus := "not_started"
		if isCompleted {
			actualStatus = "completed"
		} else if isStarted {
			actualStatus = "started"
		}
		if isStarted {
			startedCount++
		}

		var actualStart, actualEnd *time.Time
		if isStarted {
			actualStart = startDate
		}
		if isCompleted {
			actualEnd = endDate
		}

		old := preserved[obraID]
		if _, err = tx.Exec(ctx, `
			INSERT INTO monthly_execution_history
			  (obra_id, reference_month, reference_year,
			   planned_status, actual_status, reason, subcontractor,
			   is_cycle_completed, actual_start_date, actual_end_date)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			obraID, execMonth, execYear, old.plannedStatus, actualStatus,
			old.reason, old.subcontractor, isCompleted, actualStart, actualEnd); err != nil {
			return ofiInternalErr(c, "insert execution record", err)
		}
		execCount++
	}

	startOfMonth := fmt.Sprintf("%04d-%02d-01", targetYear, targetMonth)
	endOfMonth := time.Date(targetYear, time.Month(targetMonth+1), 0, 0, 0, 0, 0, location).Format("2006-01-02")
	type obra struct {
		ID           string
		Cliente      string
		Storage      bool
		QBTime       bool
		BuilderTrend bool
	}
	obraRows, err := tx.Query(ctx, `
		SELECT id, COALESCE(cliente,''), COALESCE(storage,false),
		       COALESCE(qb_time,false), COALESCE(buildertrend,false)
		FROM forecast_core
		WHERE previous_start_date >= $1 AND previous_start_date <= $2`, startOfMonth, endOfMonth)
	if err != nil {
		return ofiInternalErr(c, "load obras for planning", err)
	}
	var obras []obra
	for obraRows.Next() {
		var o obra
		if err := obraRows.Scan(&o.ID, &o.Cliente, &o.Storage, &o.QBTime, &o.BuilderTrend); err != nil {
			obraRows.Close()
			return ofiInternalErr(c, "scan planning obra", err)
		}
		obras = append(obras, o)
	}
	if err := obraRows.Err(); err != nil {
		obraRows.Close()
		return ofiInternalErr(c, "read planning obras", err)
	}
	obraRows.Close()

	if _, err = tx.Exec(ctx, `
		DELETE FROM operational_forecast_index
		WHERE reference_month = $1 AND reference_year = $2`, targetMonth, targetYear); err != nil {
		return ofiInternalErr(c, "delete old OFI scores", err)
	}

	ofiCount := 0
	totalScore := 0.0
	captureDate := now.Format("2006-01-02")
	for _, o := range obras {
		fwScore, err := calcFieldwireScore(ctx, tx, o.ID, 2.0)
		if err != nil {
			return ofiInternalErr(c, "calculate Fieldwire score", err)
		}
		mScore, err := calcMachineScore(ctx, tx, o.ID, o.Cliente)
		if err != nil {
			return ofiInternalErr(c, "calculate machines score", err)
		}
		cScore, err := calcBoolScore(ctx, tx,
			`SELECT status FROM forecast_contract_steps WHERE project_id = $1`, o.ID, 2.0)
		if err != nil {
			return ofiInternalErr(c, "calculate contract score", err)
		}

		sScore := 0.0
		if o.Storage {
			sScore += 0.333
		}
		if o.QBTime {
			sScore += 0.333
		}
		if o.BuilderTrend {
			sScore += 0.334
		}
		if sScore > 1.0 {
			sScore = 1.0
		}
		sScore = round2(sScore)
		total := round2(fwScore + mScore + cScore + sScore)

		if _, err = tx.Exec(ctx, `
			INSERT INTO operational_forecast_index
			  (obra_id, reference_month, reference_year, capture_date,
			   fieldwire_score, machines_score, contract_score, systems_score, total_score)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, o.ID, targetMonth, targetYear,
			captureDate, fwScore, mScore, cScore, sScore, total); err != nil {
			return ofiInternalErr(c, "insert OFI score", err)
		}
		totalScore += total
		ofiCount++
	}

	prunedTag, err := tx.Exec(ctx, `
		DELETE FROM monthly_execution_history e
		WHERE e.reference_month = $1 AND e.reference_year = $2
		  AND NOT EXISTS (
		    SELECT 1 FROM operational_forecast_index o
		    WHERE o.obra_id = e.obra_id
		      AND o.reference_month = $1 AND o.reference_year = $2
		  )`, targetMonth, targetYear)
	if err != nil {
		return ofiInternalErr(c, "prune stale planned execution records", err)
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO monthly_execution_history
		  (obra_id, reference_month, reference_year,
		   planned_status, actual_status, reason, subcontractor,
		   is_cycle_completed, actual_start_date, actual_end_date)
		SELECT o.obra_id, $1, $2, '', 'not_started', '', '', false, NULL, NULL
		FROM operational_forecast_index o
		WHERE o.reference_month = $1 AND o.reference_year = $2
		  AND NOT EXISTS (
		    SELECT 1 FROM monthly_execution_history e
		    WHERE e.obra_id = o.obra_id
		      AND e.reference_month = $1 AND e.reference_year = $2
		  )`, targetMonth, targetYear); err != nil {
		return ofiInternalErr(c, "seed planned execution records", err)
	}

	var targetExecutionCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM monthly_execution_history
		WHERE reference_month = $1 AND reference_year = $2`, targetMonth, targetYear).
		Scan(&targetExecutionCount); err != nil {
		return ofiInternalErr(c, "count target execution records", err)
	}

	averageScore := 0.0
	if ofiCount > 0 {
		averageScore = round2(totalScore / float64(ofiCount))
	}
	if req.DryRun {
		if err := tx.Rollback(ctx); err != nil {
			return ofiInternalErr(c, "rollback OFI dry run", err)
		}
	} else if err := tx.Commit(ctx); err != nil {
		return ofiInternalErr(c, "commit OFI calculation", err)
	}

	return c.JSON(fiber.Map{
		"success": true, "dryRun": req.DryRun,
		"executionMonth": execMonth, "executionYear": execYear,
		"executionCount": execCount, "startedCount": startedCount,
		"planningMonth": targetMonth, "planningYear": targetYear,
		"ofiCount": ofiCount, "averageScore": averageScore,
		"targetExecutionCount":       targetExecutionCount,
		"prunedTargetExecutionCount": prunedTag.RowsAffected(),
	})
}
