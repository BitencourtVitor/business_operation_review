package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type ProjectMonitoringHvacHandler struct {
	svc   *service.ProjectMonitoringHvacService
	audit *service.AuditService
}

func NewProjectMonitoringHvacHandler(svc *service.ProjectMonitoringHvacService, audit *service.AuditService) *ProjectMonitoringHvacHandler {
	return &ProjectMonitoringHvacHandler{svc: svc, audit: audit}
}

func (h *ProjectMonitoringHvacHandler) List(c *fiber.Ctx) error {
	filters := domain.ProjectMonitoringHvacFilters{
		City:    c.Query("city"),
		JobSite: c.Query("jobSite"),
		Team:    c.Query("team"),
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *ProjectMonitoringHvacHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *ProjectMonitoringHvacHandler) Create(c *fiber.Ctx) error {
	var r domain.ProjectMonitoringHvac
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "project_monitoring", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *ProjectMonitoringHvacHandler) Update(c *fiber.Ctx) error {
	var r domain.ProjectMonitoringHvac
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "project_monitoring", c.Params("id"))
	return c.JSON(fiber.Map{"data": updated})
}

func (h *ProjectMonitoringHvacHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "project_monitoring", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}
