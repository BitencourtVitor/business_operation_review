package handler

import (
	"net/url"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// O contato do sub como o PCG o imprime. A roster do Subcontractor Docs é a
// fonte; isto cobre a lacuna dela sem escrever de volta nela — ver a migração
// 000112.
type pcgSubcontractorContact struct {
	Subcontractor string `json:"subcontractor"`
	OwnerName     string `json:"owner_name"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
}

// GET /api/v1/pcg/subcontractor-contacts
func (h *PCGProjectsHandler) ListSubcontractorContacts(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT subcontractor, owner_name, email, phone
		FROM pcg_subcontractor_contacts ORDER BY subcontractor`)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []pcgSubcontractorContact{}
	for rows.Next() {
		var contact pcgSubcontractorContact
		if err := rows.Scan(&contact.Subcontractor, &contact.OwnerName, &contact.Email, &contact.Phone); err != nil {
			return internalErr(c, err)
		}
		out = append(out, contact)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /api/v1/pcg/subcontractor-contacts/:name
//
// Três campos em branco apagam a linha: sem nada escrito, o contrato volta a ler
// a roster inteira, que é o padrão.
func (h *PCGProjectsHandler) UpsertSubcontractorContact(c *fiber.Ctx) error {
	// O Fiber roda com UnescapePath desligado, então o parâmetro chega como veio
	// na URL: "W%20Silva%20Construction%20Inc". Gravado assim, o contato existe
	// no banco sob um nome que a tela nunca encontra — o evento guarda o nome do
	// sub como texto puro. Quem escreveu o nome via a tela continuar vazia e
	// concluía que o salvamento não funcionou.
	name := strings.TrimSpace(c.Params("name"))
	if decoded, err := url.PathUnescape(name); err == nil {
		name = strings.TrimSpace(decoded)
	}
	if name == "" {
		return badRequest(c, "subcontractor is required")
	}
	var body pcgSubcontractorContact
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "invalid body")
	}
	owner := strings.TrimSpace(body.OwnerName)
	email := strings.TrimSpace(body.Email)
	phone := strings.TrimSpace(body.Phone)

	if owner == "" && email == "" && phone == "" {
		if _, err := h.db.Exec(c.Context(),
			`DELETE FROM pcg_subcontractor_contacts WHERE subcontractor=$1`, name); err != nil {
			return internalErr(c, err)
		}
		return c.JSON(fiber.Map{"data": fiber.Map{"subcontractor": name, "cleared": true}})
	}

	if _, err := h.db.Exec(c.Context(), `
		INSERT INTO pcg_subcontractor_contacts (subcontractor, owner_name, email, phone)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (subcontractor) DO UPDATE SET
			owner_name = EXCLUDED.owner_name,
			email      = EXCLUDED.email,
			phone      = EXCLUDED.phone,
			updated_at = now()`, name, owner, email, phone); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"subcontractor": name}})
}
