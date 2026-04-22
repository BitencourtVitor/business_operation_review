package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type AIChatHandler struct {
	svc     *service.AIService
	authSvc *service.AuthService
}

func NewAIChatHandler(svc *service.AIService, authSvc *service.AuthService) *AIChatHandler {
	return &AIChatHandler{svc: svc, authSvc: authSvc}
}

// resolveUserID extracts the token from Fiber locals (set by RequireAuth middleware)
// and resolves the user ID via a session lookup — same pattern as other handlers.
func (h *AIChatHandler) resolveUserID(c *fiber.Ctx) (string, error) {
	token, _ := c.Locals("token").(string)
	user, err := h.authSvc.GetUserByToken(c.Context(), token)
	if err != nil {
		return "", err
	}
	return user.ID, nil
}

// POST /api/v1/ai/chat
func (h *AIChatHandler) Chat(c *fiber.Ctx) error {
	userID, err := h.resolveUserID(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req service.ChatRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if req.Company == "" {
		return c.Status(400).JSON(fiber.Map{"error": "company is required"})
	}

	reply, err := h.svc.Chat(c.Context(), userID, req)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": reply})
}

// GET /api/v1/ai/conversations?company=
func (h *AIChatHandler) ListConversations(c *fiber.Ctx) error {
	userID, err := h.resolveUserID(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	company := c.Query("company")
	if company == "" {
		return c.Status(400).JSON(fiber.Map{"error": "company is required"})
	}

	convs, err := h.svc.ListConversations(c.Context(), userID, company)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": convs})
}

// DELETE /api/v1/ai/conversations/:id
func (h *AIChatHandler) DeleteConversation(c *fiber.Ctx) error {
	userID, err := h.resolveUserID(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Params("id")
	if err := h.svc.DeleteConversation(c.Context(), id, userID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// PATCH /api/v1/ai/conversations/:id/title
func (h *AIChatHandler) UpdateTitle(c *fiber.Ctx) error {
	userID, err := h.resolveUserID(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Params("id")

	var body struct {
		Title string `json:"title"`
	}
	if err := c.BodyParser(&body); err != nil || body.Title == "" {
		return c.Status(400).JSON(fiber.Map{"error": "title is required"})
	}

	if err := h.svc.UpdateTitle(c.Context(), id, userID, body.Title); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// GET /api/v1/ai/conversations/:id/messages
func (h *AIChatHandler) ListMessages(c *fiber.Ctx) error {
	userID, err := h.resolveUserID(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Params("id")
	msgs, err := h.svc.ListMessages(c.Context(), id, userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": msgs})
}

// GET /api/v1/ai/context/:company
func (h *AIChatHandler) GetContext(c *fiber.Ctx) error {
	company := c.Params("company")
	ctx, err := h.svc.GetCompanyContext(c.Context(), company)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": ctx})
}

// PATCH /api/v1/ai/context/:company
func (h *AIChatHandler) UpsertContext(c *fiber.Ctx) error {
	company := c.Params("company")
	var body struct {
		Context string `json:"context"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.svc.UpsertCompanyContext(c.Context(), company, body.Context); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}
