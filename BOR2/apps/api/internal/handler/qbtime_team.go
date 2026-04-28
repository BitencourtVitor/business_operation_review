package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type QBTimeTeamHandler struct {
	svc   *service.QBTimeTeamService
	audit *service.AuditService
}

func NewQBTimeTeamHandler(svc *service.QBTimeTeamService, audit *service.AuditService) *QBTimeTeamHandler {
	return &QBTimeTeamHandler{svc: svc, audit: audit}
}

// GET /qbtime/teams?company=HVAC
func (h *QBTimeTeamHandler) List(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	teams, err := h.svc.List(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if teams == nil {
		teams = []*domain.QBTimeTeam{}
	}
	return c.JSON(fiber.Map{"data": teams})
}

// POST /qbtime/teams
func (h *QBTimeTeamHandler) Create(c *fiber.Ctx) error {
	var body domain.QBTimeTeam
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.Company == "" || body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company and name are required", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "qbtime_team", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

// PATCH /qbtime/teams/:id
func (h *QBTimeTeamHandler) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Name    string   `json:"name"`
		Members []string `json:"members"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), id, body.Name, body.Members)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "qbtime_team", id)
	return c.JSON(fiber.Map{"data": updated})
}

// DELETE /qbtime/teams/:id
func (h *QBTimeTeamHandler) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.svc.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "qbtime_team", id)
	return c.SendStatus(fiber.StatusNoContent)
}
