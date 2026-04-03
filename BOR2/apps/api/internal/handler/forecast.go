package handler

import (
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type ForecastHandler struct {
	svc *service.ForecastService
}

func NewForecastHandler(svc *service.ForecastService) *ForecastHandler {
	return &ForecastHandler{svc: svc}
}

func (h *ForecastHandler) List(c *fiber.Ctx) error {
	year, _ := strconv.Atoi(c.Query("year"))
	filters := domain.ForecastFilters{
		Company: c.Query("company"),
		Status:  domain.ForecastStatus(c.Query("status")),
		Year:    year,
	}
	projects, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": projects})
}

func (h *ForecastHandler) Get(c *fiber.Ctx) error {
	p, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": p})
}

func (h *ForecastHandler) Create(c *fiber.Ctx) error {
	var p domain.ForecastProject
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &p)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *ForecastHandler) Update(c *fiber.Ctx) error {
	var p domain.ForecastProject
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &p)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (h *ForecastHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
