package handler

import (
	"github.com/gofiber/fiber/v2"
)

// Apagar o note apaga a task.
//
// Note e task são a mesma linha de `atlas_event`, vista de dois lugares: na
// prancha ela é um pino num ponto do desenho, em Tasks é uma linha da lista.
//
// Até aqui a borracha do leitor só soltava o pino, mandando `detach`, e o
// evento continuava em Tasks de propósito, para não perder o que já tinha sido
// respondido nele. Na prática isso deixava órfã uma task que ninguém mais
// conseguia localizar: quem apagou a marca do desenho apagou justamente a única
// pista de onde ela ficava. Quem apaga o note quer que aquilo deixe de existir,
// e é isso que passa a acontecer.
//
// As respostas e a mídia saem junto, por cascata declarada no esquema. Os
// objetos no bucket não saem por cascata nenhuma, então eles são removidos aqui
// antes da linha ir embora.

// DELETE /atlas/events/:id
func (h *AtlasHandler) DeleteEvent(c *fiber.Ctx) error {
	eventID := c.Params("id")

	var jobsiteID, authorID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id, COALESCE(created_by,'') FROM atlas_event WHERE id = $1`,
		eventID).Scan(&jobsiteID, &authorID); err != nil {
		return atlasNotFound(c, "evento")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	// Note dos outros só sai pela mão de quem gerencia a obra, a mesma regra do
	// traço de caneta: anotação alheia não é de quem passou por ali.
	userID, _ := actor(c)
	if authorID != userID {
		if err := h.require(c, jobsiteID, "manage"); err != nil {
			return atlasForbidden(c)
		}
	}

	// O bucket primeiro, e sem interromper por falha: um objeto que resiste vira
	// lixo pago no R2, e travar a exclusão por causa dele deixaria de pé
	// justamente o registro que a pessoa mandou apagar.
	if h.r2.Configured() {
		rows, err := h.db.Query(c.Context(),
			`SELECT r2_key FROM atlas_media WHERE event_id = $1 AND r2_key <> ''`, eventID)
		if err == nil {
			keys := []string{}
			for rows.Next() {
				var key string
				if rows.Scan(&key) == nil {
					keys = append(keys, key)
				}
			}
			rows.Close()
			for _, key := range keys {
				_ = h.r2.Delete(c.Context(), key)
			}
		}
	}

	if _, err := h.db.Exec(c.Context(), `DELETE FROM atlas_event WHERE id = $1`, eventID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": eventID}})
}
