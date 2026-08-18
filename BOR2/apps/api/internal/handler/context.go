package handler

import "github.com/gofiber/fiber/v2"

// actor extracts the authenticated user's ID and display name from Fiber locals.
// These are set by middleware.RequireAuthFull on every protected request.
func actor(c *fiber.Ctx) (userID, userName string) {
	userID, _   = c.Locals("userID").(string)
	userName, _ = c.Locals("userName").(string)
	return
}

// actorRole is the authenticated user's role at the time of the request.
func actorRole(c *fiber.Ctx) string {
	role, _ := c.Locals("userRole").(string)
	return role
}
