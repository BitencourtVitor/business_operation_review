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
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Address       string  `json:"address"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	HasSchedule   bool    `json:"has_schedule"`
	ScheduleID    *string `json:"schedule_id,omitempty"`
	PDFFilename   *string `json:"pdf_filename,omitempty"`
	ProjectStart  *string `json:"project_start,omitempty"`
	ProjectFinish *string `json:"project_finish,omitempty"`
	UploadedAt    *string `json:"uploaded_at,omitempty"`
	TaskCount     *int    `json:"task_count,omitempty"`
}

type RowMetaItem struct {
	RowID       int     `json:"row_id"`
	Status      string  `json:"status"`
	Observation string  `json:"observation"`
	RealStart   *string `json:"real_start"`
	RealFinish  *string `json:"real_finish"`
	IsFinished  bool    `json:"is_finished"`
}

type RowComment struct {
	ID          string `json:"id"`
	RowID       int    `json:"row_id"`
	UserName    string `json:"user_name"`
	UserRole    string `json:"user_role"`
	Body        string `json:"body"`
	CreatedAt   string `json:"created_at"`
	CreatedByID string `json:"created_by_id"`
}

type ScheduleEventType struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

type ScheduleEvent struct {
	ID          string `json:"id"`
	BuildingID  string `json:"building_id"`
	EventTypeID int    `json:"event_type_id"`
	EventDate   string `json:"event_date"`
	DaysDelayed int    `json:"days_delayed"`
	Notes       string `json:"notes"`
	CreatedAt   string `json:"created_at"`
	// Joined
	TypeName  string `json:"type_name"`
	TypeIcon  string `json:"type_icon"`
	TypeColor string `json:"type_color"`
}

type TradeOwnership struct {
	ID         string `json:"id"`
	BuildingID string `json:"building_id"`
	TradeName  string `json:"trade_name"`
	IsOurs     bool   `json:"is_ours"`
}

// ─── Buildings CRUD ───────────────────────────────────────────────────────────

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

	if _, err = tx.Exec(c.Context(), `
		UPDATE construction_schedules
		SET is_current = FALSE
		WHERE building_id = $1 AND is_current = TRUE
	`, buildingID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

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

	_, _ = h.db.Exec(c.Context(), `
		UPDATE construction_buildings SET updated_at = NOW() WHERE id = $1
	`, buildingID)

	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"schedule_id": schedID}})
}

// GET /api/v1/buildings/:id/schedule/history — all versions (newest first)
func (h *BuildingsHandler) GetScheduleHistory(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	rows, err := h.db.Query(c.Context(), `
		SELECT id, pdf_filename, project_start::text, project_finish::text,
		       uploaded_at::text, is_current,
		       jsonb_array_length(schedule_data->'rows')
		FROM construction_schedules
		WHERE building_id = $1
		ORDER BY uploaded_at DESC
	`, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type historyItem struct {
		ID            string  `json:"id"`
		PDFFilename   string  `json:"pdf_filename"`
		ProjectStart  *string `json:"project_start"`
		ProjectFinish *string `json:"project_finish"`
		UploadedAt    string  `json:"uploaded_at"`
		IsCurrent     bool    `json:"is_current"`
		TaskCount     *int    `json:"task_count"`
	}

	result := []historyItem{}
	for rows.Next() {
		var item historyItem
		if err := rows.Scan(
			&item.ID, &item.PDFFilename, &item.ProjectStart, &item.ProjectFinish,
			&item.UploadedAt, &item.IsCurrent, &item.TaskCount,
		); err != nil {
			continue
		}
		result = append(result, item)
	}
	return c.JSON(fiber.Map{"data": result})
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

// ─── Row meta (with actuals) ──────────────────────────────────────────────────

// GET /api/v1/buildings/:id/schedule/row-meta
func (h *BuildingsHandler) GetScheduleRowMeta(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rows, err := h.db.Query(c.Context(), `
		SELECT m.row_id, m.status, m.observation,
		       m.real_start::text, m.real_finish::text, m.is_finished
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
		if err := rows.Scan(
			&item.RowID, &item.Status, &item.Observation,
			&item.RealStart, &item.RealFinish, &item.IsFinished,
		); err != nil {
			continue
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"data": items})
}

