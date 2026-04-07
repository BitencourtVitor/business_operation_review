package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Catalog table definitions ─────────────────────────────────────────────────

type catalogDef struct {
	pgTable string   // actual postgres table name
	cols    []string // data columns (excluding id, created_at)
	sortCol string   // ORDER BY column, defaults to "id"
}

var catalogDefs = map[string]catalogDef{
	"workforce":      {pgTable: "catalog_forecast_workforce", cols: []string{"name"}},
	"fieldwire":      {pgTable: "catalog_forecast_fieldwire", cols: []string{"client", "type", "document", "where_location", "notes"}},
	"machines":       {pgTable: "catalog_forecast_machines", cols: []string{"category", "subcategory", "equipment_category", "title"}},
	"contract-steps": {pgTable: "catalog_forecast_contract_steps", cols: []string{"seq", "step"}, sortCol: "seq"},
	"providers":      {pgTable: "catalog_forecast_machine_providers", cols: []string{"name"}},
}

// ─── Handler ───────────────────────────────────────────────────────────────────

type ForecastCatalogHandler struct {
	db    *pgxpool.Pool
	audit *service.AuditService
}

func NewForecastCatalogHandler(db *pgxpool.Pool, audit *service.AuditService) *ForecastCatalogHandler {
	return &ForecastCatalogHandler{db: db, audit: audit}
}

func (h *ForecastCatalogHandler) resolve(c *fiber.Ctx) (catalogDef, bool) {
	key := c.Params("table")
	def, ok := catalogDefs[key]
	return def, ok
}

// GET /api/v1/forecast/catalog/:table
func (h *ForecastCatalogHandler) List(c *fiber.Ctx) error {
	def, ok := h.resolve(c)
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "unknown catalog table"})
	}

	allCols := append([]string{"id"}, def.cols...)
	allCols = append(allCols, "created_at")
	sortCol := "id"
	if def.sortCol != "" {
		sortCol = def.sortCol
	}
	q := fmt.Sprintf("SELECT %s FROM %s ORDER BY %s ASC", strings.Join(allCols, ", "), def.pgTable, sortCol)

	rows, err := h.db.Query(c.Context(), q)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var result []map[string]any
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		row := make(map[string]any)
		for i, col := range allCols {
			row[col] = vals[i]
		}
		result = append(result, row)
	}
	if result == nil {
		result = []map[string]any{}
	}
	return c.JSON(fiber.Map{"data": result})
}

// POST /api/v1/forecast/catalog/:table
func (h *ForecastCatalogHandler) Add(c *fiber.Ctx) error {
	def, ok := h.resolve(c)
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "unknown catalog table"})
	}

	body := make(map[string]any)
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	// Build column list and placeholders (id via MAX+1, then data cols, then created_at)
	dataCols := strings.Join(def.cols, ", ")
	placeholders := make([]string, len(def.cols))
	args := make([]any, len(def.cols)+1) // +1 for created_at
	for i, col := range def.cols {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		v, _ := body[col]
		args[i] = v
	}
	args[len(def.cols)] = time.Now().UTC()
	createdAtPlaceholder := fmt.Sprintf("$%d", len(def.cols)+1)

	q := fmt.Sprintf(`
		INSERT INTO %s (id, %s, created_at)
		SELECT COALESCE(MAX(id), 0) + 1, %s, %s FROM %s
		RETURNING id`,
		def.pgTable,
		dataCols,
		strings.Join(placeholders, ", "),
		createdAtPlaceholder,
		def.pgTable,
	)

	var newID int64
	if err := h.db.QueryRow(c.Context(), q, args...).Scan(&newID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "forecast_catalog", fmt.Sprintf("%d", newID))
	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"id": newID}})
}

// PATCH /api/v1/forecast/catalog/contract-steps/reorder
func (h *ForecastCatalogHandler) Reorder(c *fiber.Ctx) error {
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if len(body.IDs) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "ids required"})
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(c.Context())

	for i, id := range body.IDs {
		if _, err := tx.Exec(c.Context(),
			"UPDATE catalog_forecast_contract_steps SET seq = $1 WHERE id = $2",
			i+1, id,
		); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "reorder", "forecast_catalog", "")
	return c.SendStatus(204)
}

// PATCH /api/v1/forecast/catalog/:table/:id
func (h *ForecastCatalogHandler) Update(c *fiber.Ctx) error {
	def, ok := h.resolve(c)
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "unknown catalog table"})
	}

	id := c.Params("id")
	body := make(map[string]any)
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	setClauses := make([]string, 0, len(def.cols))
	args := make([]any, 0, len(def.cols)+1)
	for i, col := range def.cols {
		v, _ := body[col]
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, i+1))
		args = append(args, v)
	}
	args = append(args, id)

	q := fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d",
		def.pgTable,
		strings.Join(setClauses, ", "),
		len(args),
	)

	tag, err := h.db.Exec(c.Context(), q, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "forecast_catalog", id)
	return c.SendStatus(204)
}

// DELETE /api/v1/forecast/catalog/:table/:id
func (h *ForecastCatalogHandler) Delete(c *fiber.Ctx) error {
	def, ok := h.resolve(c)
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "unknown catalog table"})
	}

	id := c.Params("id")
	q := fmt.Sprintf("DELETE FROM %s WHERE id = $1", def.pgTable)
	tag, err := h.db.Exec(c.Context(), q, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "forecast_catalog", id)
	return c.SendStatus(204)
}
