package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Catalog table definitions ─────────────────────────────────────────────────

type catalogDef struct {
	pgTable string   // actual postgres table name
	cols    []string // data columns (excluding id, created_at)
}

var catalogDefs = map[string]catalogDef{
	"workforce":      {pgTable: "catalog_forecast_workforce", cols: []string{"name"}},
	"fieldwire":      {pgTable: "catalog_forecast_fieldwire", cols: []string{"category", "document", "where_location", "notes"}},
	"machines":       {pgTable: "catalog_forecast_machines", cols: []string{"category", "subcategory", "equipment_category", "title"}},
	"contract-steps": {pgTable: "catalog_forecast_contract_steps", cols: []string{"step"}},
	"providers":      {pgTable: "catalog_forecast_machine_providers", cols: []string{"name"}},
}

// ─── Handler ───────────────────────────────────────────────────────────────────

type ForecastCatalogHandler struct {
	db *pgxpool.Pool
}

func NewForecastCatalogHandler(db *pgxpool.Pool) *ForecastCatalogHandler {
	return &ForecastCatalogHandler{db: db}
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
	q := fmt.Sprintf("SELECT %s FROM %s ORDER BY id ASC", strings.Join(allCols, ", "), def.pgTable)

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
	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"id": newID}})
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
	return c.SendStatus(204)
}
