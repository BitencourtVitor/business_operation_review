package handler

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func cryptoRandN(max int64) (int64, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		return 0, err
	}
	return n.Int64(), nil
}

type SettingsHandler struct {
	db    *pgxpool.Pool
	audit *service.AuditService
}

func NewSettingsHandler(db *pgxpool.Pool, audit *service.AuditService) *SettingsHandler {
	return &SettingsHandler{db: db, audit: audit}
}

// Screen represents a page/tela in the system
type Screen struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

// UserWithPermissions represents a user and their screen permissions
type UserWithPermissions struct {
	ID          string            `json:"id"`
	Email       string            `json:"email"`
	Name        string            `json:"name"`
	Role        string            `json:"role"`
	Permissions map[string]string `json:"permissions"` // values: "read" | "write"
}

// PermissionUpdateReq is the request body for updating user permissions
type PermissionUpdateReq struct {
	Permissions map[string]string `json:"permissions"` // values: "read" | "write"
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

	return c.JSON(fiber.Map{"data": screens})
}

// GetUsers returns all users with their screen permissions
// GET /api/v1/settings/users
func (h *SettingsHandler) GetUsers(c *fiber.Ctx) error {
	// 1. Fetch users
	rows, err := h.db.Query(c.Context(), `
		SELECT id, email, name, role FROM users ORDER BY email
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to fetch users: %v", err)})
	}
	defer rows.Close()

	var users []UserWithPermissions
	idxByID := make(map[string]int)
	for rows.Next() {
		var u UserWithPermissions
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("scan error: %v", err)})
		}
		u.Permissions = map[string]string{}
		idxByID[u.ID] = len(users)
		users = append(users, u)
	}
	rows.Close()

	if users == nil {
		users = []UserWithPermissions{}
	}

	// 2. Overlay permissions — graceful fallback if table doesn't exist yet
	permRows, err := h.db.Query(c.Context(), `
		SELECT user_id, permissions FROM user_permissions
	`)
	if err == nil {
		defer permRows.Close()
		for permRows.Next() {
			var userID string
			var permJSON []byte
			if err := permRows.Scan(&userID, &permJSON); err != nil {
				continue
			}
			if idx, ok := idxByID[userID]; ok {
				var perms map[string]string
				if json.Unmarshal(permJSON, &perms) == nil && perms != nil {
					users[idx].Permissions = perms
				}
			}
		}
	}

	return c.JSON(fiber.Map{"data": users})
}

// requireAdminRole checks that the current session belongs to an admin-level user.
func (h *SettingsHandler) requireAdminRole(c *fiber.Ctx) (string, error) {
	token, _ := c.Locals("token").(string)
	var userID, role string
	err := h.db.QueryRow(c.Context(), `
		SELECT u.id, u.role FROM users u
		JOIN sessions s ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > NOW()
	`, token).Scan(&userID, &role)
	if err != nil {
		return "", fmt.Errorf("invalid session")
	}
	if role != "admin" && role != "dev" && role != "owner" {
		return "", fmt.Errorf("forbidden")
	}
	return userID, nil
}

type createUserReq struct {
	Name  string      `json:"name"`
	Email string      `json:"email"`
	Role  domain.Role `json:"role"`
}

type updateUserReq struct {
	Name  string      `json:"name"`
	Email string      `json:"email"`
	Role  domain.Role `json:"role"`
}

// CreateUser creates a new user with a provisional password.
// POST /api/v1/settings/users
func (h *SettingsHandler) CreateUser(c *fiber.Ctx) error {
	if _, err := h.requireAdminRole(c); err != nil {
		code := fiber.StatusForbidden
		if err.Error() == "invalid session" {
			code = fiber.StatusUnauthorized
		}
		return c.Status(code).JSON(fiber.Map{"error": err.Error()})
	}

	var req createUserReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" || req.Email == "" || req.Role == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name, email and role are required"})
	}

	// Generate provisional password (same as ForgotPassword flow)
	tempPass, err := generateSettingsPassword(10)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate password"})
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), 12)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to hash password"})
	}

	userID := uuid.NewString()
	now := time.Now()
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO users (id, email, name, role, password_hash, provisional_password, financial_pass, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, true, false, $6, $6)
	`, userID, req.Email, req.Name, string(req.Role), string(hash), now)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to create user: %v", err)})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "create", "users", userID)
	return c.Status(201).JSON(fiber.Map{
		"data": fiber.Map{
			"id":                userID,
			"name":              req.Name,
			"email":             req.Email,
			"role":              req.Role,
			"provisionalPassword": tempPass,
		},
	})
}

