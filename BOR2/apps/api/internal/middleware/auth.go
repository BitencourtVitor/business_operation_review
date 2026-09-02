package middleware

import (
	"encoding/json"
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/dbactor"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RequireAuth validates that a Bearer token is present.
// Use RequireAuthFull for routes that also need the user identity in locals.
func RequireAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		token, err := extractToken(c)
		if err != nil {
			return err
		}
		c.Locals("token", token)
		return c.Next()
	}
}

// RequireAuthFull validates the token AND resolves the user from the session store,
// populating userID, userName, and userRole in Fiber locals.
// Use this for all protected API routes so handlers have actor context without
// an extra DB round-trip.
func RequireAuthFull(authSvc *service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token, err := extractToken(c)
		if err != nil {
			return err
		}

		user, err := authSvc.GetUserByToken(c.Context(), token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired session",
				"code":  "UNAUTHORIZED",
			})
		}

		c.Locals("token", token)
		c.Locals("userID", user.ID)
		c.Locals("userName", user.Name)
		c.Locals("userRole", string(user.Role))
		// A identidade também segue no contexto do request, e não só nos
		// Locals: é dela que a auditoria de linha tira o autor, e o repositório
		// não enxerga o Fiber.
		c.SetUserContext(dbactor.With(c.UserContext(), dbactor.Actor{
			ID: user.ID, Name: user.Name, Source: "api",
		}))
		return c.Next()
	}
}

// RequireRole restricts access to specific roles.
// Must be used after RequireAuthFull so that userRole is available in locals.
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole, ok := c.Locals("userRole").(string)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "forbidden",
				"code":  "FORBIDDEN",
			})
		}
		for _, role := range roles {
			if userRole == role {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "insufficient permissions",
			"code":  "FORBIDDEN",
		})
	}
}

// RequirePermission restricts a route to users with a permission key.
// It must be used after RequireAuthFull so userID/userRole are available.
func RequirePermission(db *pgxpool.Pool, key string, level string) fiber.Handler {
	fullAccessRoles := map[string]bool{"dev": true, "owner": true, "admin": true, "manager": true}
	return func(c *fiber.Ctx) error {
		userRole, _ := c.Locals("userRole").(string)
		if fullAccessRoles[userRole] {
			return c.Next()
		}

		userID, ok := c.Locals("userID").(string)
		if !ok || userID == "" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "forbidden",
				"code":  "FORBIDDEN",
			})
		}

		var raw []byte
		if err := db.QueryRow(c.Context(), `
			SELECT permissions FROM user_permissions WHERE user_id = $1
		`, userID).Scan(&raw); err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "insufficient permissions",
				"code":  "FORBIDDEN",
			})
		}

		permissions := map[string]string{}
		if err := json.Unmarshal(raw, &permissions); err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "insufficient permissions",
				"code":  "FORBIDDEN",
			})
		}

		actual := permissions[key]
		if actual == "write" || (level == "read" && actual == "read") {
			return c.Next()
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "insufficient permissions",
			"code":  "FORBIDDEN",
		})
	}
}

// RequireAtlas guarda o Atlas enquanto ele está em construção.
//
// Entra quem tem cargo acima de `user` — dev, owner, admin, manager — e o
// `user` que recebeu a chave `atlas` na tela de usuários do Atlas. Quem manda
// na obra já manda no Atlas por definição; o `user` é convidado um a um,
// porque é ele que pode ser um subcontratado.
func RequireAtlas(db *pgxpool.Pool) fiber.Handler {
	privileged := map[string]bool{"dev": true, "owner": true, "admin": true, "manager": true, "gestor": true}
	return func(c *fiber.Ctx) error {
		if role, _ := c.Locals("userRole").(string); privileged[role] {
			return c.Next()
		}
		userID, _ := c.Locals("userID").(string)
		if userID != "" {
			var level string
			err := db.QueryRow(c.Context(), `
				SELECT COALESCE(permissions->>'atlas', '')
				FROM user_permissions WHERE user_id = $1`, userID).Scan(&level)
			if err == nil && level != "" {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "no access to Atlas", "code": "FORBIDDEN",
		})
	}
}

// RequireCronOrAdmin allows the request if either:
//   - The X-Cron-Secret header matches the configured cronSecret, OR
//   - A valid Bearer token belongs to a dev/owner/admin user.
//
// Use this for internal trigger endpoints (e.g. POST /ofi/calculate) that
// must be callable by the cron job service without a user session.
func RequireCronOrAdmin(cronSecret string, authSvc *service.AuthService) fiber.Handler {
	adminRoles := map[string]bool{"dev": true, "owner": true, "admin": true}
	return func(c *fiber.Ctx) error {
		// 1. Cron secret path — fast, no DB round-trip
		if cronSecret != "" && c.Get("X-Cron-Secret") == cronSecret {
			c.Locals("userID", "cron")
			c.Locals("userName", "cron-job")
			c.Locals("userRole", "dev")
			return c.Next()
		}

		// 2. Authenticated admin path
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization or cron secret",
				"code":  "UNAUTHORIZED",
			})
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization header",
				"code":  "UNAUTHORIZED",
			})
		}
		user, err := authSvc.GetUserByToken(c.Context(), parts[1])
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired session",
				"code":  "UNAUTHORIZED",
			})
		}
		if !adminRoles[string(user.Role)] {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "insufficient permissions",
				"code":  "FORBIDDEN",
			})
		}
		c.Locals("token", parts[1])
		c.Locals("userID", user.ID)
		c.Locals("userName", user.Name)
		c.Locals("userRole", string(user.Role))
		return c.Next()
	}
}

// RequireServiceSecret allows the request only if the X-Service-Secret header
// matches secret. For trusted machine-to-machine callers (e.g. AutoAccounting)
// that need no user session — deliberately separate from the cron secret so
// the two blast radiuses don't overlap.
func RequireServiceSecret(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if secret == "" || c.Get("X-Service-Secret") != secret {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing or invalid service secret",
				"code":  "UNAUTHORIZED",
			})
		}
		c.Locals("userID", "service")
		c.Locals("userRole", "service")
		return c.Next()
	}
}

func extractToken(c *fiber.Ctx) (string, error) {
	// Return a fiber.Error (not c.Status().JSON(), which returns nil and would let
	// the caller fall through to c.Next() — that was an auth bypass: the handler
	// ran anyway, leaking data/executing writes behind a spurious 401). Callers do
	// `if err != nil { return err }`, so a non-nil error aborts the chain and the
	// errorHandler renders it.
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "missing authorization header")
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", fiber.NewError(fiber.StatusUnauthorized, "invalid authorization header format")
	}
	if parts[1] == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "missing token")
	}
	return parts[1], nil
}
