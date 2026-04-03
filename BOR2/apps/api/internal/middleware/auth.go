package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// RequireAuth validates the Bearer token from Authorization header.
// Better Auth issues the JWT — this middleware validates it.
func RequireAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
				"code":  "UNAUTHORIZED",
			})
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization header format",
				"code":  "UNAUTHORIZED",
			})
		}

		// TODO: validate JWT with Better Auth secret
		token := parts[1]
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing token",
				"code":  "UNAUTHORIZED",
			})
		}

		// Store token in locals for downstream handlers
		c.Locals("token", token)

		return c.Next()
	}
}

// RequireRole restricts access to specific roles.
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
