package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// O cronograma do Building Schedule ligado a este projeto.
//
// Só diz qual é e em que pé está: o Gantt em si continua lido pelas rotas de
// /buildings, as mesmas do BOR, para o Atlas não manter uma segunda cópia da
// leitura e dos comentários de linha.

type atlasJobsiteSchedule struct {
	BuildingID    string  `json:"buildingId"`
	Name          string  `json:"name"`
	HasSchedule   bool    `json:"hasSchedule"`
	PDFFilename   *string `json:"pdfFilename"`
	ProjectStart  *string `json:"projectStart"`
	ProjectFinish *string `json:"projectFinish"`
	UploadedAt    *string `json:"uploadedAt"`
}

// GET /atlas/jobsites/:id/schedule
//
// Projeto sem cronograma ligado devolve data null, e não 404: é o estado normal
// da maioria dos projetos, e a barra lateral pergunta isso a cada obra aberta.
func (h *AtlasHandler) JobsiteSchedule(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "read"); err != nil {
		return atlasForbidden(c)
	}
	var s atlasJobsiteSchedule
	var schedID *string
	err := h.db.QueryRow(c.Context(), `
		SELECT b.id, b.name, s.id, s.pdf_filename,
		       s.project_start::text, s.project_finish::text, s.uploaded_at::text
		FROM construction_buildings b
		LEFT JOIN construction_schedules s
		  ON s.building_id = b.id AND s.is_current = TRUE
		WHERE b.atlas_jobsite_id = $1`, id).Scan(
		&s.BuildingID, &s.Name, &schedID, &s.PDFFilename,
		&s.ProjectStart, &s.ProjectFinish, &s.UploadedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c.JSON(fiber.Map{"data": nil})
	}
	if err != nil {
		return internalErr(c, err)
	}
	s.HasSchedule = schedID != nil
	return c.JSON(fiber.Map{"data": s})
}
