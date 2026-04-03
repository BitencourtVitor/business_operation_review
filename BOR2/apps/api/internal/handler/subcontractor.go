package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type SubcontractorHandler struct {
	svc *service.SubcontractorService
}

func NewSubcontractorHandler(svc *service.SubcontractorService) *SubcontractorHandler {
	return &SubcontractorHandler{svc: svc}
}

func (h *SubcontractorHandler) List(c *fiber.Ctx) error {
	filters := domain.SubcontractorFilters{
		Company: c.Query("company"),
		Status:  domain.SubcontractorStatus(c.Query("status")),
	}
	list, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *SubcontractorHandler) Get(c *fiber.Ctx) error {
	s, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": s})
}

func (h *SubcontractorHandler) Create(c *fiber.Ctx) error {
	var s domain.SubcontractorPerformance
	if err := c.BodyParser(&s); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &s)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *SubcontractorHandler) UpdateStatus(c *fiber.Ctx) error {
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.UpdateStatus(c.Context(), c.Params("id"), domain.SubcontractorStatus(body.Status))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": updated})
}
