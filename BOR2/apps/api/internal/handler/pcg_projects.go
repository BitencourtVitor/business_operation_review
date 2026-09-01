package handler

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PCG Bids and Contracts: projetos, trades e a linha do tempo de cada trade.
//
// O módulo vivia inteiro no localStorage do navegador — um contrato assinado
// existia em uma máquina só, sem cópia e sem rastro. Estes endpoints são onde
// esse dado passa a morar.
type PCGProjectsHandler struct {
	db *pgxpool.Pool
}

func NewPCGProjectsHandler(db *pgxpool.Pool) *PCGProjectsHandler {
	return &PCGProjectsHandler{db: db}
}

type pcgEvent struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	At            time.Time `json:"at"`
	Subcontractor string    `json:"subcontractor"`
	Amount        *float64  `json:"amount"`
	LeadTimeValue *int      `json:"leadTimeValue"`
	LeadTimeUnit  string    `json:"leadTimeUnit"`
	Note          string    `json:"note"`
	// "by" no front: quem registrou, tirado da sessão.
	LoggedBy string `json:"by"`
	// Quando foi digitado — diferente de `at`, que é o dia do fato. A timeline
	// ordena pelos dois, então sem este campo a ordenação quebra.
	RecordedAt      time.Time       `json:"recordedAt"`
	URL             string          `json:"url"`
	Params          json.RawMessage `json:"params,omitempty"`
	PaymentSchedule json.RawMessage `json:"paymentSchedule,omitempty"`
}

type pcgTrade struct {
	TradeID         string          `json:"tradeId"`
	Answers         json.RawMessage `json:"answers"`
	ModuleOverrides json.RawMessage `json:"moduleOverrides"`
	ContractNumber  string          `json:"contractNumber,omitempty"`
	Events          []pcgEvent      `json:"events"`
}

type pcgProject struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Address   string     `json:"address"`
	Status    string     `json:"status"`
	Type      string     `json:"type"`
	CreatedAt time.Time  `json:"createdAt"`
	Trades    []pcgTrade `json:"trades"`
}

func tradeRowID(projectID, tradeID string) string {
	return projectID + "--" + tradeID
}

// GET /api/v1/pcg/projects
func (h *PCGProjectsHandler) List(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, address, status, type, created_at
		FROM pcg_projects ORDER BY created_at DESC`)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	projects := []pcgProject{}
	index := map[string]int{}
	for rows.Next() {
		var p pcgProject
		if err := rows.Scan(&p.ID, &p.Name, &p.Address, &p.Status, &p.Type, &p.CreatedAt); err != nil {
			return internalErr(c, err)
		}
		p.Trades = []pcgTrade{}
		index[p.ID] = len(projects)
		projects = append(projects, p)
	}
	rows.Close()
	if len(projects) == 0 {
		return c.JSON(fiber.Map{"data": projects})
	}

	tradeRows, err := h.db.Query(c.Context(), `
		SELECT project_id, trade_id, answers, module_overrides, COALESCE(contract_number,'')
		FROM pcg_project_trades ORDER BY created_at`)
	if err != nil {
		return internalErr(c, err)
	}
	defer tradeRows.Close()

	// project_id + trade_id → onde o trade está, para pendurar os eventos depois.
	type where struct{ project, trade int }
	place := map[string]where{}
	for tradeRows.Next() {
		var projectID string
		var t pcgTrade
		if err := tradeRows.Scan(&projectID, &t.TradeID, &t.Answers, &t.ModuleOverrides, &t.ContractNumber); err != nil {
			return internalErr(c, err)
		}
		i, ok := index[projectID]
		if !ok {
			continue
		}
		t.Events = []pcgEvent{}
		projects[i].Trades = append(projects[i].Trades, t)
		place[tradeRowID(projectID, t.TradeID)] = where{i, len(projects[i].Trades) - 1}
	}
	tradeRows.Close()

	eventRows, err := h.db.Query(c.Context(), `
		SELECT project_trade_id, id, type, at, COALESCE(subcontractor,''), amount,
		       lead_time_value, COALESCE(lead_time_unit,'weeks'), COALESCE(note,''),
		       COALESCE(logged_by,''), COALESCE(recorded_at, at), COALESCE(url,''),
		       params, payment_schedule
		FROM pcg_trade_events ORDER BY at`)
	if err != nil {
		return internalErr(c, err)
	}
	defer eventRows.Close()

	for eventRows.Next() {
		var key string
		var e pcgEvent
		if err := eventRows.Scan(&key, &e.ID, &e.Type, &e.At, &e.Subcontractor, &e.Amount,
			&e.LeadTimeValue, &e.LeadTimeUnit, &e.Note, &e.LoggedBy, &e.RecordedAt, &e.URL,
			&e.Params, &e.PaymentSchedule); err != nil {
			return internalErr(c, err)
		}
		at, ok := place[key]
		if !ok {
			continue
		}
		projects[at.project].Trades[at.trade].Events = append(projects[at.project].Trades[at.trade].Events, e)
	}

	return c.JSON(fiber.Map{"data": projects})
}

// POST /api/v1/pcg/projects — o id vem do cliente, como já vinha do localStorage.
func (h *PCGProjectsHandler) Create(c *fiber.Ctx) error {
	var p pcgProject
	if err := c.BodyParser(&p); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(p.ID) == "" {
		return badRequest(c, "id is required")
	}
	if p.CreatedAt.IsZero() {
		p.CreatedAt = time.Now()
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO pcg_projects (id, name, address, status, type, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (id) DO UPDATE SET
			name=EXCLUDED.name, address=EXCLUDED.address,
			status=EXCLUDED.status, type=EXCLUDED.type, updated_at=now()`,
		p.ID, p.Name, p.Address, defaultTo(p.Status, "active"), defaultTo(p.Type, "new_construction"), p.CreatedAt)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": p})
}

