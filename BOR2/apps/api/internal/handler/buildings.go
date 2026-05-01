package handler

import (
	"encoding/json"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BuildingsHandler handles construction building schedule CRUD.
// PDF parsing is done client-side; the frontend sends structured JSON here for storage.
type BuildingsHandler struct {
	db    *pgxpool.Pool
	audit *service.AuditService
}

func NewBuildingsHandler(db *pgxpool.Pool, audit *service.AuditService) *BuildingsHandler {
	return &BuildingsHandler{db: db, audit: audit}
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

// ─── Row meta ─────────────────────────────────────────────────────────────────

type RowMetaItem struct {
	RowID       int    `json:"row_id"`
	Status      string `json:"status"`
	Observation string `json:"observation"`
}

// GET /api/v1/buildings/:id/schedule/row-meta
func (h *BuildingsHandler) GetScheduleRowMeta(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rows, err := h.db.Query(c.Context(), `
		SELECT m.row_id, m.status, m.observation
		FROM construction_schedule_row_meta m
		JOIN construction_schedules s ON s.id = m.schedule_id
		WHERE s.building_id = $1 AND s.is_current = TRUE
		ORDER BY m.row_id
	`, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	items := []RowMetaItem{}
	for rows.Next() {
		var item RowMetaItem
		if err := rows.Scan(&item.RowID, &item.Status, &item.Observation); err != nil {
			continue
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"data": items})
}

// ─── Row comments ─────────────────────────────────────────────────────────────

type RowComment struct {
	ID        string `json:"id"`
	RowID     int    `json:"row_id"`
	UserName  string `json:"user_name"`
	UserRole  string `json:"user_role"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

// GET /api/v1/buildings/:id/schedule/row-comments  — all comments for current schedule
func (h *BuildingsHandler) GetAllRowComments(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	rows, err := h.db.Query(c.Context(), `
		SELECT cm.id, cm.row_id, cm.user_name, cm.user_role, cm.body, cm.created_at::text
		FROM construction_schedule_row_comments cm
		JOIN construction_schedules s ON s.id = cm.schedule_id
		WHERE s.building_id = $1 AND s.is_current = TRUE
		ORDER BY cm.row_id, cm.created_at ASC
	`, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	items := []RowComment{}
	for rows.Next() {
		var item RowComment
		if err := rows.Scan(&item.ID, &item.RowID, &item.UserName, &item.UserRole, &item.Body, &item.CreatedAt); err != nil {
			continue
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"data": items})
}

// GET /api/v1/buildings/:id/schedule/row-comments/:rowId
func (h *BuildingsHandler) GetRowComments(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rowID := c.Params("rowId")

	rows, err := h.db.Query(c.Context(), `
		SELECT cm.id, cm.row_id, cm.user_name, cm.user_role, cm.body, cm.created_at::text
		FROM construction_schedule_row_comments cm
		JOIN construction_schedules s ON s.id = cm.schedule_id
		WHERE s.building_id = $1 AND s.is_current = TRUE AND cm.row_id = $2
		ORDER BY cm.created_at ASC
	`, buildingID, rowID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	items := []RowComment{}
	for rows.Next() {
		var item RowComment
		if err := rows.Scan(&item.ID, &item.RowID, &item.UserName, &item.UserRole, &item.Body, &item.CreatedAt); err != nil {
			continue
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"data": items})
}

// POST /api/v1/buildings/:id/schedule/row-comments/:rowId
func (h *BuildingsHandler) AddRowComment(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rowID := c.Params("rowId")

	var body struct {
		Body     string `json:"body"`
		UserName string `json:"user_name"`
		UserRole string `json:"user_role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Body == "" {
		return c.Status(400).JSON(fiber.Map{"error": "body is required"})
	}

	var schedID string
	if err := h.db.QueryRow(c.Context(), `
		SELECT id FROM construction_schedules WHERE building_id = $1 AND is_current = TRUE
	`, buildingID).Scan(&schedID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no current schedule"})
	}

	var comment RowComment
	if err := h.db.QueryRow(c.Context(), `
		INSERT INTO construction_schedule_row_comments (schedule_id, row_id, user_name, user_role, body)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, row_id, user_name, user_role, body, created_at::text
	`, schedID, rowID, body.UserName, body.UserRole, body.Body).Scan(
		&comment.ID, &comment.RowID, &comment.UserName, &comment.UserRole, &comment.Body, &comment.CreatedAt,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "comment_create", "schedule_row_comment", comment.ID)

	return c.Status(201).JSON(fiber.Map{"data": comment})
}

// PATCH /api/v1/buildings/:id/schedule/row-comments/:commentId
func (h *BuildingsHandler) EditRowComment(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	commentID  := c.Params("commentId")

	var body struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Body == "" {
		return c.Status(400).JSON(fiber.Map{"error": "body is required"})
	}

	var comment RowComment
	err := h.db.QueryRow(c.Context(), `
		UPDATE construction_schedule_row_comments cm
		SET body = $1
		FROM construction_schedules s
		WHERE cm.id = $2
		  AND cm.schedule_id = s.id
		  AND s.building_id = $3
		  AND s.is_current = TRUE
		RETURNING cm.id, cm.row_id, cm.user_name, cm.user_role, cm.body, cm.created_at::text
	`, body.Body, commentID, buildingID).Scan(
		&comment.ID, &comment.RowID, &comment.UserName, &comment.UserRole, &comment.Body, &comment.CreatedAt,
	)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "comment not found"})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "comment_edit", "schedule_row_comment", commentID)

	return c.JSON(fiber.Map{"data": comment})
}

// DELETE /api/v1/buildings/:id/schedule/row-comments/:commentId
func (h *BuildingsHandler) DeleteRowComment(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	commentID  := c.Params("commentId")

	result, err := h.db.Exec(c.Context(), `
		DELETE FROM construction_schedule_row_comments cm
		USING construction_schedules s
		WHERE cm.id = $1
		  AND cm.schedule_id = s.id
		  AND s.building_id = $2
		  AND s.is_current = TRUE
	`, commentID, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if result.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "comment not found"})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "comment_delete", "schedule_row_comment", commentID)

	return c.SendStatus(204)
}

// PATCH /api/v1/buildings/:id/schedule/row-meta/:rowId
func (h *BuildingsHandler) UpsertScheduleRowMeta(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rowID := c.Params("rowId")

	var body struct {
		Status      *string `json:"status"`
		Observation *string `json:"observation"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	var schedID string
	if err := h.db.QueryRow(c.Context(), `
		SELECT id FROM construction_schedules WHERE building_id = $1 AND is_current = TRUE
	`, buildingID).Scan(&schedID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no current schedule"})
	}

	_, err := h.db.Exec(c.Context(), `
		INSERT INTO construction_schedule_row_meta (schedule_id, row_id, status, observation)
		VALUES ($1, $2, COALESCE($3, 'pending'), COALESCE($4, ''))
		ON CONFLICT (schedule_id, row_id) DO UPDATE SET
			status      = COALESCE($3, construction_schedule_row_meta.status),
			observation = COALESCE($4, construction_schedule_row_meta.observation),
			updated_at  = NOW()
	`, schedID, rowID, body.Status, body.Observation)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if body.Status != nil {
		uid, uname := actor(c)
		action := "row_unmark_done"
		if *body.Status == "done" {
			action = "row_mark_done"
		}
		h.audit.Log(c.Context(), uid, uname, action, "schedule_row", rowID)
	}

	return c.SendStatus(204)
}
