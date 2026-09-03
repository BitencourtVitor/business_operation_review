package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// A taxonomia de documento e as vagas que ela cria na obra.
//
// A pasta de documento nascia do nome do arquivo que alguém subiu — daí o
// Fieldwire ter "Riverview 50 1st Panels Walls 013026" ao lado de "Panels
// Fourth Floor" e de "4th floor wall panel layout": três grafias para a mesma
// coisa, porque ninguém declarou que Wall Panels varia por andar.
//
// Aqui a categoria declara o eixo, e a subcategoria deixa de ser digitada: sai
// do cadastro da obra — quantos andares ela tem, quais letras de unidade usa.

type docCategory struct {
	ID        int64  `json:"id"`
	Client    string `json:"client"`
	BuildType string `json:"buildType"`
	Name      string `json:"name"`
	// none | floor | unit
	Axis     string `json:"axis"`
	Position int    `json:"position"`
	// true: toda obra do tipo recebe a pasta ao nascer.
	// false: fica de sugestão, para ser acrescentada obra a obra.
	DefaultSlot bool `json:"defaultSlot"`
	// Só na criação: acrescenta a pasta já nesta obra.
	JobsiteID string `json:"jobsiteId"`
	// Os valores de eixo que já existem em obra — os andares e as letras que
	// viraram pasta de verdade. Vazio quando a categoria não tem eixo, ou
	// quando nenhuma obra a usou ainda.
	Subcategories []string `json:"subcategories"`
	// Os valores que a categoria admite no eixo — as opções, e não o que já
	// virou pasta. É o que a tela precisa mostrar antes da primeira obra.
	AxisValues []string `json:"axisValues"`
	// Onde o nome de cada folha está impresso no PDF desta categoria. Mora aqui
	// porque o layout é de quem emite o documento e se repete a cada envio: o
	// próximo nível do mesmo relatório sobe nomeado sem remarcar nada.
	Naming json.RawMessage `json:"naming,omitempty"`
}

// buildTypeOf normaliza o vocabulário do Forecast para o da taxonomia: lote e
// casa são a mesma obra, e por isso a mesma lista de documentos.
func buildTypeOf(kind string) string {
	if strings.EqualFold(kind, "lot") {
		return "house"
	}
	return kind
}

// ordinal transforma 1 em "1st", 2 em "2nd" — é como o andar é chamado no
// canteiro e nas pastas que já existem.
func ordinal(n int) string {
	suffix := "th"
	switch {
	case n%100 >= 11 && n%100 <= 13:
	case n%10 == 1:
		suffix = "st"
	case n%10 == 2:
		suffix = "nd"
	case n%10 == 3:
		suffix = "rd"
	}
	return strconv.Itoa(n) + suffix
}

// slotName monta o nome da pasta como ela aparece na obra: "3rd Floor Trusses",
// "C Unit Cabinet Layout", ou só "Architectural Plan" quando não há eixo.
func slotName(category, axis, value string) string {
	switch axis {
	case "floor":
		return value + " Floor " + category
	case "unit":
		return value + " Unit " + category
	default:
		return category
	}
}

// GET /atlas/doc-categories
func (h *AtlasHandler) ListDocCategories(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT c.id, c.client, c.build_type, c.name, c.axis, c.position, c.default_slot,
		       COALESCE(sub.values, '{}'), c.axis_values, c.naming
		FROM atlas_doc_category c
		LEFT JOIN LATERAL (
			-- As subcategorias que existem de fato, e não as que caberiam: é o
			-- que responde "quais andares esta categoria já cobre".
			SELECT array_agg(DISTINCT d.subcategory ORDER BY d.subcategory) AS values
			FROM atlas_document d
			WHERE d.category_id = c.id AND d.subcategory <> '' AND d.archived_at IS NULL
		) sub ON true
		WHERE c.archived_at IS NULL
		ORDER BY c.position, c.name`)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []docCategory{}
	for rows.Next() {
		var d docCategory
		if err := rows.Scan(&d.ID, &d.Client, &d.BuildType, &d.Name, &d.Axis, &d.Position,
			&d.DefaultSlot, &d.Subcategories, &d.AxisValues, &d.Naming); err != nil {
			return internalErr(c, err)
		}
		out = append(out, d)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/doc-categories
func (h *AtlasHandler) CreateDocCategory(c *fiber.Ctx) error {
	role, _ := c.Locals("userRole").(string)
	if !atlasFullAccess[role] {
		return atlasForbidden(c)
	}
	var in docCategory
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.Name) == "" {
		return badRequest(c, "name is required")
	}
	if in.Axis == "" {
		in.Axis = "none"
	}
	if in.Axis != "none" && in.Axis != "floor" && in.Axis != "unit" {
		return badRequest(c, "axis must be none, floor or unit")
	}

	var id int64
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO atlas_doc_category (client, build_type, name, axis, position, default_slot)
		VALUES ($1,$2,$3,$4,
			COALESCE(NULLIF($5,0), (SELECT COALESCE(MAX(position),0)+10 FROM atlas_doc_category)),
			$6)
		ON CONFLICT (client, build_type, name) DO UPDATE
			SET axis = EXCLUDED.axis, archived_at = NULL, updated_at = now()
		RETURNING id`,
		in.Client, in.BuildType, strings.TrimSpace(in.Name), in.Axis, in.Position,
		in.DefaultSlot).Scan(&id)
	if err != nil {
		return internalErr(c, err)
	}

	// Criada de dentro de uma obra: a pasta aparece ali na hora. A categoria
	// fica guardada, e as outras obras a recebem quando alguém escolher — o que
	// um prédio precisa não é o que os outros precisam.
	slots := 0
	if in.JobsiteID != "" {
		userID, _ := actor(c)
		slots, err = h.createSlotsForCategory(c.Context(), in.JobsiteID, id, userID)
		if err != nil {
			return internalErr(c, err)
		}
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id, "slots": slots}})
}

