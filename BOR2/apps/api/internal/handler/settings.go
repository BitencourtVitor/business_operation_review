package handler

import (
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SettingsHandler struct {
	db *pgxpool.Pool
}

func NewSettingsHandler(db *pgxpool.Pool) *SettingsHandler {
	return &SettingsHandler{db: db}
}

// Screen represents a page/tela in the system
type Screen struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

// UserWithPermissions represents a user and their screen permissions
type UserWithPermissions struct {
	ID    string   `json:"id"`
	Email string   `json:"email"`
	Name  string   `json:"name"`
	Role  string   `json:"role"`
	Telas []string `json:"telas"` // Array of tela IDs they have access to
}

// PermissionUpdateReq is the request body for updating user permissions
type PermissionUpdateReq struct {
	Telas []string `json:"telas"` // Array of tela IDs to assign
}

// GetScreens returns all available screens/telas
// GET /api/v1/settings/screens
func (h *SettingsHandler) GetScreens(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `SELECT id, descricao FROM telas ORDER BY descricao`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to fetch screens: %v", err)})
	}
	defer rows.Close()

	var screens []Screen
	for rows.Next() {
		var s Screen
		if err := rows.Scan(&s.ID, &s.Description); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("scan error: %v", err)})
		}
		screens = append(screens, s)
	}

	if screens == nil {
		screens = []Screen{}
	}

	return c.JSON(screens)
}

// GetUsers returns all users with their screen permissions
// GET /api/v1/settings/users
func (h *SettingsHandler) GetUsers(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT u.id, u.email, u.name, u.role
		FROM users u
		ORDER BY u.email
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to fetch users: %v", err)})
	}
	defer rows.Close()

	var users []UserWithPermissions
	userIDMap := make(map[string]*UserWithPermissions)

	for rows.Next() {
		var u UserWithPermissions
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("scan error: %v", err)})
		}
		u.Telas = []string{}
		users = append(users, u)
		userIDMap[u.ID] = &users[len(users)-1]
	}

	// Fetch permissions for each user
	permRows, err := h.db.Query(c.Context(), `
		SELECT usuario_id, tela_id FROM usuarios_telas ORDER BY usuario_id
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to fetch permissions: %v", err)})
	}
	defer permRows.Close()

	for permRows.Next() {
		var userID, telaID string
		if err := permRows.Scan(&userID, &telaID); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("scan error: %v", err)})
		}
		if u, ok := userIDMap[userID]; ok {
			u.Telas = append(u.Telas, telaID)
		}
	}

	if users == nil {
		users = []UserWithPermissions{}
	}

	return c.JSON(users)
}

// UpdateUserPermissions updates the screens a user can access
// PATCH /api/v1/settings/users/:id/permissions
func (h *SettingsHandler) UpdateUserPermissions(c *fiber.Ctx) error {
	userID := c.Params("id")

	// Only admin or dev can update permissions
	authUser := c.Locals("user").(*domain.User)
	if authUser.Role != "admin" && authUser.Role != "dev" && authUser.Role != "owner" {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
	}

	var req PermissionUpdateReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("invalid request: %v", err)})
	}

	// Start transaction
	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("transaction error: %v", err)})
	}
	defer tx.Rollback(c.Context())

	// Delete existing permissions
	_, err = tx.Exec(c.Context(), `DELETE FROM usuarios_telas WHERE usuario_id = $1`, userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("delete error: %v", err)})
	}

	// Insert new permissions
	for _, telaID := range req.Telas {
		_, err := tx.Exec(c.Context(), `
			INSERT INTO usuarios_telas (usuario_id, tela_id) VALUES ($1, $2)
		`, userID, telaID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("insert error: %v", err)})
		}
	}

	// Commit transaction
	if err := tx.Commit(c.Context()); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("commit error: %v", err)})
	}

	return c.JSON(fiber.Map{"message": "permissions updated"})
}
