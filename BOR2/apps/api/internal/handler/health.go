package handler

import (
	"github.com/gofiber/fiber/v2"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// Health godoc
// @Summary     Health check
// @Description Returns API status
// @Tags        system
// @Produce     json
// @Success     200 {object} map[string]string
// @Router      /health [get]
func (h *HealthHandler) Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "ok",
		"version": "1.0.0",
	})
}
