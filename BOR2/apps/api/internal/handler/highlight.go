package handler

import (
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

// ── DestaqueHandler ───────────────────────────────────────────────────────────

type DestaqueHandler struct {
	svc *service.DestaqueService
}

func NewDestaqueHandler(svc *service.DestaqueService) *DestaqueHandler {
	return &DestaqueHandler{svc: svc}
}

func (h *DestaqueHandler) List(c *fiber.Ctx) error {
	mes, _ := strconv.Atoi(c.Query("mes"))
	ano, _ := strconv.Atoi(c.Query("ano"))
	filters := domain.DestaqueFilters{
		UsuarioID: c.Query("usuarioId"),
		TelaID:    c.Query("telaId"),
		Mes:       mes,
		Ano:       ano,
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *DestaqueHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *DestaqueHandler) Create(c *fiber.Ctx) error {
	var r domain.Destaque
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *DestaqueHandler) Update(c *fiber.Ctx) error {
	var r domain.Destaque
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (h *DestaqueHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ── OportunidadeHandler ───────────────────────────────────────────────────────

type OportunidadeHandler struct {
	svc *service.OportunidadeService
}

func NewOportunidadeHandler(svc *service.OportunidadeService) *OportunidadeHandler {
	return &OportunidadeHandler{svc: svc}
}

func (h *OportunidadeHandler) List(c *fiber.Ctx) error {
	mes, _ := strconv.Atoi(c.Query("mes"))
	ano, _ := strconv.Atoi(c.Query("ano"))
	filters := domain.OportunidadeFilters{
		UsuarioID: c.Query("usuarioId"),
		TelaID:    c.Query("telaId"),
		Mes:       mes,
		Ano:       ano,
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *OportunidadeHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *OportunidadeHandler) Create(c *fiber.Ctx) error {
	var r domain.Oportunidade
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *OportunidadeHandler) Update(c *fiber.Ctx) error {
	var r domain.Oportunidade
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (h *OportunidadeHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ── PlanoDeAcaoHandler ────────────────────────────────────────────────────────

type PlanoDeAcaoHandler struct {
	svc *service.PlanoDeAcaoService
}

func NewPlanoDeAcaoHandler(svc *service.PlanoDeAcaoService) *PlanoDeAcaoHandler {
	return &PlanoDeAcaoHandler{svc: svc}
}

func (h *PlanoDeAcaoHandler) List(c *fiber.Ctx) error {
	filters := domain.PlanoDeAcaoFilters{
		UsuarioID: c.Query("usuarioId"),
		TelaID:    c.Query("telaId"),
		Status:    c.Query("status"),
	}
	records, err := h.svc.List(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": records})
}

func (h *PlanoDeAcaoHandler) Get(c *fiber.Ctx) error {
	r, err := h.svc.FindByID(c.Context(), c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": r})
}

func (h *PlanoDeAcaoHandler) Create(c *fiber.Ctx) error {
	var r domain.PlanoDeAcao
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *PlanoDeAcaoHandler) Update(c *fiber.Ctx) error {
	var r domain.PlanoDeAcao
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (h *PlanoDeAcaoHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
