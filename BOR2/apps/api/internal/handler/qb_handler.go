package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type QBHandler struct {
	oauth *service.QBOAuthService
}

func NewQBHandler(oauth *service.QBOAuthService) *QBHandler {
	return &QBHandler{oauth: oauth}
}

// GET /api/v1/qb/auth?company=hvac
// Redirects browser to QuickBooks OAuth consent screen.
func (h *QBHandler) Auth(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company query param required (hvac|framing|pcg)")
	}

	authURL, err := h.oauth.AuthURL(company)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	return c.Redirect(authURL, fiber.StatusTemporaryRedirect)
}

// GET /api/v1/qb/callback?code=...&realmId=...&state=hvac
// QuickBooks redirects here after user authorizes. Exchanges code for tokens.
func (h *QBHandler) Callback(c *fiber.Ctx) error {
	code    := c.Query("code")
	realmID := c.Query("realmId")
	company := c.Query("state") // we passed company as state

	if code == "" || realmID == "" || company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing code, realmId or state")
	}

	if err := h.oauth.ExchangeCode(c.Context(), company, code, realmID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{
		"ok":      true,
		"company": company,
		"message": "QuickBooks authorization successful — tokens saved",
	})
}

// POST /api/v1/qb/refresh?company=hvac  (dev/admin utility)
func (h *QBHandler) Refresh(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company query param required")
	}

	if _, err := h.oauth.RefreshTokens(c.Context(), company); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{"ok": true, "company": company, "message": "tokens refreshed"})
}
