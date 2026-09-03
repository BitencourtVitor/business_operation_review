package handler

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// Etiqueta de documento, e a lista do que a obra espera receber.
//
// A pasta era o documento: a taxonomia criava uma linha vazia chamada "3rd
// Floor Trusses" e o PDF era anexado dentro dela. Isso confundia três coisas.
// Aqui elas se separam: `atlas_jobsite_category` diz o que a obra precisa ter,
// `atlas_document_tag` diz como cada documento se classifica, e o nome do
// documento é do arquivo que alguém anexou.

// writeTags troca as etiquetas de um documento pelas que vieram.
//
// Substitui em vez de acrescentar porque a tela manda o conjunto inteiro:
// desmarcar uma etiqueta é mandar a lista sem ela, e não existe pedido de
// "remova esta".
func (h *AtlasHandler) writeTags(ctx context.Context, docID string, tags []atlasDocTag) error {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM atlas_document_tag WHERE document_id = $1`, docID); err != nil {
		return err
	}
	for _, t := range tags {
		if t.CategoryID == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO atlas_document_tag (document_id, category_id, subcategory)
			VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
			docID, t.CategoryID, strings.TrimSpace(t.Subcategory)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// PUT /atlas/documents/:id/tags
func (h *AtlasHandler) SetDocumentTags(c *fiber.Ctx) error {
	docID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, docID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		Tags []atlasDocTag `json:"tags"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if err := h.writeTags(c.Context(), docID, in.Tags); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": docID, "tags": len(in.Tags)}})
}

// jobsiteCategory é uma categoria que esta obra espera ter, e o quanto ela já
// foi coberta por documento de verdade.
type jobsiteCategory struct {
	CategoryID  int64  `json:"categoryId"`
	Name        string `json:"name"`
	Subcategory string `json:"subcategory"`
	Axis        string `json:"axis"`
	Position    int    `json:"position"`
	// Quantos documentos da obra carregam esta etiqueta. Zero é a lacuna que a
	// sala precisa mostrar: é o que o Fieldwire nunca disse.
	Documents int `json:"documents"`
}

// GET /atlas/jobsites/:id/categories
func (h *AtlasHandler) ListJobsiteCategories(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT j.category_id, c.name, j.subcategory, c.axis, c.position,
		       COALESCE((
		           SELECT count(*)
		           FROM atlas_document_tag t
		           JOIN atlas_document d ON d.id = t.document_id
		           WHERE t.category_id = j.category_id
		             AND t.subcategory = j.subcategory
		             AND d.jobsite_id = j.jobsite_id
		             AND d.archived_at IS NULL
		       ), 0)
		FROM atlas_jobsite_category j
		JOIN atlas_doc_category c ON c.id = j.category_id
		WHERE j.jobsite_id = $1 AND c.archived_at IS NULL
		ORDER BY c.position, c.name, j.subcategory`, id)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []jobsiteCategory{}
	for rows.Next() {
		var j jobsiteCategory
		if err := rows.Scan(&j.CategoryID, &j.Name, &j.Subcategory, &j.Axis,
			&j.Position, &j.Documents); err != nil {
			return internalErr(c, err)
		}
		out = append(out, j)
	}
	return c.JSON(fiber.Map{"data": out})
}

// DELETE /atlas/jobsites/:id/slots/:categoryId — a obra deixa de esperar esta
// categoria. Os documentos etiquetados com ela continuam onde estão: tirar a
// expectativa não é tirar o arquivo.
func (h *AtlasHandler) RemoveCategorySlot(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	if _, err := h.db.Exec(c.Context(),
		`DELETE FROM atlas_jobsite_category WHERE jobsite_id = $1 AND category_id = $2`,
		id, c.Params("categoryId")); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"ok": true}})
}
