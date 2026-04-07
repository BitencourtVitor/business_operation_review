package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type EmployeeNameHandler struct {
	svc   *service.EmployeeNameService
	audit *service.AuditService
}

func NewEmployeeNameHandler(svc *service.EmployeeNameService, audit *service.AuditService) *EmployeeNameHandler {
	return &EmployeeNameHandler{svc: svc, audit: audit}
}

func (h *EmployeeNameHandler) List(c *fiber.Ctx) error {
	var isActive *bool
	if q := c.Query("isActive"); q != "" {
		v := q == "true"
		isActive = &v
	}
	filters := domain.EmployeeNameFilters{
		NormalizedName: c.Query("normalizedName"),
		IsActive:       isActive,
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *EmployeeNameHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *EmployeeNameHandler) Create(c *fiber.Ctx) error {
	var r domain.EmployeeName
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "employee_names", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *EmployeeNameHandler) Update(c *fiber.Ctx) error {
	var r domain.EmployeeName
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "employee_names", c.Params("id"))
	return c.JSON(fiber.Map{"data": updated})
}

func (h *EmployeeNameHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "employee_names", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}
