package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type QBTimeDailyReportHandler struct {
	svc   *service.QBTimeDailyReportService
	audit *service.AuditService
}

func NewQBTimeDailyReportHandler(svc *service.QBTimeDailyReportService, audit *service.AuditService) *QBTimeDailyReportHandler {
	return &QBTimeDailyReportHandler{svc: svc, audit: audit}
}

// GET /qbtime/daily?company=HVAC
func (h *QBTimeDailyReportHandler) List(c *fiber.Ctx) error {
	reports, err := h.svc.List(c.Context(), domain.QBTimeDailyReportFilters{
		Company: c.Query("company"),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	if reports == nil {
		reports = []*domain.QBTimeDailyReport{}
	}
	return c.JSON(fiber.Map{"data": reports})
}

// GET /qbtime/daily/:id
func (h *QBTimeDailyReportHandler) Get(c *fiber.Ctx) error {
	report, err := h.svc.Get(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": report})
}

// POST /qbtime/daily  — upsert by (company, date)
func (h *QBTimeDailyReportHandler) Create(c *fiber.Ctx) error {
	var body domain.QBTimeDailyReport
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.Company == "" || body.Date == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company and date are required", "code": "BAD_REQUEST"})
	}

	uid, uname := actor(c)
	body.CreatedByID = uid
	body.CreatedByName = uname

	created, err := h.svc.Upsert(c.Context(), &body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	h.audit.Log(c.Context(), uid, uname, "upsert", "qbtime_daily_report", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

// DELETE /qbtime/daily/:id
func (h *QBTimeDailyReportHandler) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.svc.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "qbtime_daily_report", id)
	return c.SendStatus(fiber.StatusNoContent)
}