// PATCH /api/v1/buildings/:id/schedule/row-meta/:rowId
func (h *BuildingsHandler) UpsertScheduleRowMeta(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rowID      := c.Params("rowId")

	// RealStart/RealFinish use json.RawMessage to distinguish three states:
	//   absent (len==0)          → keep existing DB value
	//   "null"                   → explicitly clear to NULL
	//   "\"2025-01-01\""         → set to that date
	// *string cannot distinguish "absent" from "sent as null", so we need RawMessage.
	var body struct {
		Status      *string         `json:"status"`
		Observation *string         `json:"observation"`
		RealStart   json.RawMessage `json:"real_start"`
		RealFinish  json.RawMessage `json:"real_finish"`
		IsFinished  *bool           `json:"is_finished"`
	}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	// parseDate returns (isPresent, value).
	// isPresent=false → field absent from patch, keep existing.
	// isPresent=true  → field was set; value may be nil (clear to NULL).
	parseDate := func(raw json.RawMessage) (bool, *string) {
		if len(raw) == 0 {
			return false, nil
		}
		if string(raw) == "null" {
			return true, nil
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return false, nil
		}
		return true, &s
	}

	rsSet, rsVal := parseDate(body.RealStart)
	rfSet, rfVal := parseDate(body.RealFinish)

	var schedID string
	if err := h.db.QueryRow(c.Context(), `
		SELECT id FROM construction_schedules WHERE building_id = $1 AND is_current = TRUE
	`, buildingID).Scan(&schedID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no current schedule"})
	}

	// $5/$7 are the "was this field present in the patch?" booleans.
	// $6/$8 are the actual values (nil = NULL = clear the column).
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO construction_schedule_row_meta
			(schedule_id, row_id, status, observation, real_start, real_finish, is_finished)
		VALUES ($1, $2,
			COALESCE($3, 'pending'),
			COALESCE($4, ''),
			CASE WHEN $5 THEN $6::date ELSE NULL END,
			CASE WHEN $7 THEN $8::date ELSE NULL END,
			COALESCE($9, false))
		ON CONFLICT (schedule_id, row_id) DO UPDATE SET
			status      = COALESCE($3, construction_schedule_row_meta.status),
			observation = COALESCE($4, construction_schedule_row_meta.observation),
			real_start  = CASE WHEN $5 THEN $6::date ELSE construction_schedule_row_meta.real_start  END,
			real_finish = CASE WHEN $7 THEN $8::date ELSE construction_schedule_row_meta.real_finish END,
			is_finished = CASE WHEN $9 IS NOT NULL THEN $9 ELSE construction_schedule_row_meta.is_finished END,
			updated_at  = NOW()
	`, schedID, rowID,
		body.Status, body.Observation,
		rsSet, rsVal,
		rfSet, rfVal,
		body.IsFinished)
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
	if body.IsFinished != nil && *body.IsFinished {
		uid, uname := actor(c)
		h.audit.Log(c.Context(), uid, uname, "row_mark_finished", "schedule_row", rowID)
	}

	return c.SendStatus(204)
}

// ─── Row comments ─────────────────────────────────────────────────────────────

// GET /api/v1/buildings/:id/schedule/row-comments  — all comments for current schedule
func (h *BuildingsHandler) GetAllRowComments(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	rows, err := h.db.Query(c.Context(), `
		SELECT cm.id, cm.row_id, cm.user_name, cm.user_role, cm.body, cm.created_at::text,
		       COALESCE(cm.created_by_id::text, '')
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
		if err := rows.Scan(&item.ID, &item.RowID, &item.UserName, &item.UserRole, &item.Body, &item.CreatedAt, &item.CreatedByID); err != nil {
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
		SELECT cm.id, cm.row_id, cm.user_name, cm.user_role, cm.body, cm.created_at::text,
		       COALESCE(cm.created_by_id::text, '')
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
		if err := rows.Scan(&item.ID, &item.RowID, &item.UserName, &item.UserRole, &item.Body, &item.CreatedAt, &item.CreatedByID); err != nil {
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

	uid, uname := actor(c)

	var schedID string
	if err := h.db.QueryRow(c.Context(), `
		SELECT id FROM construction_schedules WHERE building_id = $1 AND is_current = TRUE
	`, buildingID).Scan(&schedID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no current schedule"})
	}

	var comment RowComment
	if err := h.db.QueryRow(c.Context(), `
		INSERT INTO construction_schedule_row_comments (schedule_id, row_id, user_name, user_role, body, created_by_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, row_id, user_name, user_role, body, created_at::text, COALESCE(created_by_id::text, '')
	`, schedID, rowID, body.UserName, body.UserRole, body.Body, uid).Scan(
		&comment.ID, &comment.RowID, &comment.UserName, &comment.UserRole, &comment.Body, &comment.CreatedAt, &comment.CreatedByID,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	h.audit.Log(c.Context(), uid, uname, "comment_create", "schedule_row_comment", comment.ID)

	return c.Status(201).JSON(fiber.Map{"data": comment})
}

// PATCH /api/v1/buildings/:id/schedule/row-comments/:commentId
func (h *BuildingsHandler) EditRowComment(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	commentID := c.Params("commentId")

	var body struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Body == "" {
		return c.Status(400).JSON(fiber.Map{"error": "body is required"})
	}

	uid, uname := actor(c)

	var comment RowComment
	err := h.db.QueryRow(c.Context(), `
		UPDATE construction_schedule_row_comments cm
		SET body = $1
		FROM construction_schedules s
		WHERE cm.id = $2
		  AND cm.schedule_id = s.id
		  AND s.building_id = $3
		  AND s.is_current = TRUE
		  AND cm.created_by_id = $4
		RETURNING cm.id, cm.row_id, cm.user_name, cm.user_role, cm.body, cm.created_at::text, COALESCE(cm.created_by_id::text, '')
	`, body.Body, commentID, buildingID, uid).Scan(
		&comment.ID, &comment.RowID, &comment.UserName, &comment.UserRole, &comment.Body, &comment.CreatedAt, &comment.CreatedByID,
	)
	if err != nil {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
	}

	h.audit.Log(c.Context(), uid, uname, "comment_edit", "schedule_row_comment", commentID)

	return c.JSON(fiber.Map{"data": comment})
}

// DELETE /api/v1/buildings/:id/schedule/row-comments/:commentId
func (h *BuildingsHandler) DeleteRowComment(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	commentID := c.Params("commentId")

	uid, uname := actor(c)

	result, err := h.db.Exec(c.Context(), `
		DELETE FROM construction_schedule_row_comments cm
		USING construction_schedules s
		WHERE cm.id = $1
		  AND cm.schedule_id = s.id
		  AND s.building_id = $2
		  AND s.is_current = TRUE
		  AND cm.created_by_id = $3
	`, commentID, buildingID, uid)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if result.RowsAffected() == 0 {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
	}

	h.audit.Log(c.Context(), uid, uname, "comment_delete", "schedule_row_comment", commentID)

	return c.SendStatus(204)
}

// ─── Schedule Events ──────────────────────────────────────────────────────────

// GET /api/v1/buildings/event-types
func (h *BuildingsHandler) ListEventTypes(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, icon, color FROM schedule_event_types ORDER BY id
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	result := []ScheduleEventType{}
	for rows.Next() {
		var t ScheduleEventType
		if err := rows.Scan(&t.ID, &t.Name, &t.Icon, &t.Color); err != nil {
			continue
		}
		result = append(result, t)
	}
	return c.JSON(fiber.Map{"data": result})
}

// GET /api/v1/buildings/:id/events
func (h *BuildingsHandler) GetBuildingEvents(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rows, err := h.db.Query(c.Context(), `
		SELECT e.id, e.building_id, e.event_type_id, e.event_date::text,
		       e.days_delayed, e.notes, e.created_at::text,
		       t.name, t.icon, t.color
		FROM schedule_events e
		JOIN schedule_event_types t ON t.id = e.event_type_id
		WHERE e.building_id = $1
		ORDER BY e.event_date DESC, e.created_at DESC
	`, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	result := []ScheduleEvent{}
	for rows.Next() {
		var ev ScheduleEvent
		if err := rows.Scan(
			&ev.ID, &ev.BuildingID, &ev.EventTypeID, &ev.EventDate,
			&ev.DaysDelayed, &ev.Notes, &ev.CreatedAt,
			&ev.TypeName, &ev.TypeIcon, &ev.TypeColor,
		); err != nil {
			continue
		}
		result = append(result, ev)
	}
	return c.JSON(fiber.Map{"data": result})
}

// POST /api/v1/buildings/:id/events
func (h *BuildingsHandler) AddBuildingEvent(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	var body struct {
		EventTypeID int    `json:"event_type_id"`
		EventDate   string `json:"event_date"`
		DaysDelayed int    `json:"days_delayed"`
		Notes       string `json:"notes"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.EventTypeID == 0 || body.EventDate == "" {
		return c.Status(400).JSON(fiber.Map{"error": "event_type_id and event_date are required"})
	}

	var ev ScheduleEvent
	if err := h.db.QueryRow(c.Context(), `
		INSERT INTO schedule_events (building_id, event_type_id, event_date, days_delayed, notes)
		VALUES ($1, $2, $3::date, $4, $5)
		RETURNING id, building_id, event_type_id, event_date::text, days_delayed, notes, created_at::text
	`, buildingID, body.EventTypeID, body.EventDate, body.DaysDelayed, body.Notes).Scan(
		&ev.ID, &ev.BuildingID, &ev.EventTypeID, &ev.EventDate,
		&ev.DaysDelayed, &ev.Notes, &ev.CreatedAt,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Join type info
	_ = h.db.QueryRow(c.Context(), `
		SELECT name, icon, color FROM schedule_event_types WHERE id = $1
	`, body.EventTypeID).Scan(&ev.TypeName, &ev.TypeIcon, &ev.TypeColor)

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "event_create", "schedule_event", ev.ID)

	return c.Status(201).JSON(fiber.Map{"data": ev})
}

// DELETE /api/v1/buildings/:id/events/:eventId
func (h *BuildingsHandler) DeleteBuildingEvent(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	eventID := c.Params("eventId")

	result, err := h.db.Exec(c.Context(), `
		DELETE FROM schedule_events WHERE id = $1 AND building_id = $2
	`, eventID, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if result.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "event not found"})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "event_delete", "schedule_event", eventID)

	return c.SendStatus(204)
}

// ─── Trade Ownership ──────────────────────────────────────────────────────────

// GET /api/v1/buildings/:id/trades
func (h *BuildingsHandler) GetTradeOwnership(c *fiber.Ctx) error {
	buildingID := c.Params("id")
	rows, err := h.db.Query(c.Context(), `
		SELECT id, building_id, trade_name, is_ours
		FROM schedule_trade_ownership
		WHERE building_id = $1
		ORDER BY trade_name ASC
	`, buildingID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	result := []TradeOwnership{}
	for rows.Next() {
		var t TradeOwnership
		if err := rows.Scan(&t.ID, &t.BuildingID, &t.TradeName, &t.IsOurs); err != nil {
			continue
		}
		result = append(result, t)
	}
	return c.JSON(fiber.Map{"data": result})
}

// PUT /api/v1/buildings/:id/trades  — batch upsert: [{trade_name, is_ours}, ...]
func (h *BuildingsHandler) UpsertTradeOwnership(c *fiber.Ctx) error {
	buildingID := c.Params("id")

	var body struct {
		Trades []struct {
			TradeName string `json:"trade_name"`
			IsOurs    bool   `json:"is_ours"`
		} `json:"trades"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if len(body.Trades) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "trades array is required"})
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(c.Context()) //nolint:errcheck

	for _, t := range body.Trades {
		if _, err := tx.Exec(c.Context(), `
			INSERT INTO schedule_trade_ownership (building_id, trade_name, is_ours)
			VALUES ($1, $2, $3)
			ON CONFLICT (building_id, trade_name) DO UPDATE SET is_ours = $3
		`, buildingID, t.TradeName, t.IsOurs); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "trades_upsert", "schedule_trade_ownership", buildingID)

	return c.SendStatus(204)
}
