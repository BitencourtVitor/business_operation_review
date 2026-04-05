package handler

import (
	"encoding/json"
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Roles that bypass permission checks — always have full access.
var notifAdminRoles = map[string]bool{
	"admin": true,
	"dev":   true,
	"owner": true,
}

type NotificationHandler struct {
	svc     *service.NotificationService
	authSvc *service.AuthService
	db      *pgxpool.Pool
}

func NewNotificationHandler(svc *service.NotificationService, authSvc *service.AuthService, db *pgxpool.Pool) *NotificationHandler {
	return &NotificationHandler{svc: svc, authSvc: authSvc, db: db}
}

func (h *NotificationHandler) resolveUser(c *fiber.Ctx) (*domain.User, error) {
	token, _ := c.Locals("token").(string)
	return h.authSvc.GetUserByToken(c.Context(), token)
}

// permLevel returns the permission level ("read"/"write"/"") for a given key.
func (h *NotificationHandler) permLevel(c *fiber.Ctx, userID, key string) string {
	var permJSON []byte
	err := h.db.QueryRow(c.Context(),
		`SELECT permissions FROM user_permissions WHERE user_id = $1`, userID,
	).Scan(&permJSON)
	if err != nil {
		return ""
	}
	var perms map[string]string
	if err := json.Unmarshal(permJSON, &perms); err != nil {
		return ""
	}
	return perms[key]
}

// canManageNotifications returns true if the user may create/edit/delete notifications.
func (h *NotificationHandler) canManageNotifications(c *fiber.Ctx, user *domain.User) bool {
	return notifAdminRoles[string(user.Role)] ||
		h.permLevel(c, user.ID, "settings_notifications") == "write"
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

// GET /api/v1/notifications/all — management view
// dev/owner/admin → all notifications
// settings_notifications:write → only own notifications
// else → 403
func (h *NotificationHandler) ListAll(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}

	var items []*domain.Notification
	if notifAdminRoles[string(user.Role)] {
		items, err = h.svc.ListAll(c.Context())
	} else if h.permLevel(c, user.ID, "settings_notifications") == "write" {
		items, err = h.svc.ListByCreator(c.Context(), user.ID)
	} else {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if items == nil {
		items = []*domain.Notification{}
	}
	return c.JSON(fiber.Map{"data": items})
}

// POST /api/v1/notifications — create
// allowed: admin/dev/owner OR settings_notifications:write
func (h *NotificationHandler) Create(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !h.canManageNotifications(c, user) {
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

// PUT /api/v1/notifications/:id — update
// admin/dev/owner → any notification
// settings_notifications:write → only own notifications
func (h *NotificationHandler) Update(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !h.canManageNotifications(c, user) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}

	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}

	// Non-admin managers can only update their own notifications
	if !notifAdminRoles[string(user.Role)] {
		var createdBy string
		_ = h.db.QueryRow(c.Context(), `SELECT created_by FROM notifications WHERE id = $1`, id).Scan(&createdBy)
		if createdBy != user.ID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
		}
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

// DELETE /api/v1/notifications/:id — delete
// admin/dev/owner → any notification
// settings_notifications:write → only own notifications
func (h *NotificationHandler) Delete(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid session", "code": "UNAUTHORIZED"})
	}
	if !h.canManageNotifications(c, user) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}

	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}

	// Non-admin managers can only delete their own notifications
	if !notifAdminRoles[string(user.Role)] {
		var createdBy string
		_ = h.db.QueryRow(c.Context(), `SELECT created_by FROM notifications WHERE id = $1`, id).Scan(&createdBy)
		if createdBy != user.ID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
		}
	}

	if err := h.svc.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": nil})
}
