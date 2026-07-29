package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type QBTimeEmployeeTeamHandler struct {
	svc   *service.QBTimeEmployeeTeamService
	audit *service.AuditService
}

func NewQBTimeEmployeeTeamHandler(svc *service.QBTimeEmployeeTeamService, audit *service.AuditService) *QBTimeEmployeeTeamHandler {
	return &QBTimeEmployeeTeamHandler{svc: svc, audit: audit}
}

// GET /qbtime/employee-teams?company=HVAC
func (h *QBTimeEmployeeTeamHandler) List(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	teams, err := h.svc.List(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if teams == nil {
		teams = []*domain.QBTimeEmployeeTeam{}
	}
	return c.JSON(fiber.Map{"data": teams})
}

// PATCH /qbtime/employee-teams/:id/override  { "teamName": "..." }
func (h *QBTimeEmployeeTeamHandler) SetOverride(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		TeamName string `json:"teamName"`
	}
	if err := c.BodyParser(&body); err != nil || body.TeamName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teamName is required", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	updated, err := h.svc.SetOverride(c.Context(), id, body.TeamName, uname)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	h.audit.Log(c.Context(), uid, uname, "override", "qbtime_employee_team", id)
	return c.JSON(fiber.Map{"data": updated})
}

// DELETE /qbtime/employee-teams/:id/override
func (h *QBTimeEmployeeTeamHandler) ClearOverride(c *fiber.Ctx) error {
	id := c.Params("id")
	updated, err := h.svc.ClearOverride(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "clear_override", "qbtime_employee_team", id)
	return c.JSON(fiber.Map{"data": updated})
}

// POST /qbtime/employee-teams/sync — cron-guarded (X-Cron-Secret or admin session).
func (h *QBTimeEmployeeTeamHandler) Sync(c *fiber.Ctx) error {
	result := h.svc.SyncAll(c.Context())
	return c.JSON(fiber.Map{"data": result})
}
