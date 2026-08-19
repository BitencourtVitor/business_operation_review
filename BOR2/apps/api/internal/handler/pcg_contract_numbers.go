package handler

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The identifier printed on a subcontract: three letters of the trade, five
// digits of a single system-wide count — PLB-00001. Issued here rather than in
// the browser because it goes on paper somebody signs, and two browsers cannot
// agree on who gets 00001.
type PCGContractNumberHandler struct {
	db *pgxpool.Pool
}

func NewPCGContractNumberHandler(db *pgxpool.Pool) *PCGContractNumberHandler {
	return &PCGContractNumberHandler{db: db}
}

var tradeCodePattern = regexp.MustCompile(`^[A-Z]{3}$`)

type issueContractNumberRequest struct {
	ProjectID string `json:"project_id"`
	TradeID   string `json:"trade_id"`
	TradeCode string `json:"trade_code"`
}

type contractNumber struct {
	Number    string    `json:"number"`
	Seq       int64     `json:"seq"`
	TradeCode string    `json:"trade_code"`
	IssuedAt  time.Time `json:"issued_at"`
	IssuedBy  string    `json:"issued_by"`
}

// POST /api/v1/pcg/contract-numbers
//
// Idempotent by (project_id, trade_id): a contract asks once and keeps the
// number forever, so reprinting it — or opening it on another machine — shows
// the same identifier instead of consuming another.
func (h *PCGContractNumberHandler) Issue(c *fiber.Ctx) error {
	var req issueContractNumberRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}

	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.TradeID = strings.TrimSpace(req.TradeID)
	req.TradeCode = strings.ToUpper(strings.TrimSpace(req.TradeCode))

	if req.ProjectID == "" || req.TradeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project_id and trade_id are required", "code": "BAD_REQUEST"})
	}
	if !tradeCodePattern.MatchString(req.TradeCode) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "trade_code must be three letters", "code": "BAD_REQUEST"})
	}

	issuedBy, _ := c.Locals("userName").(string)

	// One statement, so two requests racing for the same contract cannot both
	// take a sequence value: the second conflicts on (project_id, trade_id) and
	// its CTE is discarded. The sequence may skip a number when that happens,
	// which is the intended trade — a gap costs nothing, a duplicate is a second
	// contract carrying an identifier that is already on somebody's paper.
	const query = `
		WITH issued AS (
			INSERT INTO pcg_contract_numbers (project_id, trade_id, trade_code, seq, number, issued_by)
			SELECT $1, $2, $3, s.seq, $3 || '-' || lpad(s.seq::text, 5, '0'), $4
			FROM (SELECT nextval('pcg_contract_number_seq') AS seq) s
			ON CONFLICT (project_id, trade_id) DO NOTHING
			RETURNING number, seq, trade_code, issued_at, issued_by
		)
		SELECT number, seq, trade_code, issued_at, issued_by FROM issued
		UNION ALL
		SELECT number, seq, trade_code, issued_at, issued_by
		FROM pcg_contract_numbers
		WHERE project_id = $1 AND trade_id = $2
		LIMIT 1
	`

	var out contractNumber
	err := h.db.QueryRow(c.Context(), query, req.ProjectID, req.TradeID, req.TradeCode, issuedBy).
		Scan(&out.Number, &out.Seq, &out.TradeCode, &out.IssuedAt, &out.IssuedBy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not issue a number", "code": "INTERNAL_ERROR"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": out})
}

// GET /api/v1/pcg/contract-numbers?project_id=
//
// Every number already issued on a project, so the list can show them without
// asking for one contract at a time — and without issuing anything.
func (h *PCGContractNumberHandler) List(c *fiber.Ctx) error {
	projectID := strings.TrimSpace(c.Query("project_id"))
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project_id is required", "code": "BAD_REQUEST"})
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT trade_id, number, seq, trade_code, issued_at, issued_by
		FROM pcg_contract_numbers
		WHERE project_id = $1
		ORDER BY seq
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	defer rows.Close()

	out := map[string]contractNumber{}
	for rows.Next() {
		var tradeID string
		var n contractNumber
		if err := rows.Scan(&tradeID, &n.Number, &n.Seq, &n.TradeCode, &n.IssuedAt, &n.IssuedBy); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
		}
		out[tradeID] = n
	}
	return c.JSON(fiber.Map{"data": out})
}
