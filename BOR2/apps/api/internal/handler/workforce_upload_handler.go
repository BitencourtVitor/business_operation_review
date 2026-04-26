package handler

import (
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/gofiber/fiber/v2"
)

type WorkforceUploadHandler struct {
	svc   *service.WorkforceUploadService
	audit *service.AuditService
}

func NewWorkforceUploadHandler(svc *service.WorkforceUploadService, audit *service.AuditService) *WorkforceUploadHandler {
	return &WorkforceUploadHandler{svc: svc, audit: audit}
}

// GET /api/v1/workforce/uploads
func (h *WorkforceUploadHandler) List(c *fiber.Ctx) error {
	uploads, err := h.svc.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to list uploads", "code": "INTERNAL_ERROR",
		})
	}
	if uploads == nil {
		uploads = []*domain.WorkforceUpload{}
	}
	return c.JSON(fiber.Map{"data": uploads})
}

// POST /api/v1/workforce/uploads
// Form fields: company, reference_month, overwrite (optional "true")
// File field:  file (single CSV)
func (h *WorkforceUploadHandler) Upload(c *fiber.Ctx) error {
	company  := strings.TrimSpace(c.FormValue("company"))
	refMonth := strings.TrimSpace(c.FormValue("reference_month"))
	overwrite := strings.EqualFold(strings.TrimSpace(c.FormValue("overwrite")), "true")

	if company == "" || refMonth == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "company and reference_month are required", "code": "BAD_REQUEST",
		})
	}

	validCompanies := map[string]bool{"Framing": true, "PCG": true, "HVAC": true}
	if !validCompanies[company] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "company must be one of: Framing, PCG, HVAC", "code": "BAD_REQUEST",
		})
	}

	// Conflict check
	existing, _ := h.svc.FindConflict(c.Context(), refMonth, company)
	if existing != nil && !overwrite {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":    "an upload already exists for this month and company",
			"code":     "CONFLICT",
			"existing": existing,
		})
	}

	// Overwrite: delete existing first — CASCADE removes rows automatically
	if existing != nil && overwrite {
		if err := h.svc.Delete(c.Context(), existing.ID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to remove existing upload", "code": "INTERNAL_ERROR",
			})
		}
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "file is required", "code": "BAD_REQUEST",
		})
	}

	f, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to open file", "code": "INTERNAL_ERROR",
		})
	}
	defer f.Close()

	uid, uname := actor(c)

	upload, inserted, skipped, err := h.svc.ProcessAndCreate(c.Context(), f, company, refMonth, fileHeader.Filename, uid)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error": err.Error(), "code": "PROCESSING_ERROR",
		})
	}

	logger.Info("workforce CSV uploaded",
		"upload_id", upload.ID,
		"company", company,
		"month", refMonth,
		"inserted", inserted,
		"skipped", skipped,
	)

	h.audit.Log(c.Context(), uid, uname, "workforce_upload:create", upload.ID, company+"/"+refMonth)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": fiber.Map{
			"upload":   upload,
			"inserted": inserted,
			"skipped":  skipped,
		},
	})
}

// DELETE /api/v1/workforce/uploads/:id
func (h *WorkforceUploadHandler) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.svc.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(), "code": "NOT_FOUND",
		})
	}

	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "workforce_upload:delete", id, "")
	return c.SendStatus(fiber.StatusNoContent)
}
