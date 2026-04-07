package handler

import (
	"encoding/json"
	"strconv"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

var insightsAdminRoles = map[domain.Role]bool{
	"dev":   true,
	"owner": true,
	"admin": true,
}

// ── DestaqueHandler ───────────────────────────────────────────────────────────

type DestaqueHandler struct {
	svc     *service.DestaqueService
	audit   *service.AuditService
	authSvc *service.AuthService
	db      *pgxpool.Pool
}

func NewDestaqueHandler(svc *service.DestaqueService, audit *service.AuditService, authSvc *service.AuthService, db *pgxpool.Pool) *DestaqueHandler {
	return &DestaqueHandler{svc: svc, audit: audit, authSvc: authSvc, db: db}
}

func (h *DestaqueHandler) resolveUser(c *fiber.Ctx) (*domain.User, error) {
	token, _ := c.Locals("token").(string)
	return h.authSvc.GetUserByToken(c.Context(), token)
}

func (h *DestaqueHandler) permLevel(c *fiber.Ctx, userID string) string {
	var raw []byte
	row := h.db.QueryRow(c.Context(), `SELECT permissions FROM user_permissions WHERE user_id = $1`, userID)
	if err := row.Scan(&raw); err != nil {
		return ""
	}
	var perms map[string]string
	if err := json.Unmarshal(raw, &perms); err != nil {
		return ""
	}
	return perms["permits"]
}

func (h *DestaqueHandler) canWrite(c *fiber.Ctx, user *domain.User) bool {
	return insightsAdminRoles[user.Role] || h.permLevel(c, user.ID) == "write"
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
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	var r domain.Destaque
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	r.UpdatedByID = user.ID
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "create", "destaques", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *DestaqueHandler) Update(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	var r domain.Destaque
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	r.UpdatedByID = user.ID
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "update", "destaques", c.Params("id"))
	return c.JSON(fiber.Map{"data": updated})
}

func (h *DestaqueHandler) Delete(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "delete", "destaques", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

// ── OportunidadeHandler ───────────────────────────────────────────────────────

type OportunidadeHandler struct {
	svc     *service.OportunidadeService
	audit   *service.AuditService
	authSvc *service.AuthService
	db      *pgxpool.Pool
}

func NewOportunidadeHandler(svc *service.OportunidadeService, audit *service.AuditService, authSvc *service.AuthService, db *pgxpool.Pool) *OportunidadeHandler {
	return &OportunidadeHandler{svc: svc, audit: audit, authSvc: authSvc, db: db}
}

func (h *OportunidadeHandler) resolveUser(c *fiber.Ctx) (*domain.User, error) {
	token, _ := c.Locals("token").(string)
	return h.authSvc.GetUserByToken(c.Context(), token)
}

func (h *OportunidadeHandler) permLevel(c *fiber.Ctx, userID string) string {
	var raw []byte
	row := h.db.QueryRow(c.Context(), `SELECT permissions FROM user_permissions WHERE user_id = $1`, userID)
	if err := row.Scan(&raw); err != nil {
		return ""
	}
	var perms map[string]string
	if err := json.Unmarshal(raw, &perms); err != nil {
		return ""
	}
	return perms["permits"]
}

func (h *OportunidadeHandler) canWrite(c *fiber.Ctx, user *domain.User) bool {
	return insightsAdminRoles[user.Role] || h.permLevel(c, user.ID) == "write"
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
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	var r domain.Oportunidade
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	r.UpdatedByID = user.ID
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "create", "oportunidades", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *OportunidadeHandler) Update(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	var r domain.Oportunidade
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	r.UpdatedByID = user.ID
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "update", "oportunidades", c.Params("id"))
	return c.JSON(fiber.Map{"data": updated})
}

func (h *OportunidadeHandler) Delete(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "delete", "oportunidades", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}

// ── PlanoDeAcaoHandler ────────────────────────────────────────────────────────

type PlanoDeAcaoHandler struct {
	svc     *service.PlanoDeAcaoService
	audit   *service.AuditService
	authSvc *service.AuthService
	db      *pgxpool.Pool
}

func NewPlanoDeAcaoHandler(svc *service.PlanoDeAcaoService, audit *service.AuditService, authSvc *service.AuthService, db *pgxpool.Pool) *PlanoDeAcaoHandler {
	return &PlanoDeAcaoHandler{svc: svc, audit: audit, authSvc: authSvc, db: db}
}

func (h *PlanoDeAcaoHandler) resolveUser(c *fiber.Ctx) (*domain.User, error) {
	token, _ := c.Locals("token").(string)
	return h.authSvc.GetUserByToken(c.Context(), token)
}

func (h *PlanoDeAcaoHandler) permLevel(c *fiber.Ctx, userID string) string {
	var raw []byte
	row := h.db.QueryRow(c.Context(), `SELECT permissions FROM user_permissions WHERE user_id = $1`, userID)
	if err := row.Scan(&raw); err != nil {
		return ""
	}
	var perms map[string]string
	if err := json.Unmarshal(raw, &perms); err != nil {
		return ""
	}
	return perms["permits"]
}

func (h *PlanoDeAcaoHandler) canWrite(c *fiber.Ctx, user *domain.User) bool {
	return insightsAdminRoles[user.Role] || h.permLevel(c, user.ID) == "write"
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
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	var r domain.PlanoDeAcao
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	r.UpdatedByID = user.ID
	created, err := h.svc.Create(c.Context(), &r)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error(), "code": "INTERNAL_ERROR"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "create", "planos_de_acao", created.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (h *PlanoDeAcaoHandler) Update(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	var r domain.PlanoDeAcao
	if err := c.BodyParser(&r); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body", "code": "BAD_REQUEST"})
	}
	r.UpdatedByID = user.ID
	updated, err := h.svc.Update(c.Context(), c.Params("id"), &r)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "update", "planos_de_acao", c.Params("id"))
	return c.JSON(fiber.Map{"data": updated})
}

func (h *PlanoDeAcaoHandler) Delete(c *fiber.Ctx) error {
	user, err := h.resolveUser(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized", "code": "UNAUTHORIZED"})
	}
	if !h.canWrite(c, user) {
		return c.Status(403).JSON(fiber.Map{"error": "forbidden", "code": "FORBIDDEN"})
	}
	if err := h.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found", "code": "NOT_FOUND"})
	}
	h.audit.Log(c.Context(), user.ID, user.Name, "delete", "planos_de_acao", c.Params("id"))
	return c.SendStatus(fiber.StatusNoContent)
}
