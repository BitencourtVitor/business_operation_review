package handler

import (
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Types ─────────────────────────────────────────────────────────────────────

type ClientItem struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type JobSiteItem struct {
	ID       int64  `json:"id"`
	ClientID int64  `json:"client_id"`
	Name     string `json:"name"`
}

// ─── Handler ───────────────────────────────────────────────────────────────────

type ForecastClientsHandler struct {
	db    *pgxpool.Pool
	audit *service.AuditService
}

func NewForecastClientsHandler(db *pgxpool.Pool, audit *service.AuditService) *ForecastClientsHandler {
	return &ForecastClientsHandler{db: db, audit: audit}
}

// GET /api/v1/forecast/catalog/clients
func (h *ForecastClientsHandler) ListClients(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(),
		`SELECT id, name FROM catalog_clients ORDER BY name ASC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	result := []ClientItem{}
	for rows.Next() {
		var item ClientItem
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		result = append(result, item)
	}
	return c.JSON(fiber.Map{"data": result})
}

// POST /api/v1/forecast/clients
func (h *ForecastClientsHandler) AddClient(c *fiber.Ctx) error {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}

	var newID int64
	err := h.db.QueryRow(c.Context(),
		`INSERT INTO catalog_clients (name) VALUES ($1) RETURNING id`,
		body.Name,
	).Scan(&newID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "catalog_clients", fmt.Sprintf("%d", newID))
	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"id": newID}})
}

// PATCH /api/v1/forecast/clients/:id
func (h *ForecastClientsHandler) UpdateClient(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}

	tag, err := h.db.Exec(c.Context(),
		`UPDATE catalog_clients SET name = $1 WHERE id = $2`,
		body.Name, id,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "catalog_clients", id)
	return c.SendStatus(204)
}

// DELETE /api/v1/forecast/clients/:id
func (h *ForecastClientsHandler) DeleteClient(c *fiber.Ctx) error {
	id := c.Params("id")
	tag, err := h.db.Exec(c.Context(),
		`DELETE FROM catalog_clients WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "catalog_clients", id)
	return c.SendStatus(204)
}

// GET /api/v1/forecast/catalog/job-sites
func (h *ForecastClientsHandler) ListJobSites(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(),
		`SELECT id, client_id, name FROM catalog_job_sites ORDER BY client_id ASC, name ASC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	result := []JobSiteItem{}
	for rows.Next() {
		var item JobSiteItem
		if err := rows.Scan(&item.ID, &item.ClientID, &item.Name); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		result = append(result, item)
	}
	return c.JSON(fiber.Map{"data": result})
}

// POST /api/v1/forecast/job-sites
func (h *ForecastClientsHandler) AddJobSite(c *fiber.Ctx) error {
	var body struct {
		ClientID int64  `json:"client_id"`
		Name     string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.ClientID == 0 || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "client_id and name are required"})
	}

	var newID int64
	err := h.db.QueryRow(c.Context(),
		`INSERT INTO catalog_job_sites (client_id, name) VALUES ($1, $2) RETURNING id`,
		body.ClientID, body.Name,
	).Scan(&newID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "catalog_job_sites", fmt.Sprintf("%d", newID))
	return c.Status(201).JSON(fiber.Map{"data": fiber.Map{"id": newID}})
}

// PATCH /api/v1/forecast/job-sites/:id
func (h *ForecastClientsHandler) UpdateJobSite(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}

	tag, err := h.db.Exec(c.Context(),
		`UPDATE catalog_job_sites SET name = $1 WHERE id = $2`,
		body.Name, id,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "catalog_job_sites", id)
	return c.SendStatus(204)
}

// DELETE /api/v1/forecast/job-sites/:id
func (h *ForecastClientsHandler) DeleteJobSite(c *fiber.Ctx) error {
	id := c.Params("id")
	tag, err := h.db.Exec(c.Context(),
		`DELETE FROM catalog_job_sites WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "catalog_job_sites", id)
	return c.SendStatus(204)
}
