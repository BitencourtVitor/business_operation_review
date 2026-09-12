package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// GET /atlas/versions/:id/annotations
//
// As marcações de todas as folhas de uma versão, de uma vez.
//
// Existe para o download offline. Sem isto, guardar as marcações de um set de
// 97 folhas custaria 97 idas ao servidor, e o vínculo automático mapeia a obra
// inteira: é justamente o caso em que há marcação em quase toda folha.
//
// O filtro de visibilidade é o mesmo de uma folha só: o traço de cada um é
// dele, o compartilhado é de todos.
func (h *AtlasHandler) VersionAnnotations(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	userID, _ := actor(c)
	rows, err := h.db.Query(c.Context(), `
		SELECT a.id, a.sheet_id, a.author_id, a.tool, a.color, a.width,
		       a.opacity, a.shared, a.geometry, a.created_at
		FROM atlas_annotation a
		JOIN atlas_sheet s ON s.id = a.sheet_id
		WHERE s.version_id = $1 AND s.superseded_at IS NULL
		  AND a.deleted_at IS NULL AND (a.shared OR a.author_id = $2)
		ORDER BY s.page_index, a.created_at`, versionID, userID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasAnnotation{}
	for rows.Next() {
		var a atlasAnnotation
		var created time.Time
		if err := rows.Scan(&a.ID, &a.SheetID, &a.AuthorID, &a.Tool, &a.Color,
			&a.Width, &a.Opacity, &a.Shared, &a.Geometry, &created); err != nil {
			return internalErr(c, err)
		}
		a.CreatedAt = created.Format(time.RFC3339)
		out = append(out, a)
	}
	return c.JSON(fiber.Map{"data": out})
}
