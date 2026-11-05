package handler

import (
	"errors"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WorkforceInsightsHandler struct {
	svc   *service.WorkforceInsightsService
	audit *service.AuditService
}

func NewWorkforceInsightsHandler(svc *service.WorkforceInsightsService, audit *service.AuditService) *WorkforceInsightsHandler {
	return &WorkforceInsightsHandler{svc: svc, audit: audit}
}

func wiError(c *fiber.Ctx, err error) error {
	if errors.Is(err, domain.ErrBadRequest) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid data", "code": "BAD_REQUEST"})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
}

// GET /workforce-insights/overview?company=framing|hvac&year=2026&granularity=month|payperiod
func (h *WorkforceInsightsHandler) Overview(c *fiber.Ctx) error {
	g := c.Query("granularity", "month")
	if g != "month" && g != "payperiod" {
		return wiError(c, domain.ErrBadRequest)
	}
	out, err := h.svc.Overview(c.Context(), c.Query("company", "framing"), c.QueryInt("year", time.Now().Year()), g, c.Query("client"), c.Query("jobsite"))
	if err != nil {
		return wiError(c, err)
	}
	return c.JSON(fiber.Map{"data": out})
}

func (h *WorkforceInsightsHandler) Buildings(c *fiber.Ctx) error {
	out, err := h.svc.Buildings(c.Context())
	if err != nil {
		return wiError(c, err)
	}
	return c.JSON(fiber.Map{"data": out})
}

func (h *WorkforceInsightsHandler) Settings(c *fiber.Ctx) error {
	out, err := h.svc.Settings(c.Context())
	if err != nil {
		return wiError(c, err)
	}
	return c.JSON(fiber.Map{"data": out})
}

func (h *WorkforceInsightsHandler) SaveSettings(c *fiber.Ctx) error {
	var s domain.InsightsSettings
	if err := c.BodyParser(&s); err != nil {
		return wiError(c, domain.ErrBadRequest)
	}
	if err := h.svc.SaveSettings(c.Context(), &s); err != nil {
		return wiError(c, err)
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "workforce/insights-settings", "")
	return c.SendStatus(fiber.StatusNoContent)
}

// GET /workforce-insights/employee-weeks?company=framing&year=2026&employee=...
func (h *WorkforceInsightsHandler) EmployeeWeeks(c *fiber.Ctx) error {
	out, err := h.svc.EmployeeWeeks(c.Context(), c.Query("company", "framing"), c.QueryInt("year", time.Now().Year()), c.Query("employee"))
	if err != nil {
		return wiError(c, err)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /workforce-insights/overtime-notes  { company, employee, weekStart, note }
func (h *WorkforceInsightsHandler) SaveOvertimeNote(c *fiber.Ctx) error {
	var body struct {
		Company   string `json:"company"`
		Employee  string `json:"employee"`
		WeekStart string `json:"weekStart"`
		Note      string `json:"note"`
	}
	if err := c.BodyParser(&body); err != nil {
		return wiError(c, domain.ErrBadRequest)
	}
	_, name := actor(c)
	n := domain.OvertimeNote{Employee: body.Employee, WeekStart: body.WeekStart, Note: body.Note, Author: name}
	if err := h.svc.SaveOvertimeNote(c.Context(), body.Company, n); err != nil {
		return wiError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}
