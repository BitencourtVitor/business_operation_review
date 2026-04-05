package handler

import (
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

// Roles allowed to create/update/delete notifications and view ListAll.
var notifAdminRoles = map[string]bool{
	"admin": true,
	"dev":   true,
	"owner": true,
}

type NotificationHandler struct {
	svc     *service.NotificationService
	authSvc *service.AuthService
}

func NewNotificationHandler(svc *service.NotificationService, authSvc *service.AuthService) *NotificationHandler {
	return &NotificationHandler{svc: svc, authSvc: authSvc}
}

func (h *NotificationHandler) resolveUser(c *fiber.Ctx) (*domain.User, error) {
	token, _ := c.Locals("token").(string)
	return h.authSvc.GetUserByToken(c.Context(), token)
}

// GET /api/v1/notifications — current user's active notifications
func (h *NotificationHandler) List(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	items, err := h.svc.List(c.Context(), user.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if items == nil {
		items = []*domain.Notification{}
	}
	return c.JSON(fiber.Map{"data": items})
}

// GET /api/v1/notifications/all — all notifications (admin only)
func (h *NotificationHandler) ListAll(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !notifAdminRoles[string(user.Role)] {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	items, err := h.svc.ListAll(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if items == nil {
		items = []*domain.Notification{}
	}
	return c.JSON(fiber.Map{"data": items})
}

// POST /api/v1/notifications — create (admin/dev/owner only)
func (h *NotificationHandler) Create(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !notifAdminRoles[string(user.Role)] {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}

	var n domain.Notification
	if err := c.BodyParser(&n); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if n.Title == "" || n.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title and content are required", "code": "BAD_REQUEST"})
	}
	n.CreatedBy = user.ID

	created, err := h.svc.Create(c.Context(), &n)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

// PUT /api/v1/notifications/:id — update scheduled notification (admin only)
func (h *NotificationHandler) Update(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !notifAdminRoles[string(user.Role)] {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}

	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}

	var n domain.Notification
	if err := c.BodyParser(&n); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}

	updated, err := h.svc.Update(c.Context(), id, &n)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

// PATCH /api/v1/notifications/:id/viewed — mark as viewed (any user)
func (h *NotificationHandler) MarkViewed(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if err := h.svc.MarkViewed(c.Context(), id, user.ID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"message": "marked as viewed"}})
}

// DELETE /api/v1/notifications/:id — delete (admin only)
func (h *NotificationHandler) Delete(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !notifAdminRoles[string(user.Role)] {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}

	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	if err := h.svc.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": nil})
}
