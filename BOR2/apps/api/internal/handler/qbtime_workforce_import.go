package handler

import (
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type QBTimeWorkforceImportHandler struct {
	svc   *service.QBTimeWorkforceImportService
	audit *service.AuditService
}

func NewQBTimeWorkforceImportHandler(
	svc *service.QBTimeWorkforceImportService,
	audit *service.AuditService,
) *QBTimeWorkforceImportHandler {
	return &QBTimeWorkforceImportHandler{svc: svc, audit: audit}
}

type importRequest struct {
	Company   string `json:"company"`
	Month     string `json:"month"`     // "2026-05"
	Overwrite bool   `json:"overwrite"`
}

// POST /api/v1/qbtime/workforce-import
func (h *QBTimeWorkforceImportHandler) Import(c *fiber.Ctx) error {
	var req importRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body", "code": "BAD_REQUEST",
		})
	}

	req.Company = strings.TrimSpace(req.Company)
	req.Month = strings.TrimSpace(req.Month)

	if req.Company == "" || req.Month == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "company and month are required", "code": "BAD_REQUEST",
		})
	}

	validCompanies := map[string]bool{"Framing": true, "PCG": true, "HVAC": true}
	if !validCompanies[req.Company] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "company must be one of: Framing, PCG, HVAC", "code": "BAD_REQUEST",
		})
	}

	uid, uname := actor(c)

	// uploaded_by has an FK to users(id) — "cron" (set by RequireCronOrAdmin
	// for cron-secret requests) isn't a real user row, so leave it unset
	// (repository NULLIFs empty string) rather than violating the FK.
	uploadedBy := uid
	if uploadedBy == "cron" {
		uploadedBy = ""
	}

	result, err := h.svc.Import(c.Context(), req.Company, req.Month, req.Overwrite, uploadedBy)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": err.Error(), "code": "CONFLICT",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(), "code": "INTERNAL_ERROR",
		})
	}

	h.audit.Log(c.Context(), uid, uname, "workforce_upload:qbtime_import", result.Upload.ID, req.Company+"/"+req.Month)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": fiber.Map{
			"upload":   result.Upload,
			"inserted": result.Inserted,
			"skipped":  result.Skipped,
		},
	})
}