// PATCH /api/v1/pcg/projects/:id
func (h *PCGProjectsHandler) Update(c *fiber.Ctx) error {
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	id := c.Params("id")

	// Só os campos enviados mudam: COALESCE deixa o resto como está.
	_, err := h.db.Exec(c.Context(), `
		UPDATE pcg_projects SET
			name    = COALESCE($2, name),
			address = COALESCE($3, address),
			status  = COALESCE($4, status),
			type    = COALESCE($5, type),
			updated_at = now()
		WHERE id = $1`,
		id, strPtr(patch, "name"), strPtr(patch, "address"), strPtr(patch, "status"), strPtr(patch, "type"))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// DELETE /api/v1/pcg/projects/:id — trades e eventos vão junto por cascade.
func (h *PCGProjectsHandler) Delete(c *fiber.Ctx) error {
	if _, err := h.db.Exec(c.Context(), `DELETE FROM pcg_projects WHERE id=$1`, c.Params("id")); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": c.Params("id")}})
}

// PUT /api/v1/pcg/projects/:id/trades/:tradeId — cria ou atualiza o trade.
func (h *PCGProjectsHandler) UpsertTrade(c *fiber.Ctx) error {
	projectID, tradeID := c.Params("id"), c.Params("tradeId")
	var t pcgTrade
	if err := c.BodyParser(&t); err != nil {
		return badRequest(c, "invalid body")
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO pcg_project_trades (id, project_id, trade_id, answers, module_overrides, contract_number)
		VALUES ($1,$2,$3,COALESCE($4,'{}'::jsonb),COALESCE($5,'{}'::jsonb),$6)
		ON CONFLICT (project_id, trade_id) DO UPDATE SET
			answers          = COALESCE(EXCLUDED.answers, pcg_project_trades.answers),
			module_overrides = COALESCE(EXCLUDED.module_overrides, pcg_project_trades.module_overrides),
			contract_number  = COALESCE(EXCLUDED.contract_number, pcg_project_trades.contract_number),
			updated_at = now()`,
		tradeRowID(projectID, tradeID), projectID, tradeID,
		rawOrNil(t.Answers), rawOrNil(t.ModuleOverrides), nilIfEmpty(t.ContractNumber))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"projectId": projectID, "tradeId": tradeID}})
}

// DELETE /api/v1/pcg/projects/:id/trades/:tradeId
func (h *PCGProjectsHandler) DeleteTrade(c *fiber.Ctx) error {
	_, err := h.db.Exec(c.Context(), `DELETE FROM pcg_project_trades WHERE id=$1`,
		tradeRowID(c.Params("id"), c.Params("tradeId")))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": c.Params("tradeId")}})
}

// POST /api/v1/pcg/projects/:id/trades/:tradeId/events
func (h *PCGProjectsHandler) AddEvent(c *fiber.Ctx) error {
	projectID, tradeID := c.Params("id"), c.Params("tradeId")
	var e pcgEvent
	if err := c.BodyParser(&e); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(e.ID) == "" || strings.TrimSpace(e.Type) == "" {
		return badRequest(c, "id and type are required")
	}
	if e.At.IsZero() {
		e.At = time.Now()
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO pcg_trade_events
			(id, project_trade_id, type, at, subcontractor, amount,
			 lead_time_value, lead_time_unit, note, logged_by, params, payment_schedule,
			 recorded_at, url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		ON CONFLICT (project_trade_id, id) DO UPDATE SET
			type=EXCLUDED.type, at=EXCLUDED.at, subcontractor=EXCLUDED.subcontractor,
			amount=EXCLUDED.amount, lead_time_value=EXCLUDED.lead_time_value,
			lead_time_unit=EXCLUDED.lead_time_unit, note=EXCLUDED.note,
			params=EXCLUDED.params, payment_schedule=EXCLUDED.payment_schedule,
			recorded_at=EXCLUDED.recorded_at, url=EXCLUDED.url`,
		e.ID, tradeRowID(projectID, tradeID), e.Type, e.At, e.Subcontractor, e.Amount,
		e.LeadTimeValue, defaultTo(e.LeadTimeUnit, "weeks"), e.Note, e.LoggedBy,
		rawOrNil(e.Params), rawOrNil(e.PaymentSchedule), recordedOr(e), e.URL)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": e})
}

// PATCH /api/v1/pcg/projects/:id/trades/:tradeId/events/:eventId
func (h *PCGProjectsHandler) UpdateEvent(c *fiber.Ctx) error {
	var e pcgEvent
	if err := c.BodyParser(&e); err != nil {
		return badRequest(c, "invalid body")
	}
	var at any
	if !e.At.IsZero() {
		at = e.At
	}
	// O id do evento é sequencial por trade, não global: sem o project_trade_id
	// na cláusula, uma correção aqui editava o evento de outra obra.
	tradeRow := tradeRowID(c.Params("id"), c.Params("tradeId"))
	_, err := h.db.Exec(c.Context(), `
		UPDATE pcg_trade_events SET
			at               = COALESCE($2, at),
			subcontractor    = COALESCE($3, subcontractor),
			amount           = COALESCE($4, amount),
			lead_time_value  = COALESCE($5, lead_time_value),
			lead_time_unit   = COALESCE($6, lead_time_unit),
			note             = COALESCE($7, note),
			payment_schedule = COALESCE($8, payment_schedule)
		WHERE project_trade_id = $9 AND id = $1`,
		c.Params("eventId"), at, nilIfEmpty(e.Subcontractor), e.Amount,
		e.LeadTimeValue, nilIfEmpty(e.LeadTimeUnit), nilIfEmpty(e.Note), rawOrNil(e.PaymentSchedule), tradeRow)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": c.Params("eventId")}})
}

// DELETE /api/v1/pcg/projects/:id/trades/:tradeId/events/:eventId
func (h *PCGProjectsHandler) DeleteEvent(c *fiber.Ctx) error {
	if _, err := h.db.Exec(c.Context(),
		`DELETE FROM pcg_trade_events WHERE project_trade_id=$1 AND id=$2`,
		tradeRowID(c.Params("id"), c.Params("tradeId")), c.Params("eventId")); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": c.Params("eventId")}})
}

// ── helpers ─────────────────────────────────────────────────────────────────

func internalErr(c *fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
}

func badRequest(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msg, "code": "BAD_REQUEST"})
}

// Evento antigo pode chegar sem recordedAt; o dia do fato e o melhor valor.
func recordedOr(e pcgEvent) time.Time {
	if e.RecordedAt.IsZero() {
		return e.At
	}
	return e.RecordedAt
}

func defaultTo(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func nilIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

// JSONB não aceita string vazia: campo ausente entra como NULL e o COALESCE do
// SQL mantém o que já estava gravado.
func rawOrNil(raw json.RawMessage) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return string(raw)
}

func strPtr(patch map[string]any, key string) any {
	value, ok := patch[key]
	if !ok {
		return nil
	}
	text, ok := value.(string)
	if !ok {
		return nil
	}
	return text
}
