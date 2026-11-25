package handler

import (
	"errors"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type PermitRowHandler struct {
	svc   *service.PermitRowService
	audit *service.AuditService
}

func NewPermitRowHandler(svc *service.PermitRowService, audit *service.AuditService) *PermitRowHandler {
	return &PermitRowHandler{svc: svc, audit: audit}
}

func (h *PermitRowHandler) List(c *fiber.Ctx) error {
	filters := domain.PermitRowFilters{
		Jobsite:  c.Query("jobsite"),
		Situacao: c.Query("situacao"),
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *PermitRowHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *PermitRowHandler) Create(c *fiber.Ctx) error {
	var r domain.PermitRow
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "permit_control", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *PermitRowHandler) Update(c *fiber.Ctx) error {
	var r domain.PermitRow
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "permit_control", c.Params("id"))
	return c.JSON(fiber.Map{"data": updated})
}

func (h *PermitRowHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "permit_control", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

// Link vincula a obra do HVAC Schedule a uma linha do Permit Control; permitId
// vazio desvincula.
func (h *PermitRowHandler) Link(c *fiber.Ctx) error {
	var body struct {
		PermitID *string `json:"permitId"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.PermitID != nil && *body.PermitID == "" {
		body.PermitID = nil
	}
	switch err := h.svc.LinkProject(c.Context(), c.Params("projectId"), body.PermitID); {
	case errors.Is(err, domain.ErrConflict):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "permit already linked to another project", "code": "CONFLICT"})
	case errors.Is(err, domain.ErrNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "permit not found", "code": "NOT_FOUND"})
	case err != nil:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "link", "permit_control", c.Params("projectId"))
	return c.JSON(fiber.Map{"ok": true})
}
