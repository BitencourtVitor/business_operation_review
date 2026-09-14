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

// DELETE /atlas/media/:id
//
// Tira uma foto ou um vídeo de um ponto. A peça é de quem escreveu a metade em
// que ela está: a do problema, de quem levantou o ponto; a da solução, de quem
// resolveu. Quem subiu a peça também pode tirá-la.
//
// Ponto resolvido que nasceu com imagem precisa continuar com prova do conserto
// (a trava da migração 000156 vale para fechar, e aqui vale para não desfazer a
// prova depois de fechado): a última peça do depois não sai.
func (h *AtlasHandler) DeleteMedia(c *fiber.Ctx) error {
	mediaID := c.Params("id")
	var jobsiteID, eventID, fase, r2Key, subiu, criou, resolveu, status string
	if err := h.db.QueryRow(c.Context(), `
		SELECT m.jobsite_id, COALESCE(m.event_id,''), m.phase, m.r2_key, m.uploaded_by,
		       COALESCE(e.created_by,''), COALESCE(e.resolved_by,''), COALESCE(e.status,'')
		  FROM atlas_media m
		  LEFT JOIN atlas_event e ON e.id = m.event_id
		 WHERE m.id = $1`, mediaID).
		Scan(&jobsiteID, &eventID, &fase, &r2Key, &subiu, &criou, &resolveu, &status); err != nil {
		return atlasNotFound(c, "mídia")
	}
	if eventID == "" {
		return badRequest(c, "only media attached to a point can be removed here")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	userID, _ := actor(c)
	dono := criou
	if fase == "after" {
		dono = resolveu
	}
	if userID != dono && userID != subiu {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "only who wrote this part of the point can remove its media", "code": "FORBIDDEN",
		})
	}

	if fase == "after" && status == "resolved" {
		var antes, depois int
		_ = h.db.QueryRow(c.Context(), `
			SELECT count(*) FILTER (WHERE phase = 'before'), count(*) FILTER (WHERE phase = 'after')
			  FROM atlas_media
			 WHERE event_id = $1 AND status = 'uploaded'
			   AND (content_type LIKE 'image/%' OR content_type LIKE 'video/%')`, eventID).Scan(&antes, &depois)
		if antes > 0 && depois <= 1 {
			return badRequest(c, "a resolved point needs at least one photo or video of the fix")
		}
	}

	if h.r2.Configured() && r2Key != "" {
		_ = h.r2.Delete(c.Context(), r2Key)
	}
	if _, err := h.db.Exec(c.Context(), `DELETE FROM atlas_media WHERE id = $1`, mediaID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": mediaID}})
}
