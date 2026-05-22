package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type PeriodReportHandler struct {
	svc *service.PeriodReportService
}

func NewPeriodReportHandler(svc *service.PeriodReportService) *PeriodReportHandler {
	return &PeriodReportHandler{svc: svc}
}

// GET /api/v1/qbtime/period-report/periods?company=hvac
func (h *PeriodReportHandler) GetPeriods(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}

	data, err := h.svc.GetPayPeriods(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": data})
}

// GET /api/v1/qbtime/period-report/intervals?company=hvac&start_date=2026-04-26&end_date=2026-05-09
func (h *PeriodReportHandler) GetIntervals(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	if startDate == "" || endDate == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "start_date and end_date are required", "code": "BAD_REQUEST"})
	}

	data, err := h.svc.GetIntervals(c.Context(), company, startDate, endDate)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": data})
}

// GET /api/v1/qbtime/period-report/accounting?company=hvac&start_date=2026-04-26&end_date=2026-05-09
func (h *PeriodReportHandler) GetAccounting(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	if startDate == "" || endDate == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "start_date and end_date are required", "code": "BAD_REQUEST"})
	}

	data, err := h.svc.GetAccounting(c.Context(), company, startDate, endDate)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": data})
}
