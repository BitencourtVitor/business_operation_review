package middleware

import (
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
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

		c.Locals("token",    token)
		c.Locals("userID",   user.ID)
		c.Locals("userName", user.Name)
		c.Locals("userRole", string(user.Role))
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

func extractToken(c *fiber.Ctx) (string, error) {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return "", c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "missing authorization header",
			"code":  "UNAUTHORIZED",
		})
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid authorization header format",
			"code":  "UNAUTHORIZED",
		})
	}
	if parts[1] == "" {
		return "", c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "missing token",
			"code":  "UNAUTHORIZED",
		})
	}
	return parts[1], nil
}
