package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/validator"
	"github.com/gofiber/fiber/v2"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
			"code":  "BAD_REQUEST",
		})
	}

	var errs validator.ValidationErrors
	if e := validator.Required("email", req.Email); e != nil {
		errs = append(errs, *e)
	}
	if e := validator.Email("email", req.Email); e != nil {
		errs = append(errs, *e)
	}
	if e := validator.Required("password", req.Password); e != nil {
		errs = append(errs, *e)
	}
	if len(errs) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":  "validation failed",
			"code":   "VALIDATION_ERROR",
			"fields": errs,
		})
	}

	result, err := h.authService.Login(c.Context(), req.Email, req.Password)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid credentials",
			"code":  "UNAUTHORIZED",
		})
	}

	return c.JSON(fiber.Map{"data": result})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	token, _ := c.Locals("token").(string)
	if err := h.authService.Logout(c.Context(), token); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to logout",
			"code":  "INTERNAL_ERROR",
		})
	}
	return c.JSON(fiber.Map{"message": "logged out"})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	token, _ := c.Locals("token").(string)
	user, err := h.authService.GetUserByToken(c.Context(), token)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid session",
			"code":  "UNAUTHORIZED",
		})
	}
	return c.JSON(fiber.Map{"data": user})
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) ForgotPassword(c *fiber.Ctx) error {
	var req forgotPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
			"code":  "BAD_REQUEST",
		})
	}

	if e := validator.Email("email", req.Email); e != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid email",
			"code":  "VALIDATION_ERROR",
		})
	}

	// Always return success to not reveal if email exists
	_ = h.authService.ForgotPassword(c.Context(), req.Email)

	return c.JSON(fiber.Map{"message": "if the email exists, a temporary password has been sent"})
}

type changePasswordRequest struct {
	NewPassword string `json:"newPassword"`
}

func (h *AuthHandler) ChangePassword(c *fiber.Ctx) error {
	var req changePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
			"code":  "BAD_REQUEST",
		})
	}

	if e := validator.MinLength("newPassword", req.NewPassword, 8); e != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "password must be at least 8 characters",
			"code":  "VALIDATION_ERROR",
		})
	}

	token, _ := c.Locals("token").(string)
	user, err := h.authService.GetUserByToken(c.Context(), token)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid session",
			"code":  "UNAUTHORIZED",
		})
	}

	if err := h.authService.ChangePassword(c.Context(), user.ID, req.NewPassword); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to change password",
			"code":  "INTERNAL_ERROR",
		})
	}

	return c.JSON(fiber.Map{"message": "password changed successfully"})
}
