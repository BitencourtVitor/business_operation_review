package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WhosWorkingHandler struct {
	svc   *service.WhosWorkingService
	audit *service.AuditService
}

func NewWhosWorkingHandler(svc *service.WhosWorkingService, audit *service.AuditService) *WhosWorkingHandler {
	return &WhosWorkingHandler{svc: svc, audit: audit}
}

// GET /qbtime/whos-working?company=framing
func (h *WhosWorkingHandler) Get(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	data, err := h.svc.GetWhosWorking(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": data})
}

// GET /qbtime/exceptions?company=framing
func (h *WhosWorkingHandler) ListExceptions(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	list, err := h.svc.ListExceptions(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if list == nil {
		list = []*domain.WhosWorkingException{}
	}
	return c.JSON(fiber.Map{"data": list})
}

// POST /qbtime/exceptions
func (h *WhosWorkingHandler) UpsertException(c *fiber.Ctx) error {
	var body struct {
		Company string `json:"company"`
		Name    string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.Company == "" || body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company and name are required", "code": "BAD_REQUEST"})
	}
	result, err := h.svc.UpsertException(c.Context(), body.Company, body.Name)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "upsert", "qbtime_exception", result.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": result})
}

// DELETE /qbtime/exceptions/:id
func (h *WhosWorkingHandler) DeleteException(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.svc.DeleteException(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "qbtime_exception", id)
	return c.SendStatus(fiber.StatusNoContent)
}
