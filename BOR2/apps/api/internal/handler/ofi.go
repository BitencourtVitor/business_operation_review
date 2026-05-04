package handler

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func ofiInternalErr(c *fiber.Ctx, op string, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": fmt.Sprintf("%s: %v", op, err),
		"code":  "INTERNAL_ERROR",
	})
}

// calcBoolScore queries a boolean-status table and returns (done/total)*weight.
func calcBoolScore(ctx context.Context, db *pgxpool.Pool, query, id string, weight float64) float64 {
	rows, err := db.Query(ctx, query, id)
	if err != nil {
		return 0
	}
	defer rows.Close()
	var total, done int
	for rows.Next() {
		var status bool
		if rows.Scan(&status) == nil {
			total++
			if status {
				done++
			}
		}
	}
	if total == 0 {
		return 0
	}
	return round2(float64(done) / float64(total) * weight)
}

// calcMachineScore queries forecast_machines and counts 'scheduled'/'dispensed'.
func calcMachineScore(ctx context.Context, db *pgxpool.Pool, id string) float64 {
	rows, err := db.Query(ctx,
		`SELECT COALESCE(status,'') FROM forecast_machines WHERE project_id = $1`, id)
	if err != nil {
		return 0
	}
	defer rows.Close()
	var total, done int
	for rows.Next() {
		var status string
		if rows.Scan(&status) == nil {
			total++
			if s := strings.ToLower(status); s == "scheduled" || s == "dispensed" {
				done++
			}
		}
	}
	if total == 0 {
		return 0
	}
	return round2(float64(done) / float64(total) * 2)
}

// ─── GET /ofi ─────────────────────────────────────────────────────────────────

func (h *OFIHandler) List(c *fiber.Ctx) error {
	year, _  := strconv.Atoi(c.Query("year"))
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
		       END AS project_name
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
			&r.CaptureDate, &r.ProjectName,
		); err != nil {
			continue
		}
		results = append(results, r)
	}
	return c.JSON(fiber.Map{"data": results})
}

// ─── GET /ofi/monthly-execution ───────────────────────────────────────────────