// PATCH /atlas/doc-categories/:id
//
// Renomear a categoria não renomeia as pastas que ela já criou: o nome delas
// ficou gravado na obra, junto com o documento que alguém anexou. Mudar isso
// retroativamente reescreveria o passado de obra em andamento.
func (h *AtlasHandler) UpdateDocCategory(c *fiber.Ctx) error {
	role, _ := c.Locals("userRole").(string)
	if !atlasFullAccess[role] {
		return atlasForbidden(c)
	}
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return badRequest(c, "invalid id")
	}
	var in docCategory
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.Name) == "" {
		return badRequest(c, "name is required")
	}
	if in.Axis != "none" && in.Axis != "floor" && in.Axis != "unit" {
		return badRequest(c, "axis must be none, floor or unit")
	}

	// axisValues só é tocado quando vem no corpo: um PATCH que só renomeia a
	// categoria não pode apagar as subcategorias dela por omissão.
	var values *[]string
	if in.AxisValues != nil {
		clean := []string{}
		for _, v := range in.AxisValues {
			if v = strings.TrimSpace(v); v != "" {
				clean = append(clean, v)
			}
		}
		values = &clean
	}

	// O gabarito segue a mesma regra das subcategorias: só é tocado quando vem no
	// corpo, para um PATCH de renomear não apagar onde o nome da folha é lido.
	var naming *string
	if len(in.Naming) > 0 {
		text := string(in.Naming)
		naming = &text
	}

	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_doc_category SET
			name = $2, build_type = $3, axis = $4, default_slot = $5,
			axis_values = COALESCE($6, axis_values),
			naming = COALESCE($7::jsonb, naming),
			updated_at = now()
		WHERE id = $1`,
		id, strings.TrimSpace(in.Name), in.BuildType, in.Axis, in.DefaultSlot, values,
		naming); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// DELETE /atlas/doc-categories/:id
//
// Arquiva em vez de apagar: a categoria pode já ter virado pasta com documento
// dentro em obra antiga, e sumir com a linha deixaria aquela pasta órfã de
// significado.
func (h *AtlasHandler) DeleteDocCategory(c *fiber.Ctx) error {
	role, _ := c.Locals("userRole").(string)
	if !atlasFullAccess[role] {
		return atlasForbidden(c)
	}
	if _, err := h.db.Exec(c.Context(),
		`UPDATE atlas_doc_category SET archived_at = now(), updated_at = now() WHERE id = $1`,
		c.Params("id")); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"ok": true}})
}

// seedJobsiteSlots cria as vagas de documento da obra a partir da taxonomia.
//
// Acrescenta o que falta e nunca remove: rodar de novo depois de mudar o número
// de andares é o caso normal — o prédio ganhou um andar no projeto, e as vagas
// daquele andar passam a existir sem tocar no que já foi anexado.
func (h *AtlasHandler) seedJobsiteSlots(ctx context.Context, jobsiteID, userID string) (int, error) {
	var client, kind string
	var floors int
	var units []string
	err := h.db.QueryRow(ctx, `
		SELECT COALESCE(client,''), COALESCE(kind,''), COALESCE(floors,0), COALESCE(unit_labels,'{}')
		FROM atlas_jobsite WHERE id = $1`, jobsiteID).Scan(&client, &kind, &floors, &units)
	if err != nil {
		return 0, fmt.Errorf("jobsite: %w", err)
	}

	rows, err := h.db.Query(ctx, `
		SELECT id, name, axis FROM atlas_doc_category
		WHERE archived_at IS NULL AND default_slot
		  AND (client = '' OR lower(client) = lower($1))
		  AND (build_type = '' OR lower(build_type) = lower($2))
		ORDER BY position, name`, client, buildTypeOf(kind))
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type cat struct {
		id   int64
		name string
		axis string
	}
	cats := []cat{}
	for rows.Next() {
		var ct cat
		if err := rows.Scan(&ct.id, &ct.name, &ct.axis); err != nil {
			return 0, err
		}
		cats = append(cats, ct)
	}
	rows.Close()

	created := 0
	for _, ct := range cats {
		values := []string{""}
		switch ct.axis {
		case "floor":
			values = nil
			for i := 1; i <= floors; i++ {
				values = append(values, ordinal(i))
			}
		case "unit":
			values = nil
			for _, u := range units {
				if u = strings.TrimSpace(u); u != "" {
					values = append(values, u)
				}
			}
		}

		for _, v := range values {
			name := slotName(ct.name, ct.axis, v)
			// O índice único de (obra, categoria, subcategoria) é quem garante
			// que rodar de novo não duplica pasta.
			tag, err := h.db.Exec(ctx, `
				INSERT INTO atlas_document
					(id, jobsite_id, name, category, category_id, subcategory, created_by)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT DO NOTHING`,
				uuid.NewString(), jobsiteID, name, ct.name, ct.id, v, userID)
			if err != nil {
				return created, err
			}
			created += int(tag.RowsAffected())
		}
	}
	return created, nil
}

// createSlotsForCategory acrescenta a uma obra as vagas de uma categoria só.
//
// É o caminho de quem está dentro da obra: criou a categoria ali, ou escolheu
// uma que já existia como sugestão. Nos dois casos só aquela obra recebe a
// pasta — a categoria vira opção para as demais, nunca imposição.
func (h *AtlasHandler) createSlotsForCategory(ctx context.Context, jobsiteID string, categoryID int64, userID string) (int, error) {
	var floors int
	var units []string
	if err := h.db.QueryRow(ctx, `
		SELECT COALESCE(floors,0), COALESCE(unit_labels,'{}')
		FROM atlas_jobsite WHERE id = $1`, jobsiteID).Scan(&floors, &units); err != nil {
		return 0, fmt.Errorf("jobsite: %w", err)
	}

	var name, axis string
	if err := h.db.QueryRow(ctx,
		`SELECT name, axis FROM atlas_doc_category WHERE id = $1`, categoryID).Scan(&name, &axis); err != nil {
		return 0, fmt.Errorf("category: %w", err)
	}

	values := []string{""}
	switch axis {
	case "floor":
		values = nil
		for i := 1; i <= floors; i++ {
			values = append(values, ordinal(i))
		}
	case "unit":
		values = nil
		for _, u := range units {
			if u = strings.TrimSpace(u); u != "" {
				values = append(values, u)
			}
		}
	}

	created := 0
	for _, v := range values {
		tag, err := h.db.Exec(ctx, `
			INSERT INTO atlas_document
				(id, jobsite_id, name, category, category_id, subcategory, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT DO NOTHING`,
			uuid.NewString(), jobsiteID, slotName(name, axis, v), name, categoryID, v, userID)
		if err != nil {
			return created, err
		}
		created += int(tag.RowsAffected())
	}
	return created, nil
}

// POST /atlas/jobsites/:id/slots/:categoryId — acrescenta uma categoria a esta
// obra, sem tocar nas outras.
func (h *AtlasHandler) AddCategorySlot(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	categoryID, err := strconv.ParseInt(c.Params("categoryId"), 10, 64)
	if err != nil {
		return badRequest(c, "invalid category id")
	}
	userID, _ := actor(c)
	created, err := h.createSlotsForCategory(c.Context(), id, categoryID, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"created": created}})
}

// POST /atlas/jobsites/:id/slots — reaplica a taxonomia na obra.
//
// Existe porque o cadastro muda: o prédio ganha um andar, aparece uma letra de
// unidade nova, alguém acrescenta categoria à taxonomia. Em todos esses casos a
// obra precisa das vagas novas sem perder as antigas.
func (h *AtlasHandler) RegenerateSlots(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	userID, _ := actor(c)
	created, err := h.seedJobsiteSlots(c.Context(), id, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"created": created}})
}
