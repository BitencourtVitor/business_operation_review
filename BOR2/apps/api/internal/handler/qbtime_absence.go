package handler

import (
	"strconv"
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type QBTimeAbsenceHandler struct {
	svc *service.QBTimeAbsenceService
}

func NewQBTimeAbsenceHandler(svc *service.QBTimeAbsenceService) *QBTimeAbsenceHandler {
	return &QBTimeAbsenceHandler{svc: svc}
}

// GET /api/v1/qbtime/absences?company=framing&days=21
func (h *QBTimeAbsenceHandler) Get(c *fiber.Ctx) error {
	company := strings.ToLower(strings.TrimSpace(c.Query("company")))
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	days, _ := strconv.Atoi(c.Query("days"))

	resp, err := h.svc.Get(c.Context(), company, days)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": resp})
}

// GET /api/v1/qbtime/absences/attendance?company=framing&week=YYYY-MM-DD
// week is any date inside the wanted week; omitted means the current one.
func (h *QBTimeAbsenceHandler) Attendance(c *fiber.Ctx) error {
	company := strings.ToLower(strings.TrimSpace(c.Query("company")))
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}

	resp, err := h.svc.Attendance(c.Context(), company, strings.TrimSpace(c.Query("week")))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": resp})
}

// POST /api/v1/qbtime/absences/detect — cron-guarded; recompute + notify.
func (h *QBTimeAbsenceHandler) Detect(c *fiber.Ctx) error {
	counts, err := h.svc.Run(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(), "code": "INTERNAL_ERROR", "data": fiber.Map{"events": counts},
		})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"events": counts}})
}
