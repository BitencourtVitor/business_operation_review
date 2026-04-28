package handler

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BuildingsHandler handles construction building schedule CRUD.
// PDF parsing is done client-side; the frontend sends structured JSON here for storage.
type BuildingsHandler struct {
	db *pgxpool.Pool
}

func NewBuildingsHandler(db *pgxpool.Pool) *BuildingsHandler {
	return &BuildingsHandler{db: db}
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BuildingRow struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Address     string  `json:"address"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	HasSchedule bool    `json:"has_schedule"`
	ScheduleID  *string `json:"schedule_id,omitempty"`
	PDFFilename *string `json:"pdf_filename,omitempty"`
	ProjectStart  *string `json:"project_start,omitempty"`
	ProjectFinish *string `json:"project_finish,omitempty"`
	UploadedAt  *string `json:"uploaded_at,omitempty"`
	TaskCount   *int    `json:"task_count,omitempty"`
}

// ─── List ─────────────────────────────────────────────────────────────────────

// GET /api/v1/buildings
func (h *BuildingsHandler) ListBuildings(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT
			b.id, b.name, b.address,
			b.created_at::text, b.updated_at::text,
			s.id,
			s.pdf_filename,
			s.project_start::text,
			s.project_finish::text,
			s.uploaded_at::text,
			jsonb_array_length(s.schedule_data->'rows')
		FROM construction_buildings b
		LEFT JOIN construction_schedules s
			ON s.building_id = b.id AND s.is_current = TRUE
		ORDER BY b.name ASC
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	buildings := []BuildingRow{}
	for rows.Next() {
		var b BuildingRow
		var schedID, pdfFile, projStart, projFinish, uploadedAt *string
		var taskCount *int
		if err := rows.Scan(
			&b.ID, &b.Name, &b.Address, &b.CreatedAt, &b.UpdatedAt,
			&schedID, &pdfFile, &projStart, &projFinish, &uploadedAt,
			&taskCount,
		); err != nil {
			continue
		}
		b.HasSchedule = schedID != nil
		b.ScheduleID = schedID
		b.PDFFilename = pdfFile
		b.ProjectStart = projStart
		b.ProjectFinish = projFinish
		b.UploadedAt = uploadedAt
		b.TaskCount = taskCount
		buildings = append(buildings, b)
	}
	return c.JSON(fiber.Map{"data": buildings})
}

// ─── Create ───────────────────────────────────────────────────────────────────

// POST /api/v1/buildings
func (h *BuildingsHandler) CreateBuilding(c *fiber.Ctx) error {
	var body struct {
		Name    string `json:"name"`
		Address string `json:"address"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO construction_buildings (name, address)
		VALUES ($1, $2)
		RETURNING id
	`, body.Name, body.Address).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// ─── Update ───────────────────────────────────────────────────────────────────

// PUT /api/v1/buildings/:id
func (h *BuildingsHandler) UpdateBuilding(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Name    string `json:"name"`
		Address string `json:"address"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE construction_buildings
		SET name = $1, address = $2, updated_at = NOW()
		WHERE id = $3
	`, body.Name, body.Address, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// ─── Delete ───────────────────────────────────────────────────────────────────

// DELETE /api/v1/buildings/:id
func (h *BuildingsHandler) DeleteBuilding(c *fiber.Ctx) error {
	id := c.Params("id")
	_, err := h.db.Exec(c.Context(), `DELETE FROM construction_buildings WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

// GET /api/v1/buildings/:id/schedule
func (h *BuildingsHandler) GetSchedule(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	var rawData []byte
	var pdfFilename string
	var projectStart, projectFinish *time.Time
	var uploadedAt time.Time

	err := h.db.QueryRow(c.Context(), `
		SELECT schedule_data, pdf_filename, project_start, project_finish, uploaded_at
		FROM construction_schedules
		WHERE building_id = $1 AND is_current = TRUE
	`, buildingID).Scan(&rawData, &pdfFilename, &projectStart, &projectFinish, &uploadedAt)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no current schedule found"})
	}

	var scheduleData interface{}
	_ = json.Unmarshal(rawData, &scheduleData)

	fmtDate := func(t *time.Time) *string {
		if t == nil {
			return nil
		}
		s := t.Format("2006-01-02")
		return &s
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"pdf_filename":   pdfFilename,
			"project_start":  fmtDate(projectStart),
			"project_finish": fmtDate(projectFinish),
			"uploaded_at":    uploadedAt.Format(time.RFC3339),
			"schedule_data":  scheduleData,
		},
	})
}

// POST /api/v1/buildings/:id/schedule
// Client parses the PDF and sends the structured JSON. Old schedule is archived.
func (h *BuildingsHandler) UpsertSchedule(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	var body struct {
		PDFFilename   string          `json:"pdf_filename"`
		ProjectStart  *string         `json:"project_start"`
		ProjectFinish *string         `json:"project_finish"`
		ScheduleData  json.RawMessage `json:"schedule_data"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if len(body.ScheduleData) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "schedule_data is required"})
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(c.Context()) //nolint:errcheck

	// Archive the existing current schedule
	if _, err = tx.Exec(c.Context(), `
		UPDATE construction_schedules
		SET is_current = FALSE
		WHERE building_id = $1 AND is_current = TRUE
	`, buildingID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Insert the new current schedule
	var schedID string
	if err = tx.QueryRow(c.Context(), `
		INSERT INTO construction_schedules
			(building_id, pdf_filename, project_start, project_finish, schedule_data, is_current)
		VALUES ($1, $2, $3::date, $4::date, $5::jsonb, TRUE)
		RETURNING id
	`, buildingID, body.PDFFilename, body.ProjectStart, body.ProjectFinish,
		string(body.ScheduleData)).Scan(&schedID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err = tx.Commit(c.Context()); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Update the building's updated_at timestamp
	_, _ = h.db.Exec(c.Context(), `
		UPDATE construction_buildings SET updated_at = NOW() WHERE id = $1
	`, buildingID)

	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"schedule_id": schedID}})
}

// DELETE /api/v1/buildings/:id/schedule
func (h *BuildingsHandler) DeleteSchedule(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	_, err := h.db.Exec(c.Context(), `
		DELETE FROM construction_schedules WHERE building_id = $1 AND is_current = TRUE
	`, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}
