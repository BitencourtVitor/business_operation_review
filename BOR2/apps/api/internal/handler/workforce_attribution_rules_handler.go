package handler

import (
	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WorkforceAttributionRuleHandler struct {
	svc   *service.WorkforceAttributionRuleService
	audit *service.AuditService
}

func NewWorkforceAttributionRuleHandler(svc *service.WorkforceAttributionRuleService, audit *service.AuditService) *WorkforceAttributionRuleHandler {
	return &WorkforceAttributionRuleHandler{svc: svc, audit: audit}
}

// GET /api/v1/workforce/rules
func (h *WorkforceAttributionRuleHandler) List(c *fiber.Ctx) error {
	rules, err := h.svc.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to list rules", "code": "INTERNAL_ERROR",
		})
	}
	if rules == nil {
		rules = []*domain.WorkforceAttributionRule{}
	}
	return c.JSON(fiber.Map{"data": rules})
}

// POST /api/v1/workforce/rules
func (h *WorkforceAttributionRuleHandler) Create(c *fiber.Ctx) error {
	var body domain.WorkforceAttributionRule
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid body", "code": "BAD_REQUEST",
		})
	}
	uid, uname := actor(c)
	rule, err := h.svc.Create(c.Context(), &body, uid)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(), "code": "BAD_REQUEST",
		})
	}
	h.audit.Log(c.Context(), uid, uname, "workforce_rule:create", rule.ID, rule.Name)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": rule})
}

// PUT /api/v1/workforce/rules/:id
func (h *WorkforceAttributionRuleHandler) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	var body domain.WorkforceAttributionRule
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid body", "code": "BAD_REQUEST",
		})
	}
	rule, err := h.svc.Update(c.Context(), id, &body)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(), "code": "BAD_REQUEST",
		})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "workforce_rule:update", rule.ID, rule.Name)
	return c.JSON(fiber.Map{"data": rule})
}

// DELETE /api/v1/workforce/rules/:id
func (h *WorkforceAttributionRuleHandler) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.svc.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(), "code": "INTERNAL_ERROR",
		})
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "workforce_rule:delete", id, "")
	return c.SendStatus(fiber.StatusNoContent)
}
