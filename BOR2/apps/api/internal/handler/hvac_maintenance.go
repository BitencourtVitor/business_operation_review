package handler

import (
	"errors"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type MaintenanceContractHandler struct {
	svc   *service.MaintenanceContractService
	audit *service.AuditService
}

func NewMaintenanceContractHandler(svc *service.MaintenanceContractService, audit *service.AuditService) *MaintenanceContractHandler {
	return &MaintenanceContractHandler{svc: svc, audit: audit}
}

func (h *MaintenanceContractHandler) List(c *fiber.Ctx) error {
	list, err := h.svc.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *MaintenanceContractHandler) SearchInvoices(c *fiber.Ctx) error {
	list, err := h.svc.SearchInvoices(c.Context(), c.Query("q"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *MaintenanceContractHandler) Create(c *fiber.Ctx) error {
	return h.save(c, "")
}

func (h *MaintenanceContractHandler) Update(c *fiber.Ctx) error {
	return h.save(c, c.Params("id"))
}

func (h *MaintenanceContractHandler) save(c *fiber.Ctx, id string) error {
	var m domain.MaintenanceContract
	if err := c.BodyParser(&m); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	m.ID = id
	if err := h.svc.Save(c.Context(), &m); err != nil {
		return maintenanceError(c, err)
	}
	action := "update"
	if id == "" {
		action = "create"
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, action, "hvac_maintenance_contracts", m.ID)
	return c.JSON(fiber.Map{"data": fiber.Map{"id": m.ID}})
}

func (h *MaintenanceContractHandler) Delete(c *fiber.Ctx) error {
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return maintenanceError(c, err)
	}
	uid, uname := actor(c)
	h.audit.Log(c.Context(), uid, uname, "delete", "hvac_maintenance_contracts", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *MaintenanceContractHandler) ListComments(c *fiber.Ctx) error {
	list, err := h.svc.ListComments(c.Context(), c.Params("id"))
	if err != nil {
		return maintenanceError(c, err)
	}
	return c.JSON(fiber.Map{"data": list})
}

// AddComment assina o comentário com a sessão: autor e cargo nunca vêm do corpo.
func (h *MaintenanceContractHandler) AddComment(c *fiber.Ctx) error {
	var payload struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	comment := domain.MaintenanceComment{Body: payload.Body, AuthorID: uid, AuthorName: uname, AuthorRole: actorRole(c)}
	if err := h.svc.AddComment(c.Context(), c.Params("id"), &comment); err != nil {
		if errors.Is(err, domain.ErrBadRequest) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "empty comment", "code": "BAD_REQUEST"})
		}
		return maintenanceError(c, err)
	}
	h.audit.Log(c.Context(), uid, uname, "comment", "hvac_maintenance_contracts", c.Params("id"))
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": comment})
}

// UpdateComment e DeleteComment só atendem o autor, que vem da sessão. Para
// quem não escreveu, a resposta é 404: dizer "proibido" confirmaria que existe.
func (h *MaintenanceContractHandler) UpdateComment(c *fiber.Ctx) error {
	cid, err := c.ParamsInt("cid")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid comment id", "code": "BAD_REQUEST"})
	}
	var payload struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	if err := h.svc.UpdateComment(c.Context(), c.Params("id"), int64(cid), uid, payload.Body); err != nil {
		if errors.Is(err, domain.ErrBadRequest) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "empty comment", "code": "BAD_REQUEST"})
		}
		return maintenanceError(c, err)
	}
	h.audit.Log(c.Context(), uid, uname, "edit_comment", "hvac_maintenance_contracts", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *MaintenanceContractHandler) DeleteComment(c *fiber.Ctx) error {
	cid, err := c.ParamsInt("cid")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid comment id", "code": "BAD_REQUEST"})
	}
	uid, uname := actor(c)
	if err := h.svc.DeleteComment(c.Context(), c.Params("id"), int64(cid), uid); err != nil {
		return maintenanceError(c, err)
	}
	h.audit.Log(c.Context(), uid, uname, "delete_comment", "hvac_maintenance_contracts", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

func maintenanceError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrBadRequest):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "client name is required", "code": "BAD_REQUEST"})
	case errors.Is(err, domain.ErrNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
}
