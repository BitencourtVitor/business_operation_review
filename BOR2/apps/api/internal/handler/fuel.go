package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/gofiber/fiber/v2"
)

type FuelHandler struct {
	samsaraRepo repository.SamsaraRepository
	wexRepo     repository.WexRepository
}

func NewFuelHandler(samsaraRepo repository.SamsaraRepository, wexRepo repository.WexRepository) *FuelHandler {
	return &FuelHandler{samsaraRepo: samsaraRepo, wexRepo: wexRepo}
}

func (h *FuelHandler) ListSamsara(c *fiber.Ctx) error {
	filters := domain.FuelFilters{
		DriverName: c.Query("driver"),
	}
	events, err := h.samsaraRepo.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": events})
}

func (h *FuelHandler) ListWex(c *fiber.Ctx) error {
	filters := domain.FuelFilters{
		DriverName: c.Query("driver"),
	}
	txs, err := h.wexRepo.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": txs})
}
