package handler

import (
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type EmailTriggersHandler struct {
	triggers *service.EmailTriggerService
}

func NewEmailTriggersHandler(triggers *service.EmailTriggerService) *EmailTriggersHandler {
	return &EmailTriggersHandler{triggers: triggers}
}

// GET /email-triggers
func (h *EmailTriggersHandler) List(c *fiber.Ctx) error {
	items, err := h.triggers.List(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items})
}

// PUT /email-triggers/:key
func (h *EmailTriggersHandler) Update(c *fiber.Ctx) error {
	var req service.TriggerUpdate
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid payload")
	}
	// A trigger left on with nobody in To would fail silently every run, so it
	// is rejected here instead of being discovered from the logs.
	if req.Enabled && len(req.ToUserIDs) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "an enabled trigger needs at least one primary recipient")
	}

	actor, _ := c.Locals("userID").(string)
	updated, err := h.triggers.Update(c.Context(), c.Params("key"), req, actor)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{"data": updated})
}

// POST /email-triggers/:key/preview
// Renders the message from invented data using the configuration in the body,
// so an edit can be previewed before it is saved.
func (h *EmailTriggersHandler) Preview(c *fiber.Ctx) error {
	var req service.TriggerUpdate
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid payload")
	}
	body, err := h.triggers.Preview(c.Context(), c.Params("key"), req)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{"data": body})
}

// GET /email-triggers/:key/history
func (h *EmailTriggersHandler) History(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit"))
	items, err := h.triggers.History(c.Context(), c.Params("key"), limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items})
}
