package handler

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// Quem não vê o quê.
//
// O padrão do Atlas é ver: quem tem a chave `atlas` enxerga a lista inteira, e
// a regra é a exceção. Estes endpoints leem e escrevem essas exceções.
//
// A tela de hoje só usa o escopo `jobsite` com efeito `deny`, que é a lista de
// pessoas bloqueadas num projeto. Os escopos `kind` e `client` já existem na
// tabela para quando alguém precisar ver só prédio, só casa ou só um cliente.

type atlasBlockedUser struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Email  string `json:"email"`
}

// GET /atlas/jobsites/:id/blocked
func (h *AtlasHandler) ListBlocked(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT r.user_id, COALESCE(u.name, ''), COALESCE(u.email, '')
		FROM atlas_visibility_rule r
		LEFT JOIN users u ON u.id = r.user_id
		WHERE r.effect = 'deny' AND r.scope = 'jobsite' AND r.value = $1
		ORDER BY u.name`, c.Params("id"))
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasBlockedUser{}
	for rows.Next() {
		var b atlasBlockedUser
		if err := rows.Scan(&b.UserID, &b.Name, &b.Email); err != nil {
			return internalErr(c, err)
		}
		out = append(out, b)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /atlas/jobsites/:id/blocked
//
// A lista chega inteira e substitui a anterior. Mandar o conjunto todo evita a
// diferença entre o que a tela mostra e o que o banco guarda, que é o que
// acontece quando duas pessoas editam o mesmo projeto ao mesmo tempo por
// acréscimo e remoção separados.
func (h *AtlasHandler) SetBlocked(c *fiber.Ctx) error {
	var body struct {
		UserIDs []string `json:"userIds"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "invalid body")
	}
	jobsiteID := c.Params("id")
	actor, _ := c.Locals("userID").(string)

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalErr(c, err)
	}
	defer tx.Rollback(c.Context())

	if _, err := tx.Exec(c.Context(), `
		DELETE FROM atlas_visibility_rule
		WHERE effect = 'deny' AND scope = 'jobsite' AND value = $1`, jobsiteID); err != nil {
		return internalErr(c, err)
	}
	for _, id := range body.UserIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, err := tx.Exec(c.Context(), `
			INSERT INTO atlas_visibility_rule (user_id, effect, scope, value, created_by)
			VALUES ($1, 'deny', 'jobsite', $2, $3)
			ON CONFLICT (user_id, effect, scope, value) DO NOTHING`,
			id, jobsiteID, actor); err != nil {
			return internalErr(c, err)
		}
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"blocked": len(body.UserIDs)}})
}

// GET /atlas/blockable-users
//
// Quem pode ser ocultado de um projeto: só quem entra no Atlas pela chave de
// permissão. Cargo privilegiado fica de fora de propósito, porque a listagem
// entrega tudo a dev, owner, admin e manager antes de olhar regra: oferecê-los
// aqui deixaria a tela prometer um bloqueio que não acontece.
func (h *AtlasHandler) ListBlockableUsers(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT u.id, COALESCE(u.name, ''), COALESCE(u.email, '')
		FROM users u
		JOIN user_permissions p ON p.user_id = u.id
		WHERE u.role NOT IN ('dev', 'owner', 'admin', 'manager')
		  AND jsonb_typeof(p.permissions::jsonb) = 'object'
		  AND COALESCE(p.permissions::jsonb ->> 'atlas', '') <> ''
		ORDER BY u.name`)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasBlockedUser{}
	for rows.Next() {
		var u atlasBlockedUser
		if err := rows.Scan(&u.UserID, &u.Name, &u.Email); err != nil {
			return internalErr(c, err)
		}
		out = append(out, u)
	}
	return c.JSON(fiber.Map{"data": out})
}
