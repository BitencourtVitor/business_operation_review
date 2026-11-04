package handler

import (
	"errors"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type MonthlyExecutionHandler struct {
	svc   *service.MonthlyExecutionService
	audit *service.AuditService
}

func NewMonthlyExecutionHandler(svc *service.MonthlyExecutionService, audit *service.AuditService) *MonthlyExecutionHandler {
	return &MonthlyExecutionHandler{svc: svc, audit: audit}
}

func yearParam(c *fiber.Ctx) int {
	return c.QueryInt("year", time.Now().Year())
}

func (h *MonthlyExecutionHandler) Groups(c *fiber.Ctx) error {
	list, err := h.svc.Groups(c.Context(), yearParam(c))
	if err != nil {
		return meError(c, err)
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *MonthlyExecutionHandler) SaveGroups(c *fiber.Ctx) error {
	var groups []*domain.GoalGroup
	if err := c.BodyParser(&groups); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if err := h.svc.SaveGroups(c.Context(), groups); err != nil {
		return meError(c, err)
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "update", "monthly_execution/goals", "")
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *MonthlyExecutionHandler) Finished(c *fiber.Ctx) error {
	list, err := h.svc.Finished(c.Context(), yearParam(c))
	if err != nil {
		return meError(c, err)
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *MonthlyExecutionHandler) Points(c *fiber.Ctx) error {
	list, err := h.svc.Points(c.Context(), yearParam(c))
	if err != nil {
		return meError(c, err)
	}
	return c.JSON(fiber.Map{"data": list})
}

// CreatePoint assina o ponto com a sessão: autor e cargo nunca vêm do corpo.
func (h *MonthlyExecutionHandler) CreatePoint(c *fiber.Ctx) error {
	var payload struct {
		Year     int      `json:"year"`
		Month    int      `json:"month"`
		Body     string   `json:"body"`
		GroupIDs []string `json:"groupIds"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	p := domain.ImprovementPoint{
		Year: payload.Year, Month: payload.Month, Body: payload.Body, GroupIDs: payload.GroupIDs,
		AuthorID: uid, AuthorName: uname, AuthorRole: actorRole(c),
	}
	if err := h.svc.CreatePoint(c.Context(), &p); err != nil {
		return meError(c, err)
	}
	h.audit.Log(c.Context(), uid, uname, "create", "monthly_execution/points", p.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": p})
}

// UpdatePoint troca o status (qualquer um com escrita) ou o texto e os job
// sites citados (só o autor; para os outros o ponto não existe).
func (h *MonthlyExecutionHandler) UpdatePoint(c *fiber.Ctx) error {
	var payload struct {
		Status   *domain.PointStatus `json:"status"`
		Body     *string             `json:"body"`
		GroupIDs []string            `json:"groupIds"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	id := c.Params("id")
	if payload.Status != nil {
		if err := h.svc.SetPointStatus(c.Context(), id, *payload.Status); err != nil {
			return meError(c, err)
		}
	}
	if payload.Body != nil {
		if err := h.svc.EditPoint(c.Context(), id, uid, *payload.Body, payload.GroupIDs); err != nil {
			return meError(c, err)
		}
	}
	h.audit.Log(c.Context(), uid, uname, "update", "monthly_execution/points", id)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *MonthlyExecutionHandler) DeletePoint(c *fiber.Ctx) error {
	uid, uname := actor(c)
	if err := h.svc.DeletePoint(c.Context(), c.Params("id"), uid); err != nil {
		return meError(c, err)
	}
	h.audit.Log(c.Context(), uid, uname, "delete", "monthly_execution/points", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *MonthlyExecutionHandler) AddReply(c *fiber.Ctx) error {
	var payload struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	r := domain.PointReply{Body: payload.Body, AuthorID: uid, AuthorName: uname, AuthorRole: actorRole(c)}
	if err := h.svc.AddReply(c.Context(), c.Params("id"), &r); err != nil {
		return meError(c, err)
	}
	h.audit.Log(c.Context(), uid, uname, "reply", "monthly_execution/points", c.Params("id"))
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": r})
}

func meError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrBadRequest):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid data", "code": "BAD_REQUEST"})
	case errors.Is(err, domain.ErrNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
}
