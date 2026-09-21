package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Formulário de cotação respondido de fora do BOR: o link é mandado no WhatsApp
// e quem abre não tem login. Só duas rotas são públicas, ler o formulário e
// enviá-lo uma vez. Tudo que cria, desliga ou apaga continua atrás da sessão.
type PCGBidFormHandler struct {
	db *pgxpool.Pool
}

func NewPCGBidFormHandler(db *pgxpool.Pool) *PCGBidFormHandler {
	return &PCGBidFormHandler{db: db}
}

type pcgBidForm struct {
	ID          string          `json:"id"`
	ProjectID   string          `json:"projectId"`
	TradeID     string          `json:"tradeId"`
	Snapshot    json.RawMessage `json:"snapshot"`
	Answers     json.RawMessage `json:"answers,omitempty"`
	Available   bool            `json:"available"`
	SubmittedAt *time.Time      `json:"submittedAt"`
	CreatedAt   time.Time       `json:"createdAt"`
	CreatedBy   string          `json:"createdBy"`
}

const bidFormColumns = `id, project_id, trade_id, snapshot, answers, available, submitted_at, created_at, created_by`

func scanBidForm(row pgx.Row) (pcgBidForm, error) {
	var f pcgBidForm
	err := row.Scan(&f.ID, &f.ProjectID, &f.TradeID, &f.Snapshot, &f.Answers,
		&f.Available, &f.SubmittedAt, &f.CreatedAt, &f.CreatedBy)
	return f, err
}

// O id é o endereço: quem tem o link entra. São 16 bytes de aleatório, não um
// contador nem uma data, para que ninguém chegue ao formulário do vizinho
// somando um.
func newFormID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// Teto do que o link aceita de volta. O questionário mais longo do catálogo tem
// algumas dezenas de perguntas; muito além disso é abuso, não cotação.
const (
	maxAnswerKeys = 500
	maxAnswerSize = 256 * 1024
)

// Resposta é par "pergunta -> texto ou lista de textos", e nada mais. A
// validação está aqui porque este é o único ponto do sistema em que um anônimo
// escreve no banco.
func validAnswers(raw json.RawMessage) bool {
	if len(raw) == 0 || len(raw) > maxAnswerSize {
		return false
	}
	var answers map[string]json.RawMessage
	if err := json.Unmarshal(raw, &answers); err != nil || len(answers) > maxAnswerKeys {
		return false
	}
	for _, value := range answers {
		var text string
		if json.Unmarshal(value, &text) == nil {
			continue
		}
		var list []string
		if json.Unmarshal(value, &list) != nil {
			return false
		}
	}
	return true
}

type createBidFormRequest struct {
	ProjectID string          `json:"projectId"`
	TradeID   string          `json:"tradeId"`
	Snapshot  json.RawMessage `json:"snapshot"`
}

// POST /api/v1/pcg/forms
func (h *PCGBidFormHandler) Create(c *fiber.Ctx) error {
	var req createBidFormRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.TradeID = strings.TrimSpace(req.TradeID)
	if req.ProjectID == "" || req.TradeID == "" || len(req.Snapshot) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId, tradeId and snapshot are required", "code": "BAD_REQUEST"})
	}

	id, err := newFormID()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	createdBy, _ := c.Locals("userName").(string)

	out, err := scanBidForm(h.db.QueryRow(c.Context(), `
		INSERT INTO pcg_bid_forms (id, project_id, trade_id, snapshot, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+bidFormColumns,
		id, req.ProjectID, req.TradeID, []byte(req.Snapshot), createdBy))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": out})
}

// GET /api/v1/pcg/forms?project_id=
func (h *PCGBidFormHandler) List(c *fiber.Ctx) error {
	projectID := strings.TrimSpace(c.Query("project_id"))
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "project_id is required", "code": "BAD_REQUEST"})
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT `+bidFormColumns+`
		FROM pcg_bid_forms
		WHERE project_id = $1
		ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	defer rows.Close()

	out := []pcgBidForm{}
	for rows.Next() {
		f, err := scanBidForm(rows)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
		}
		out = append(out, f)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PATCH /api/v1/pcg/forms/:id
//
// Liga e desliga o link. Um formulário já respondido não volta a aceitar
// resposta: quem quiser outra rodada cria outro link.
func (h *PCGBidFormHandler) SetAvailable(c *fiber.Ctx) error {
	var req struct {
		Available *bool `json:"available"`
	}
	if err := c.BodyParser(&req); err != nil || req.Available == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "available is required", "code": "BAD_REQUEST"})
	}

	out, err := scanBidForm(h.db.QueryRow(c.Context(), `
		UPDATE pcg_bid_forms
		SET available = $2
		WHERE id = $1 AND submitted_at IS NULL
		RETURNING `+bidFormColumns,
		c.Params("id"), *req.Available))
	if errors.Is(err, pgx.ErrNoRows) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "form not found, or already answered", "code": "NOT_FOUND"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": out})
}

// DELETE /api/v1/pcg/forms/:id
func (h *PCGBidFormHandler) Delete(c *fiber.Ctx) error {
	if _, err := h.db.Exec(c.Context(), `DELETE FROM pcg_bid_forms WHERE id = $1`, c.Params("id")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// O que a página pública devolve. As perguntas só viajam enquanto o link está
// aberto: fechado, ele responde que fechou, e nada mais.
type publicBidForm struct {
	ID       string          `json:"id"`
	State    string          `json:"state"` // open | answered | closed
	Snapshot json.RawMessage `json:"snapshot,omitempty"`
}

// GET /api/v1/pcg/public-forms/:id, sem sessão.
func (h *PCGBidFormHandler) Public(c *fiber.Ctx) error {
	var snapshot json.RawMessage
	var available bool
	var submittedAt *time.Time

	err := h.db.QueryRow(c.Context(), `
		SELECT snapshot, available, submitted_at FROM pcg_bid_forms WHERE id = $1
	`, c.Params("id")).Scan(&snapshot, &available, &submittedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "form not found", "code": "NOT_FOUND"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}

	out := publicBidForm{ID: c.Params("id"), State: "closed"}
	switch {
	case submittedAt != nil:
		out.State = "answered"
	case available:
		out.State = "open"
		out.Snapshot = snapshot
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /api/v1/pcg/public-forms/:id, sem sessão.
//
// Uma vez só: a condição do UPDATE é o que fecha o link, então dois envios
// simultâneos do mesmo formulário não gravam os dois.
func (h *PCGBidFormHandler) Submit(c *fiber.Ctx) error {
	var req struct {
		Answers json.RawMessage `json:"answers"`
	}
	if err := c.BodyParser(&req); err != nil || !validAnswers(req.Answers) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid answers", "code": "BAD_REQUEST"})
	}

	var submittedAt time.Time
	err := h.db.QueryRow(c.Context(), `
		UPDATE pcg_bid_forms
		SET answers = $2, submitted_at = now(), available = FALSE
		WHERE id = $1 AND available AND submitted_at IS NULL
		RETURNING submitted_at
	`, c.Params("id"), []byte(req.Answers)).Scan(&submittedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "this form is no longer open", "code": "FORM_CLOSED"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"submittedAt": submittedAt}})
}
