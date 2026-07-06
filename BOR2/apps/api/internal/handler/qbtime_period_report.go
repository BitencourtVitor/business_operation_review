package handler

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
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

// GET /api/v1/qbtime/period-report/addresses?company=hvac
func (h *PeriodReportHandler) ListAddresses(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	data, err := h.svc.ListAddresses(c.Context(), company)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": data})
}

// POST /api/v1/qbtime/period-report/unpaid-addresses { company, address, unpaid }
func (h *PeriodReportHandler) SetUnpaidAddress(c *fiber.Ctx) error {
	var body struct {
		Company string `json:"company"`
		Address string `json:"address"`
		Unpaid  bool   `json:"unpaid"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.Company == "" || body.Address == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company and address are required", "code": "BAD_REQUEST"})
	}

	var err error
	if body.Unpaid {
		err = h.svc.SetUnpaid(c.Context(), body.Company, body.Address)
	} else {
		err = h.svc.UnsetUnpaid(c.Context(), body.Company, body.Address)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"address": body.Address, "unpaid": body.Unpaid}})
}

// POST /api/v1/qbtime/period-report/sync?days=14  (cron-guarded)
// Refreshes the cache from QB Time. Actually runs detached from the request
// (see QBT-1: a full sync across 4 companies can take 3+ minutes, well past
// the edge proxy's upstream timeout — waiting for it inline meant the client
// got a spurious error even though the sync itself succeeded) so the caller
// gets an immediate ack and the sync is not cut short by a client/proxy
// timeout. Same pattern as /qb/sync.
func (h *PeriodReportHandler) Sync(c *fiber.Ctx) error {
	days := c.QueryInt("days", 14)
	requestID := c.Locals("requestid")
	logger.Info("qbtime period-report sync: request received", "days", days, "request_id", requestID)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		result := h.svc.SyncAll(ctx, days)
		logger.Info("qbtime period-report sync: completed", "result", result, "request_id", requestID)
	}()

	return c.JSON(fiber.Map{"data": fiber.Map{"status": "sync started", "padding_for_qbt1_diagnostic": "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"}})
}

// POST /api/v1/qbtime/period-report/refresh?company=hvac&days=100
// On-demand version of the daily sync for one company — pulls the last `days`
// (≈3 months by default) from QB Time so corrections made directly in
// QuickBooks land in the cache and the report immediately.
func (h *PeriodReportHandler) Refresh(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "company is required", "code": "BAD_REQUEST"})
	}
	days := c.QueryInt("days", 100)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if err := h.svc.SyncCompany(ctx, company, days); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"company": company, "days": days, "status": "ok"}})
}
