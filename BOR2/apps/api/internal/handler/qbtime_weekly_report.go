package handler

import (
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WeeklyReportHandler struct {
	svc *service.WeeklyReportService
}

func NewWeeklyReportHandler(svc *service.WeeklyReportService) *WeeklyReportHandler {
	return &WeeklyReportHandler{svc: svc}
}

// GET /api/v1/qbtime/weekly-report?company={company}&date={YYYY-MM-DD}
// date defaults to today if not provided
func (h *WeeklyReportHandler) Get(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}

	var date time.Time
	if dateStr := c.Query("date"); dateStr != "" {
		var err error
		date, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "date must be YYYY-MM-DD", "code": "BAD_REQUEST"})
		}
	} else {
		date = time.Now()
	}

	data, err := h.svc.GetWeeklyReport(c.Context(), company, date)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": data})
}