// UpdateUser updates a user's name, email and role.
// PUT /api/v1/settings/users/:id
func (h *SettingsHandler) UpdateUser(c *fiber.Ctx) error {
	if _, err := h.requireAdminRole(c); err != nil {
		code := fiber.StatusForbidden
		if err.Error() == "invalid session" {
			code = fiber.StatusUnauthorized
		}
		return c.Status(code).JSON(fiber.Map{"error": err.Error()})
	}

	userID := c.Params("id")
	var req updateUserReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" || req.Email == "" || req.Role == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name, email and role are required"})
	}

	_, err := h.db.Exec(c.Context(), `
		UPDATE users SET name=$1, email=$2, role=$3, updated_at=NOW() WHERE id=$4
	`, req.Name, req.Email, string(req.Role), userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to update user: %v", err)})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "users", c.Params("id"))
	return c.JSON(fiber.Map{"data": fiber.Map{"message": "user updated"}})
}

// DeleteUser removes a user from the system.
// DELETE /api/v1/settings/users/:id
func (h *SettingsHandler) DeleteUser(c *fiber.Ctx) error {
	callerID, err := h.requireAdminRole(c)
	if err != nil {
		code := fiber.StatusForbidden
		if err.Error() == "invalid session" {
			code = fiber.StatusUnauthorized
		}
		return c.Status(code).JSON(fiber.Map{"error": err.Error()})
	}

	userID := c.Params("id")
	if userID == callerID {
		return c.Status(400).JSON(fiber.Map{"error": "cannot delete yourself"})
	}

	_, err = h.db.Exec(c.Context(), `DELETE FROM users WHERE id=$1`, userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to delete user: %v", err)})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "users", c.Params("id"))
	return c.JSON(fiber.Map{"data": nil})
}

// ResetUserPassword generates a new provisional password for a user.
// POST /api/v1/settings/users/:id/reset-password
func (h *SettingsHandler) ResetUserPassword(c *fiber.Ctx) error {
	if _, err := h.requireAdminRole(c); err != nil {
		code := fiber.StatusForbidden
		if err.Error() == "invalid session" {
			code = fiber.StatusUnauthorized
		}
		return c.Status(code).JSON(fiber.Map{"error": err.Error()})
	}

	userID := c.Params("id")
	tempPass, err := generateSettingsPassword(10)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate password"})
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), 12)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to hash password"})
	}
	_, err = h.db.Exec(c.Context(), `
		UPDATE users SET password_hash=$1, provisional_password=true, updated_at=NOW() WHERE id=$2
	`, string(hash), userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to reset password"})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "reset_password", "users", c.Params("id"))
	return c.JSON(fiber.Map{"data": fiber.Map{"provisionalPassword": tempPass}})
}

// GetMyPermissions returns the authenticated user's own screen permissions.
// GET /api/v1/settings/me/permissions
func (h *SettingsHandler) GetMyPermissions(c *fiber.Ctx) error {
	token, _ := c.Locals("token").(string)
	var userID, role string
	err := h.db.QueryRow(c.Context(), `
		SELECT u.id, u.role FROM users u
		JOIN sessions s ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > NOW()
	`, token).Scan(&userID, &role)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid session"})
	}

	permissions := map[string]string{}
	var permJSON []byte
	if err := h.db.QueryRow(c.Context(), `
		SELECT permissions FROM user_permissions WHERE user_id = $1
	`, userID).Scan(&permJSON); err == nil && permJSON != nil {
		json.Unmarshal(permJSON, &permissions) //nolint:errcheck
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"role":        role,
		"permissions": permissions,
	}})
}

func generateSettingsPassword(length int) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$"
	result := make([]byte, length)
	for i := range result {
		n, err := cryptoRandN(int64(len(charset)))
		if err != nil {
			return "", err
		}
		result[i] = charset[n]
	}
	return string(result), nil
}

// UpdateUserPermissions updates the screens a user can access
// PATCH /api/v1/settings/users/:id/permissions
func (h *SettingsHandler) UpdateUserPermissions(c *fiber.Ctx) error {
	if _, err := h.requireAdminRole(c); err != nil {
		code := fiber.StatusForbidden
		if err.Error() == "invalid session" {
			code = fiber.StatusUnauthorized
		}
		return c.Status(code).JSON(fiber.Map{"error": err.Error()})
	}

	userID := c.Params("id")

	var req PermissionUpdateReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("invalid request: %v", err)})
	}
	if req.Permissions == nil {
		req.Permissions = map[string]string{}
	}

	permJSON, err := json.Marshal(req.Permissions)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to encode permissions"})
	}

	_, err = h.db.Exec(c.Context(), `
		INSERT INTO user_permissions (user_id, permissions, updated_at)
		VALUES ($1, $2::jsonb, NOW())
		ON CONFLICT (user_id) DO UPDATE
		  SET permissions = EXCLUDED.permissions,
		      updated_at  = NOW()
	`, userID, string(permJSON))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("failed to update permissions: %v", err)})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update_permissions", "user_permissions", c.Params("id"))
	return c.JSON(fiber.Map{"data": fiber.Map{"message": "permissions updated"}})
}