func (h *OFIHandler) ListExecution(c *fiber.Ctx) error {
	year, _  := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	rows, err := h.db.Query(context.Background(), `
		SELECT e.id, e.obra_id, e.reference_month, e.reference_year,
		       e.planned_status, e.actual_status, e.reason, e.subcontractor, e.is_cycle_completed,
		       CASE
		         WHEN NULLIF(fc.name,'')     IS NOT NULL AND NULLIF(fc.lote_bld,'') IS NOT NULL THEN fc.name     || ' - ' || fc.lote_bld
		         WHEN NULLIF(fc.name,'')     IS NOT NULL                                        THEN fc.name
		         WHEN NULLIF(fc.job_site,'') IS NOT NULL AND NULLIF(fc.lote_bld,'') IS NOT NULL THEN fc.job_site || ' - ' || fc.lote_bld
		         WHEN NULLIF(fc.job_site,'') IS NOT NULL                                        THEN fc.job_site
		         WHEN NULLIF(fc.lote_bld,'') IS NOT NULL                                        THEN fc.lote_bld
		         ELSE e.obra_id
		       END AS project_name
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
			&r.ProjectName,
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
	now := time.Now().UTC()

	var req struct {
		ExecutionMonth int `json:"executionMonth"`
		ExecutionYear  int `json:"executionYear"`
		Month          int `json:"month"`
		Year           int `json:"year"`
	}
	_ = c.BodyParser(&req)

	// Execution period
	execMonth := req.ExecutionMonth
	execYear  := req.ExecutionYear
	if execMonth == 0 { execMonth = int(now.Month()) }
	if execYear  == 0 { execYear  = now.Year()       }

	// Planning period (next calendar month by default)
	targetMonth := req.Month
	targetYear  := req.Year
	if targetMonth == 0 {
		next        := now.AddDate(0, 1, 0)
		targetMonth  = int(next.Month())
		targetYear   = next.Year()
	}
	if targetYear == 0 { targetYear = now.Year() }

	// ── Pipeline 1: Monthly Execution ────────────────────────────────────────

	// Load obra IDs planned for execution period (from OFI scores)
	planRows, err := h.db.Query(ctx,
		`SELECT DISTINCT obra_id FROM operational_forecast_index
		 WHERE reference_month = $1 AND reference_year = $2`,
		execMonth, execYear,
	)
	if err != nil {
		return ofiInternalErr(c, "load planned obras", err)
	}
	var plannedIDs []string
	for planRows.Next() {
		var id string
		if scanErr := planRows.Scan(&id); scanErr == nil {
			plannedIDs = append(plannedIDs, id)
		}
	}
	planRows.Close()

	execCount := 0
	if len(plannedIDs) > 0 {
		// Preserve manually-entered reasons before wiping
		reasonRows, _ := h.db.Query(ctx,
			`SELECT obra_id, reason FROM monthly_execution_history
			 WHERE reference_month = $1 AND reference_year = $2 AND reason <> ''`,
			execMonth, execYear,
		)
		reasonMap := map[string]string{}
		for reasonRows.Next() {
			var obraID, reason string
			if scanErr := reasonRows.Scan(&obraID, &reason); scanErr == nil {
				reasonMap[obraID] = reason
			}
		}
		reasonRows.Close()

		if _, err = h.db.Exec(ctx,
			`DELETE FROM monthly_execution_history
			 WHERE reference_month = $1 AND reference_year = $2`,
			execMonth, execYear,
		); err != nil {
			return ofiInternalErr(c, "delete old execution", err)
		}

		for _, obraID := range plannedIDs {
			var status    string
			var startDate *time.Time
			var endDate   *time.Time
			if err := h.db.QueryRow(ctx,
				`SELECT COALESCE(status,''), previous_start_date, previous_end_date
				 FROM forecast_core WHERE id = $1`, obraID,
			).Scan(&status, &startDate, &endDate); err != nil {
				continue
			}

			isStartedFlag   := status == "open" || status == "started" || status == "closed"
			isCompletedFlag := status == "closed"

			actualStatus := "not_started"
			if isCompletedFlag {
				actualStatus = "completed"
			} else if isStartedFlag {
				actualStatus = "started"
			}

			var actualStart, actualEnd *time.Time
			if isStartedFlag   { actualStart = startDate }
			if isCompletedFlag { actualEnd   = endDate   }

			if _, err = h.db.Exec(ctx, `
				INSERT INTO monthly_execution_history
				  (obra_id, reference_month, reference_year,
				   planned_status, actual_status, reason, subcontractor,
				   is_cycle_completed, actual_start_date, actual_end_date)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				obraID, execMonth, execYear,
				status, actualStatus, reasonMap[obraID], "",
				isCompletedFlag, actualStart, actualEnd,
			); err != nil {
				return ofiInternalErr(c, "insert execution record", err)
			}
			execCount++
		}
	}

	// ── Pipeline 2: OFI Planning ──────────────────────────────────────────────

	startOfMonth := fmt.Sprintf("%04d-%02d-01", targetYear, targetMonth)
	// Last day of target month: first day of month+1 minus 1 day
	endOfMonth := time.Date(targetYear, time.Month(targetMonth+1), 0, 0, 0, 0, 0, time.UTC).
		Format("2006-01-02")

	type obra struct {
		ID           string
		Storage      bool
		QBTime       bool
		BuilderTrend bool
	}

	obraRows, err := h.db.Query(ctx, `
		SELECT id,
		       COALESCE(storage,false),
		       COALESCE(qb_time,false),
		       COALESCE(buildertrend,false)
		FROM forecast_core
		WHERE previous_start_date >= $1
		  AND previous_start_date <= $2`,
		startOfMonth, endOfMonth,
	)
	if err != nil {
		return ofiInternalErr(c, "load obras for planning", err)
	}
	var obras []obra
	for obraRows.Next() {
		var o obra
		if scanErr := obraRows.Scan(&o.ID, &o.Storage, &o.QBTime, &o.BuilderTrend); scanErr == nil {
			obras = append(obras, o)
		}
	}
	obraRows.Close()

	ofiCount := 0
	if len(obras) > 0 {
		if _, err = h.db.Exec(ctx,
			`DELETE FROM operational_forecast_index
			 WHERE reference_month = $1 AND reference_year = $2`,
			targetMonth, targetYear,
		); err != nil {
			return ofiInternalErr(c, "delete old OFI scores", err)
		}

		captureDate := now.Format("2006-01-02")

		for _, o := range obras {
			fwScore := calcBoolScore(ctx, h.db,
				`SELECT status FROM forecast_fieldwire WHERE project_id = $1`, o.ID, 2.0)

			mScore := calcMachineScore(ctx, h.db, o.ID)

			cScore := calcBoolScore(ctx, h.db,
				`SELECT status FROM forecast_contract_steps WHERE project_id = $1`, o.ID, 2.0)

			sScore := 0.0
			if o.Storage      { sScore += 0.333 }
			if o.QBTime       { sScore += 0.333 }
			if o.BuilderTrend { sScore += 0.334 }
			if sScore > 1.0   { sScore = 1.0    }
			sScore = round2(sScore)

			total := round2(fwScore + mScore + cScore + sScore)

			if _, err = h.db.Exec(ctx, `
				INSERT INTO operational_forecast_index
				  (obra_id, reference_month, reference_year, capture_date,
				   fieldwire_score, machines_score, contract_score, systems_score, total_score)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				o.ID, targetMonth, targetYear, captureDate,
				fwScore, mScore, cScore, sScore, total,
			); err != nil {
				return ofiInternalErr(c, "insert OFI score", err)
			}
			ofiCount++
		}
	}

	return c.JSON(fiber.Map{
		"success":        true,
		"executionMonth": execMonth,
		"executionYear":  execYear,
		"executionCount": execCount,
		"planningMonth":  targetMonth,
		"planningYear":   targetYear,
		"ofiCount":       ofiCount,
	})
}
