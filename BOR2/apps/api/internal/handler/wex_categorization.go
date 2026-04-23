package handler

import (
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WexCategorizationHandler struct {
	svc *service.WexCategorizationService
}

func NewWexCategorizationHandler(svc *service.WexCategorizationService) *WexCategorizationHandler {
	return &WexCategorizationHandler{svc: svc}
}

// ─── Normalization endpoints ──────────────────────────────────────────────────

// GET /wex/normalization?company=hvac
func (h *WexCategorizationHandler) ListNorm(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	entries, err := h.svc.ListNorm(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if entries == nil {
		entries = []*domain.WexNormEntry{}
	}
	return c.JSON(fiber.Map{"data": entries})
}

// POST /wex/normalization
func (h *WexCategorizationHandler) UpsertNorm(c *fiber.Ctx) error {
	var in domain.WexNormInput
	if err := c.BodyParser(&in); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if in.Company == "" || in.DriverID == "" || in.QbName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company, driverId, and qbName are required", "code": "BAD_REQUEST"})
	}
	entry, err := h.svc.UpsertNorm(c.Context(), &in)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": entry})
}

// PUT /wex/normalization/:id
func (h *WexCategorizationHandler) UpdateNorm(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	var in domain.WexNormInput
	if err := c.BodyParser(&in); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	entry, err := h.svc.UpdateNorm(c.Context(), id, &in)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": entry})
}

// DELETE /wex/normalization/:id
func (h *WexCategorizationHandler) DeleteNorm(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	if err := h.svc.DeleteNorm(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── Report endpoints ─────────────────────────────────────────────────────────

// GET /wex/reports?company=hvac
func (h *WexCategorizationHandler) ListReports(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	reports, err := h.svc.ListReports(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if reports == nil {
		reports = []*domain.WexReport{}
	}
	return c.JSON(fiber.Map{"data": reports})
}

// GET /wex/reports/:id
func (h *WexCategorizationHandler) GetReport(c *fiber.Ctx) error {
	rep, err := h.svc.GetReport(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": rep})
}

// POST /wex/reports
func (h *WexCategorizationHandler) CreateReport(c *fiber.Ctx) error {
	var in domain.WexReportInput
	if err := c.BodyParser(&in); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if in.Company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	rep, err := h.svc.CreateReport(c.Context(), &in)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": rep})
}

// DELETE /wex/reports/:id
func (h *WexCategorizationHandler) DeleteReport(c *fiber.Ctx) error {
	if err := h.svc.DeleteReport(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
