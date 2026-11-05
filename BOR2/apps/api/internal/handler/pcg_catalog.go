package handler

import (
	"encoding/json"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// PCG-3: o catálogo inteiro é um documento só, no formato que o front já usava no
// localStorage. Os handlers só guardam e devolvem; as normalizações continuam no front.

type pcgCatalogBody struct {
	Catalog json.RawMessage `json:"catalog"`
}

func validCatalog(raw json.RawMessage) bool {
	var probe map[string]any
	return len(raw) > 0 && json.Unmarshal(raw, &probe) == nil
}

// GET /api/v1/pcg/catalog  ->  { data: { catalog: {...} | null, updatedAt } }
func (h *PCGProjectsHandler) GetCatalog(c *fiber.Ctx) error {
	var data json.RawMessage
	var updatedAt string
	err := h.db.QueryRow(c.Context(),
		`SELECT data, updated_at::text FROM pcg_catalog WHERE id = 'main'`).Scan(&data, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c.JSON(fiber.Map{"data": fiber.Map{"catalog": nil, "updatedAt": nil}})
	}
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"catalog": data, "updatedAt": updatedAt}})
}

// PUT /api/v1/pcg/catalog  { catalog }
func (h *PCGProjectsHandler) SaveCatalog(c *fiber.Ctx) error {
	var body pcgCatalogBody
	if err := c.BodyParser(&body); err != nil || !validCatalog(body.Catalog) {
		return badRequest(c, "catalog must be a JSON object")
	}
	_, name := actor(c)
	// ponytail: a última gravação vale; dois editores ao mesmo tempo se sobrescrevem.
	// Se isso começar a acontecer, comparar updated_at antes de gravar.
	if _, err := h.db.Exec(c.Context(), `
		INSERT INTO pcg_catalog (id, data, updated_by) VALUES ('main', $1, $2)
		ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
		body.Catalog, name); err != nil {
		return internalErr(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// POST /api/v1/pcg/catalog/imports  { catalog }  ->  { data: { adopted } }
//
// O navegador que ainda tem o catálogo no localStorage manda uma cópia. Ela sempre fica
// guardada; se ainda não existe catálogo oficial, vira o oficial.
func (h *PCGProjectsHandler) ImportCatalog(c *fiber.Ctx) error {
	var body pcgCatalogBody
	if err := c.BodyParser(&body); err != nil || !validCatalog(body.Catalog) {
		return badRequest(c, "catalog must be a JSON object")
	}
	_, name := actor(c)
	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalErr(c, err)
	}
	defer tx.Rollback(c.Context())

	tag, err := tx.Exec(c.Context(), `
		INSERT INTO pcg_catalog (id, data, updated_by) VALUES ('main', $1, $2)
		ON CONFLICT (id) DO NOTHING`, body.Catalog, name)
	if err != nil {
		return internalErr(c, err)
	}
	adopted := tag.RowsAffected() == 1
	if _, err := tx.Exec(c.Context(),
		`INSERT INTO pcg_catalog_imports (data, imported_by, adopted) VALUES ($1, $2, $3)`,
		body.Catalog, name, adopted); err != nil {
		return internalErr(c, err)
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"adopted": adopted}})
}
