package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type PayableHandler struct {
	svc *service.PayableService
}

func NewPayableHandler(svc *service.PayableService) *PayableHandler {
	return &PayableHandler{svc: svc}
}

func (h *PayableHandler) List(c *fiber.Ctx) error {
	filters := domain.PayableFilters{
		VendorDisplayName: c.Query("vendorDisplayName"),
		Category:          c.Query("category"),
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *PayableHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *PayableHandler) Create(c *fiber.Ctx) error {
	var r domain.PayableAccounting
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *PayableHandler) Update(c *fiber.Ctx) error {
	var r domain.PayableAccounting
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (h *PayableHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
