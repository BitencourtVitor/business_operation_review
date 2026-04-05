package handler

import (
	"encoding/json"
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type ForecastHandler struct {
	svc *service.ForecastService
}

func NewForecastHandler(svc *service.ForecastService) *ForecastHandler {
	return &ForecastHandler{svc: svc}
}

func (h *ForecastHandler) List(c *fiber.Ctx) error {
	year, _ := strconv.Atoi(c.Query("year"))
	filters := domain.ForecastFilters{
		Company: c.Query("company"),
		Status:  domain.ForecastStatus(c.Query("status")),
		Year:    year,
	}
	projects, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": projects})
}

func (h *ForecastHandler) Get(c *fiber.Ctx) error {
	p, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": p})
}

func (h *ForecastHandler) Create(c *fiber.Ctx) error {
	var p domain.ForecastProject
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &p)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *ForecastHandler) Update(c *fiber.Ctx) error {
	existing, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	if err := json.Unmarshal(c.Body(), existing); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), existing)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (h *ForecastHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ForecastHandler) ToggleFieldwire(c *fiber.Ctx) error {
	fwID, err := strconv.ParseInt(c.Params("fwid"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	var body struct {
		Status bool `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if err := h.svc.ToggleFieldwire(c.Context(), fwID, body.Status); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *ForecastHandler) ToggleMachine(c *fiber.Ctx) error {
	machID, err := strconv.ParseInt(c.Params("mid"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	var body struct {
		Status bool `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if err := h.svc.ToggleMachine(c.Context(), machID, body.Status); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *ForecastHandler) ToggleContractStep(c *fiber.Ctx) error {
	stepID, err := strconv.ParseInt(c.Params("stepid"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id", "code": "BAD_REQUEST"})
	}
	var body struct {
		Status bool `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if err := h.svc.ToggleContractStep(c.Context(), stepID, body.Status); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *ForecastHandler) CreateContractStep(c *fiber.Ctx) error {
	var body struct {
		ProjectID string `json:"projectId"`
		Team      string `json:"team"`
		Step      string `json:"step"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.ProjectID == "" || body.Team == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId and team required", "code": "BAD_REQUEST"})
	}
	id, err := h.svc.CreateContractStep(c.Context(), body.ProjectID, body.Team, body.Step)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

func (h *ForecastHandler) DeleteContractTeam(c *fiber.Ctx) error {
	projectID := c.Query("projectId")
	team := c.Query("team")
	if projectID == "" || team == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId and team required", "code": "BAD_REQUEST"})
	}
	if err := h.svc.DeleteContractTeam(c.Context(), projectID, team); err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error(), "code": "CONFLICT"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *ForecastHandler) AddContractTeam(c *fiber.Ctx) error {
	var body struct {
		ProjectID string `json:"projectId"`
		Team      string `json:"team"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	if body.ProjectID == "" || body.Team == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId and team required", "code": "BAD_REQUEST"})
	}
	if err := h.svc.AddContractTeam(c.Context(), body.ProjectID, body.Team); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"ok": true})
}
