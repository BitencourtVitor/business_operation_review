package handler

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Edição à mão das datas de etapa da HVAC, feita pelo HVAC Schedule.
//
// Rota própria, e não o PUT que já salva o projeto inteiro, por um motivo: aqui
// a justificativa é obrigatória. Ela viaja por variável de sessão até o trigger
// do histórico, que é quem grava — e variável de sessão só vale dentro da
// transação, então a escrita acontece toda aqui dentro.
//
// A cascata ("empurrei a etapa 2 em 3 dias, as seguintes vão junto") é contada
// na tela, que mostra o resultado antes de confirmar. O que chega aqui já é o
// conjunto final de datas.
type HVACStagesHandler struct {
	db *pgxpool.Pool
}

func NewHVACStagesHandler(db *pgxpool.Pool) *HVACStagesHandler {
	return &HVACStagesHandler{db: db}
}

// As únicas colunas que esta rota escreve. O mapa é a lista branca: chave que
// não estiver aqui não vira SQL.
var hvacStageColumns = map[string]string{
	"hvacRoughDate":         "hvac_rough_date",
	"hvacRoughEndDate":      "hvac_rough_end_date",
	"hvacAirHandlerDate":    "hvac_air_handler_date",
	"hvacAirHandlerEndDate": "hvac_air_handler_end_date",
	"hvacCondenserDate":     "hvac_condenser_date",
	"hvacCondenserEndDate":  "hvac_condenser_end_date",
	"hvacFinishDate":        "hvac_finish_date",
	"hvacFinishEndDate":     "hvac_finish_end_date",
}

const maxNoteLength = 500

type hvacStagesRequest struct {
	// Por que a data está sendo mexida. Sem isso não grava.
	Note string `json:"note"`
	// Campo -> "2026-10-05", ou nulo para limpar a data.
	Dates map[string]*string `json:"dates"`
}

// PATCH /api/v1/forecast/:id/hvac-stages
func (h *HVACStagesHandler) Update(c *fiber.Ctx) error {
	var req hvacStagesRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}

	note := strings.TrimSpace(req.Note)
	if note == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "a justification is required to change a stage date", "code": "NOTE_REQUIRED",
		})
	}
	if len(note) > maxNoteLength {
		note = note[:maxNoteLength]
	}
	if len(req.Dates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no date to change", "code": "BAD_REQUEST"})
	}

	sets := make([]string, 0, len(req.Dates))
	args := []any{c.Params("id")}
	for key, value := range req.Dates {
		column, ok := hvacStageColumns[key]
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "unknown field: " + key, "code": "BAD_REQUEST",
			})
		}
		args = append(args, value)
		sets = append(sets, fmt.Sprintf("%s = $%d::date", column, len(args)))
	}

	_, uname := actor(c)

	err := pgx.BeginFunc(c.Context(), h.db, func(tx pgx.Tx) error {
		// O trigger do histórico lê estas três. `true` é o que as prende à
		// transação: sem isso a conexão volta ao pool assinada por quem passou.
		if _, err := tx.Exec(c.Context(), `
			SELECT set_config('bor.date_source', 'manual', true),
			       set_config('bor.changed_by',  $1,       true),
			       set_config('bor.change_note', $2,       true)
		`, uname, note); err != nil {
			return err
		}

		tag, err := tx.Exec(c.Context(), fmt.Sprintf(`
			UPDATE forecast_core SET %s, updated_at = now()
			WHERE id = $1 AND LOWER(COALESCE(company, '')) = 'hvac'
		`, strings.Join(sets, ", ")), args...)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})
	if err == pgx.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "hvac project not found", "code": "NOT_FOUND",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"id": c.Params("id"), "changed": len(req.Dates)}})
}
