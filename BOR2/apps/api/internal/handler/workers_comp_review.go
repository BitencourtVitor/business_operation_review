package handler

import (
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WorkersCompReviewHandler struct {
	svc *service.WorkersCompReviewService
}

func NewWorkersCompReviewHandler(svc *service.WorkersCompReviewService) *WorkersCompReviewHandler {
	return &WorkersCompReviewHandler{svc: svc}
}

func (h *WorkersCompReviewHandler) Current(c *fiber.Ctx) error {
	cycle, err := h.svc.Current(c.Context(), time.Now())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": cycle})
}

func (h *WorkersCompReviewHandler) UpdateCheck(c *fiber.Ctx) error {
	var body struct {
		Status string `json:"status"`
		Notes  string `json:"notes"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	actorID, _ := c.Locals("userID").(string)
	if err := h.svc.UpdateCheck(c.Context(), c.Params("id"), strings.ToLower(strings.TrimSpace(body.Status)), body.Notes, actorID); err != nil {
		if strings.Contains(err.Error(), "invalid") || strings.Contains(err.Error(), "not found") {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}
