package handler

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AtlasHandler — documentos, plantas e diário de obra.
//
// Duas regras atravessam o arquivo inteiro:
//
//   - O arquivo não passa por aqui. A API assina uma URL e o cliente fala
//     direto com o R2 (AT-9). O que trafega nestes endpoints é metadado.
//   - Permissão do Atlas tem dois níveis: a chave `atlas` do produto, cobrada
//     pelo middleware na rota, e o acesso por obra, cobrado aqui dentro —
//     porque só o handler sabe de qual obra o recurso é filho.
type AtlasHandler struct {
	db *pgxpool.Pool
	r2 *service.R2Service
}

func NewAtlasHandler(db *pgxpool.Pool, r2 *service.R2Service) *AtlasHandler {
	return &AtlasHandler{db: db, r2: r2}
}

// ── Permissão por obra ──────────────────────────────────────────────────────

// Papéis que enxergam qualquer obra sem precisar de concessão. Espelha o
// `fullAccessRoles` do middleware: quem administra a plataforma não depende de
// alguém lembrar de conceder acesso a si mesmo.
var atlasFullAccess = map[string]bool{"dev": true, "owner": true, "admin": true, "manager": true}

// Ordem dos níveis. Ler é o piso, gerenciar é o teto; anotar fica no meio
// porque é o que o subcontratado precisa e não deve ir além.
var atlasLevelRank = map[string]int{"read": 1, "annotate": 2, "manage": 3}

var errAtlasForbidden = errors.New("atlas: sem acesso a esta obra")

// jobsiteLevel devolve o que este usuário pode fazer nesta obra, considerando
// revogação e expiração — um convite vencido é igual a não ter acesso, e essa
// checagem tem que ser da consulta, não de quem lembra de filtrar.
func (h *AtlasHandler) jobsiteLevel(c *fiber.Ctx, jobsiteID string) (string, error) {
	role, _ := c.Locals("userRole").(string)
	if atlasFullAccess[role] {
		return "manage", nil
	}
	userID, _ := c.Locals("userID").(string)
	if userID == "" {
		return "", errAtlasForbidden
	}
	var level string
	err := h.db.QueryRow(c.Context(), `
		SELECT level FROM atlas_jobsite_access
		WHERE jobsite_id = $1 AND user_id = $2
		  AND revoked_at IS NULL
		  AND (expires_at IS NULL OR expires_at > now())`,
		jobsiteID, userID).Scan(&level)
	if err != nil {
		return "", errAtlasForbidden
	}
	return level, nil
}

func (h *AtlasHandler) require(c *fiber.Ctx, jobsiteID, needed string) error {
	level, err := h.jobsiteLevel(c, jobsiteID)
	if err != nil {
		return err
	}
	if atlasLevelRank[level] < atlasLevelRank[needed] {
		return errAtlasForbidden
	}
	return nil
}

func atlasForbidden(c *fiber.Ctx) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "sem acesso a esta obra", "code": "FORBIDDEN",
	})
}

func atlasNotFound(c *fiber.Ctx, what string) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
		"error": what + " não encontrado", "code": "NOT_FOUND",
	})
}

func atlasNoStorage(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
		"error": "storage do Atlas não configurado neste ambiente",
		"code":  "R2_NOT_CONFIGURED",
	})
}

// ── Obras ───────────────────────────────────────────────────────────────────

type atlasJobsite struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Address       string  `json:"address"`
	Client        string  `json:"client"`
	Code          string  `json:"code"`
	Status        string  `json:"status"`
	CatalogSiteID *int64  `json:"catalogJobSiteId"`
	CreatedBy     string  `json:"createdBy"`
	CreatedAt     string  `json:"createdAt"`
	// Preenchidos na listagem: é o que a sala da obra mostra no card sem
	// precisar de uma consulta por obra na tela.
	Documents  int    `json:"documents"`
	OpenEvents int    `json:"openEvents"`
	Level      string `json:"level"`
}

// GET /atlas/jobsites
func (h *AtlasHandler) ListJobsites(c *fiber.Ctx) error {
	role, _ := c.Locals("userRole").(string)
	userID, _ := c.Locals("userID").(string)

	rows, err := h.db.Query(c.Context(), `
		SELECT j.id, j.name, j.address, j.client, j.code, j.status,
		       j.catalog_job_site_id, j.created_by, j.created_at,
		       (SELECT count(*) FROM atlas_document d
		         WHERE d.jobsite_id = j.id AND d.archived_at IS NULL),
		       (SELECT count(*) FROM atlas_event e
		         WHERE e.jobsite_id = j.id AND e.status <> 'resolved'),
		       COALESCE(a.level, '')
		FROM atlas_jobsite j
		LEFT JOIN atlas_jobsite_access a
		       ON a.jobsite_id = j.id AND a.user_id = $2
		      AND a.revoked_at IS NULL
		      AND (a.expires_at IS NULL OR a.expires_at > now())
		WHERE $1 OR a.user_id IS NOT NULL
		ORDER BY j.status, j.name`,
		atlasFullAccess[role], userID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasJobsite{}
	for rows.Next() {
		var j atlasJobsite
		var created time.Time
		if err := rows.Scan(&j.ID, &j.Name, &j.Address, &j.Client, &j.Code, &j.Status,
			&j.CatalogSiteID, &j.CreatedBy, &created,
			&j.Documents, &j.OpenEvents, &j.Level); err != nil {
			return internalErr(c, err)
		}
		j.CreatedAt = created.Format(time.RFC3339)
		if atlasFullAccess[role] && j.Level == "" {
			j.Level = "manage"
		}
		out = append(out, j)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/jobsites — criar obra é ação de administração da plataforma, não
// de acesso a uma obra: quem ainda não tem obra nenhuma não teria como passar
// por uma checagem por obra.
func (h *AtlasHandler) CreateJobsite(c *fiber.Ctx) error {
	role, _ := c.Locals("userRole").(string)
	if !atlasFullAccess[role] {
		return atlasForbidden(c)
	}
	var in atlasJobsite
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.Name) == "" {
		return badRequest(c, "name is required")
	}
	userID, _ := actor(c)
	id := uuid.NewString()
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_jobsite (id, name, address, client, code, catalog_job_site_id, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, strings.TrimSpace(in.Name), in.Address, in.Client, in.Code, in.CatalogSiteID, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// PATCH /atlas/jobsites/:id
func (h *AtlasHandler) UpdateJobsite(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE atlas_jobsite SET
			name    = COALESCE($2, name),
			address = COALESCE($3, address),
			client  = COALESCE($4, client),
			code    = COALESCE($5, code),
			status  = COALESCE($6, status),
			updated_at = now()
		WHERE id = $1`,
		id, strPtr(patch, "name"), strPtr(patch, "address"), strPtr(patch, "client"),
		strPtr(patch, "code"), strPtr(patch, "status"))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// ── Acesso por obra ─────────────────────────────────────────────────────────

type atlasAccess struct {
	UserID    string  `json:"userId"`
	UserName  string  `json:"userName"`
	UserEmail string  `json:"userEmail"`
	Level     string  `json:"level"`
	GrantedBy string  `json:"grantedBy"`
	GrantedAt string  `json:"grantedAt"`
	ExpiresAt *string `json:"expiresAt"`
	RevokedAt *string `json:"revokedAt"`
}

// GET /atlas/jobsites/:id/access
func (h *AtlasHandler) ListAccess(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT a.user_id, u.name, u.email, a.level, a.granted_by, a.granted_at,
		       a.expires_at, a.revoked_at
		FROM atlas_jobsite_access a
		JOIN users u ON u.id = a.user_id
		WHERE a.jobsite_id = $1
		ORDER BY u.name`, id)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasAccess{}
	for rows.Next() {
		var a atlasAccess
		var granted time.Time
		var expires, revoked *time.Time
		if err := rows.Scan(&a.UserID, &a.UserName, &a.UserEmail, &a.Level,
			&a.GrantedBy, &granted, &expires, &revoked); err != nil {
			return internalErr(c, err)
		}
		a.GrantedAt = granted.Format(time.RFC3339)
		a.ExpiresAt = isoOrNil(expires)
		a.RevokedAt = isoOrNil(revoked)
		out = append(out, a)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /atlas/jobsites/:id/access/:userId
func (h *AtlasHandler) GrantAccess(c *fiber.Ctx) error {
	id, target := c.Params("id"), c.Params("userId")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		Level     string  `json:"level"`
		ExpiresAt *string `json:"expiresAt"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if atlasLevelRank[in.Level] == 0 {
		return badRequest(c, "level must be read, annotate or manage")
	}
	granter, _ := actor(c)
	var expires any
	if in.ExpiresAt != nil && *in.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *in.ExpiresAt)
		if err != nil {
			return badRequest(c, "expiresAt must be RFC3339")
		}
		expires = t
	}
	// Reconceder é reabrir: `revoked_at` volta a nulo, senão um acesso devolvido
	// depois de uma revogação nasce morto.
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_jobsite_access (jobsite_id, user_id, level, granted_by, expires_at)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (jobsite_id, user_id) DO UPDATE SET
			level = EXCLUDED.level, granted_by = EXCLUDED.granted_by,
			granted_at = now(), expires_at = EXCLUDED.expires_at, revoked_at = NULL`,
		id, target, in.Level, granter, expires)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"jobsiteId": id, "userId": target, "level": in.Level}})
}

// DELETE /atlas/jobsites/:id/access/:userId — revoga sem apagar. A linha é a
// prova de que o acesso existiu, e o AT-7 pede que concessão e revogação
// constem na trilha.
func (h *AtlasHandler) RevokeAccess(c *fiber.Ctx) error {
	id, target := c.Params("id"), c.Params("userId")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE atlas_jobsite_access SET revoked_at = now()
		WHERE jobsite_id = $1 AND user_id = $2 AND revoked_at IS NULL`, id, target)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"revoked": target}})
}

// ── Documentos ──────────────────────────────────────────────────────────────

type atlasDocument struct {
	ID         string `json:"id"`
	JobsiteID  string `json:"jobsiteId"`
	Name       string `json:"name"`
	Discipline string `json:"discipline"`
	Kind       string `json:"kind"`
	CreatedBy  string `json:"createdBy"`
	CreatedAt  string `json:"createdAt"`
	Versions   int    `json:"versions"`
	// A revisão publicada mais recente — o que a sala da obra abre por padrão.
	LatestVersionID string `json:"latestVersionId"`
	LatestRevision  string `json:"latestRevision"`
	LatestStatus    string `json:"latestStatus"`
	Sheets          int    `json:"sheets"`
}

// GET /atlas/jobsites/:id/documents
func (h *AtlasHandler) ListDocuments(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT d.id, d.jobsite_id, d.name, d.discipline, d.kind, d.created_by, d.created_at,
		       (SELECT count(*) FROM atlas_document_version v WHERE v.document_id = d.id),
		       COALESCE(u.id,''), COALESCE(u.revision,''), COALESCE(u.status,''),
		       COALESCE((SELECT count(*) FROM atlas_sheet s WHERE s.version_id = u.id), 0)
		FROM atlas_document d
		LEFT JOIN LATERAL (
			SELECT v.id, v.revision, v.status
			FROM atlas_document_version v
			WHERE v.document_id = d.id
			ORDER BY v.uploaded_at DESC
			LIMIT 1
		) u ON true
		WHERE d.jobsite_id = $1 AND d.archived_at IS NULL
		ORDER BY d.discipline, d.name`, id)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasDocument{}
	for rows.Next() {
		var d atlasDocument
		var created time.Time
		if err := rows.Scan(&d.ID, &d.JobsiteID, &d.Name, &d.Discipline, &d.Kind,
			&d.CreatedBy, &created, &d.Versions,
			&d.LatestVersionID, &d.LatestRevision, &d.LatestStatus, &d.Sheets); err != nil {
			return internalErr(c, err)
		}
		d.CreatedAt = created.Format(time.RFC3339)
		out = append(out, d)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/jobsites/:id/documents
func (h *AtlasHandler) CreateDocument(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.require(c, id, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in atlasDocument
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.Name) == "" {
		return badRequest(c, "name is required")
	}
	userID, _ := actor(c)
	docID := uuid.NewString()
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_document (id, jobsite_id, name, discipline, kind, created_by)
		VALUES ($1,$2,$3,$4,COALESCE(NULLIF($5,''),'drawing'),$6)`,
		docID, id, strings.TrimSpace(in.Name), in.Discipline, in.Kind, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": docID}})
}

// PATCH /atlas/documents/:id
func (h *AtlasHandler) UpdateDocument(c *fiber.Ctx) error {
	docID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, docID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	archived := patch["archived"] == true
	_, err = h.db.Exec(c.Context(), `
		UPDATE atlas_document SET
			name        = COALESCE($2, name),
			discipline  = COALESCE($3, discipline),
			kind        = COALESCE($4, kind),
			archived_at = CASE WHEN $5 THEN now() ELSE archived_at END,
			updated_at  = now()
		WHERE id = $1`,
		docID, strPtr(patch, "name"), strPtr(patch, "discipline"), strPtr(patch, "kind"), archived)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": docID}})
}

func (h *AtlasHandler) documentJobsite(c *fiber.Ctx, docID string) (string, error) {
	var jobsiteID string
	err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_document WHERE id = $1`, docID).Scan(&jobsiteID)
	return jobsiteID, err
}

// versionContext devolve a obra e o documento de uma versão, que é o que
// permite cobrar permissão em rotas que só recebem o id da versão.
func (h *AtlasHandler) versionContext(c *fiber.Ctx, versionID string) (jobsiteID, documentID string, err error) {
	err = h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, d.id
		FROM atlas_document_version v
		JOIN atlas_document d ON d.id = v.document_id
		WHERE v.id = $1`, versionID).Scan(&jobsiteID, &documentID)
	return
}

func (h *AtlasHandler) sheetContext(c *fiber.Ctx, sheetID string) (jobsiteID, versionID string, err error) {
	err = h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, v.id
		FROM atlas_sheet s
		JOIN atlas_document_version v ON v.id = s.version_id
		JOIN atlas_document d ON d.id = v.document_id
		WHERE s.id = $1`, sheetID).Scan(&jobsiteID, &versionID)
	return
}

// ── Versões e upload ────────────────────────────────────────────────────────

type atlasVersion struct {
	ID          string  `json:"id"`
	DocumentID  string  `json:"documentId"`
	Revision    string  `json:"revision"`
	R2Key       string  `json:"r2Key"`
	ByteSize    int64   `json:"byteSize"`
	PageCount   int     `json:"pageCount"`
	Checksum    string  `json:"checksum"`
	ContentType string  `json:"contentType"`
	Status      string  `json:"status"`
	Notes       string  `json:"notes"`
	UploadedBy  string  `json:"uploadedBy"`
	UploadedAt  string  `json:"uploadedAt"`
	PublishedAt *string `json:"publishedAt"`
	Sheets      int     `json:"sheets"`
}

// GET /atlas/documents/:id/versions
func (h *AtlasHandler) ListVersions(c *fiber.Ctx) error {
	docID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, docID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT v.id, v.document_id, v.revision, v.r2_key, v.byte_size, v.page_count,
		       v.checksum, v.content_type, v.status, v.notes, v.uploaded_by,
		       v.uploaded_at, v.published_at,
		       (SELECT count(*) FROM atlas_sheet s WHERE s.version_id = v.id)
		FROM atlas_document_version v
		WHERE v.document_id = $1
		ORDER BY v.uploaded_at DESC`, docID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasVersion{}
	for rows.Next() {
		var v atlasVersion
		var uploaded time.Time
		var published *time.Time
		if err := rows.Scan(&v.ID, &v.DocumentID, &v.Revision, &v.R2Key, &v.ByteSize,
			&v.PageCount, &v.Checksum, &v.ContentType, &v.Status, &v.Notes,
			&v.UploadedBy, &uploaded, &published, &v.Sheets); err != nil {
			return internalErr(c, err)
		}
		v.UploadedAt = uploaded.Format(time.RFC3339)
		v.PublishedAt = isoOrNil(published)
		out = append(out, v)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/documents/:id/versions
//
// Abre a versão e devolve a URL assinada. A linha nasce `pending`: enquanto o
// cliente não confirmar o upload, existe o registro da intenção e não existe
// documento — que é exatamente o estado real das coisas.
func (h *AtlasHandler) CreateVersion(c *fiber.Ctx) error {
	docID := c.Params("id")
	jobsiteID, err := h.documentJobsite(c, docID)
	if err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	var in struct {
		Revision    string `json:"revision"`
		FileName    string `json:"fileName"`
		ContentType string `json:"contentType"`
		ByteSize    int64  `json:"byteSize"`
		Notes       string `json:"notes"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.Revision) == "" {
		return badRequest(c, "revision is required")
	}
	userID, _ := actor(c)
	versionID := uuid.NewString()
	key := service.DocumentKey(jobsiteID, docID, versionID, in.FileName)

	url, err := h.r2.UploadURL(c.Context(), key, in.ContentType, 2*time.Hour)
	if err != nil {
		return internalErr(c, err)
	}
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO atlas_document_version
			(id, document_id, revision, r2_key, byte_size, content_type, notes, uploaded_by)
		VALUES ($1,$2,$3,$4,$5,COALESCE(NULLIF($6,''),'application/pdf'),$7,$8)`,
		versionID, docID, strings.TrimSpace(in.Revision), key, in.ByteSize,
		in.ContentType, in.Notes, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"versionId": versionID, "r2Key": key, "uploadUrl": url,
		"expiresIn": int((2 * time.Hour).Seconds()),
	}})
}

// POST /atlas/versions/:id/confirm
//
// O cliente avisa que terminou; quem diz que terminou mesmo é o bucket. Sem
// esta conferência, um upload interrompido deixaria uma versão marcada como
// disponível apontando para meio arquivo.
func (h *AtlasHandler) ConfirmVersion(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	var in struct {
		Checksum  string `json:"checksum"`
		PageCount int    `json:"pageCount"`
	}
	_ = c.BodyParser(&in)

	var key string
	if err := h.db.QueryRow(c.Context(),
		`SELECT r2_key FROM atlas_document_version WHERE id = $1`, versionID).Scan(&key); err != nil {
		return atlasNotFound(c, "versão")
	}
	size, ctype, err := h.r2.Stat(c.Context(), key)
	if err != nil {
		// Objeto ausente é o caso normal de upload que não terminou, e ele tem
		// que ficar registrado como falha em vez de sumir em silêncio.
		_, _ = h.db.Exec(c.Context(),
			`UPDATE atlas_document_version SET status='failed' WHERE id=$1`, versionID)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "arquivo não encontrado no storage", "code": "UPLOAD_INCOMPLETE",
		})
	}
	_, err = h.db.Exec(c.Context(), `
		UPDATE atlas_document_version SET
			status = 'uploaded', byte_size = $2,
			content_type = COALESCE(NULLIF($3,''), content_type),
			checksum = COALESCE(NULLIF($4,''), checksum),
			page_count = CASE WHEN $5 > 0 THEN $5 ELSE page_count END
		WHERE id = $1`, versionID, size, ctype, in.Checksum, in.PageCount)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": versionID, "byteSize": size, "status": "uploaded"}})
}

// POST /atlas/versions/:id/publish — o passo que abre o documento aos externos.
// Só depois da revisão do metadado das folhas (AT-12).
func (h *AtlasHandler) PublishVersion(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var status string
	if err := h.db.QueryRow(c.Context(),
		`SELECT status FROM atlas_document_version WHERE id=$1`, versionID).Scan(&status); err != nil {
		return atlasNotFound(c, "versão")
	}
	if status == "pending" || status == "failed" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "a versão ainda não terminou de subir", "code": "NOT_UPLOADED",
		})
	}
	_, err = h.db.Exec(c.Context(), `
		UPDATE atlas_document_version SET status='published', published_at=now()
		WHERE id=$1`, versionID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": versionID, "status": "published"}})
}

// GET /atlas/versions/:id/download — assinatura curta de leitura.
func (h *AtlasHandler) VersionDownloadURL(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	var key string
	if err := h.db.QueryRow(c.Context(),
		`SELECT r2_key FROM atlas_document_version WHERE id=$1`, versionID).Scan(&key); err != nil {
		return atlasNotFound(c, "versão")
	}
	url, err := h.r2.DownloadURL(c.Context(), key, 30*time.Minute)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"url": url, "expiresIn": 1800}})
}

// ── Folhas ──────────────────────────────────────────────────────────────────

type atlasSheet struct {
	ID          string   `json:"id"`
	VersionID   string   `json:"versionId"`
	PageIndex   int      `json:"pageIndex"`
	SheetNumber string   `json:"sheetNumber"`
	Discipline  string   `json:"discipline"`
	Level       string   `json:"level"`
	Title       string   `json:"title"`
	Revision    string   `json:"revision"`
	ThumbKey    string   `json:"thumbKey"`
	WidthPt     *float64 `json:"widthPt"`
	HeightPt    *float64 `json:"heightPt"`
	Confidence  float64  `json:"confidence"`
	NeedsReview bool     `json:"needsReview"`
	Annotations int      `json:"annotations"`
}

// GET /atlas/versions/:id/sheets
func (h *AtlasHandler) ListSheets(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT s.id, s.version_id, s.page_index, s.sheet_number, s.discipline, s.level,
		       s.title, s.revision, s.thumb_key, s.width_pt, s.height_pt,
		       s.confidence, s.needs_review,
		       (SELECT count(*) FROM atlas_annotation a
		         WHERE a.sheet_id = s.id AND a.deleted_at IS NULL)
		FROM atlas_sheet s WHERE s.version_id = $1 ORDER BY s.page_index`, versionID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasSheet{}
	for rows.Next() {
		var s atlasSheet
		if err := rows.Scan(&s.ID, &s.VersionID, &s.PageIndex, &s.SheetNumber, &s.Discipline,
			&s.Level, &s.Title, &s.Revision, &s.ThumbKey, &s.WidthPt, &s.HeightPt,
			&s.Confidence, &s.NeedsReview, &s.Annotations); err != nil {
			return internalErr(c, err)
		}
		out = append(out, s)
	}
	return c.JSON(fiber.Map{"data": out})
}

// PUT /atlas/versions/:id/sheets
//
// A porta de entrada do resultado da fragmentação. O mecanismo que decide o que
// é uma folha ainda está em discussão (AT-10/AT-11): pode ser uma rotina no
// backend, um worker separado ou um passo manual. Todos terminam aqui, com a
// mesma lista — por isso o endpoint existe antes da decisão, e é idempotente:
// reprocessar a mesma versão corrige o metadado sem duplicar folha e sem
// derrubar as anotações já presas a ela.
func (h *AtlasHandler) ReplaceSheets(c *fiber.Ctx) error {
	versionID := c.Params("id")
	jobsiteID, _, err := h.versionContext(c, versionID)
	if err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		Sheets []atlasSheet `json:"sheets"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalErr(c, err)
	}
	defer func() { _ = tx.Rollback(c.Context()) }()

	for _, s := range in.Sheets {
		id := s.ID
		if strings.TrimSpace(id) == "" {
			id = uuid.NewString()
		}
		if _, err := tx.Exec(c.Context(), `
			INSERT INTO atlas_sheet
				(id, version_id, page_index, sheet_number, discipline, level, title,
				 revision, thumb_key, width_pt, height_pt, confidence, needs_review)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			ON CONFLICT (version_id, page_index) DO UPDATE SET
				sheet_number = EXCLUDED.sheet_number,
				discipline   = EXCLUDED.discipline,
				level        = EXCLUDED.level,
				title        = EXCLUDED.title,
				revision     = EXCLUDED.revision,
				thumb_key    = COALESCE(NULLIF(EXCLUDED.thumb_key,''), atlas_sheet.thumb_key),
				width_pt     = COALESCE(EXCLUDED.width_pt, atlas_sheet.width_pt),
				height_pt    = COALESCE(EXCLUDED.height_pt, atlas_sheet.height_pt),
				confidence   = EXCLUDED.confidence,
				needs_review = EXCLUDED.needs_review`,
			id, versionID, s.PageIndex, s.SheetNumber, s.Discipline, s.Level, s.Title,
			s.Revision, s.ThumbKey, s.WidthPt, s.HeightPt, s.Confidence, s.NeedsReview,
		); err != nil {
			return internalErr(c, err)
		}
	}
	if len(in.Sheets) > 0 {
		if _, err := tx.Exec(c.Context(), `
			UPDATE atlas_document_version SET page_count = GREATEST(page_count, $2)
			WHERE id = $1`, versionID, len(in.Sheets)); err != nil {
			return internalErr(c, err)
		}
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"versionId": versionID, "sheets": len(in.Sheets)}})
}

// PATCH /atlas/sheets/:id — a correção manual do que o carimbo não entregou.
func (h *AtlasHandler) UpdateSheet(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	jobsiteID, _, err := h.sheetContext(c, sheetID)
	if err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	reviewed := patch["needsReview"] == false
	_, err = h.db.Exec(c.Context(), `
		UPDATE atlas_sheet SET
			sheet_number = COALESCE($2, sheet_number),
			discipline   = COALESCE($3, discipline),
			level        = COALESCE($4, level),
			title        = COALESCE($5, title),
			revision     = COALESCE($6, revision),
			needs_review = CASE WHEN $7 THEN false ELSE needs_review END
		WHERE id = $1`,
		sheetID, strPtr(patch, "sheetNumber"), strPtr(patch, "discipline"),
		strPtr(patch, "level"), strPtr(patch, "title"), strPtr(patch, "revision"), reviewed)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": sheetID}})
}

// ── Anotações ───────────────────────────────────────────────────────────────

type atlasAnnotation struct {
	ID        string          `json:"id"`
	SheetID   string          `json:"sheetId"`
	AuthorID  string          `json:"authorId"`
	Tool      string          `json:"tool"`
	Color     string          `json:"color"`
	Width     float64         `json:"width"`
	Opacity   float64         `json:"opacity"`
	Geometry  json.RawMessage `json:"geometry"`
	CreatedAt string          `json:"createdAt"`
}

// GET /atlas/sheets/:id/annotations
func (h *AtlasHandler) ListAnnotations(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	jobsiteID, _, err := h.sheetContext(c, sheetID)
	if err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT id, sheet_id, author_id, tool, color, width, opacity, geometry, created_at
		FROM atlas_annotation
		WHERE sheet_id = $1 AND deleted_at IS NULL
		ORDER BY created_at`, sheetID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasAnnotation{}
	for rows.Next() {
		var a atlasAnnotation
		var created time.Time
		if err := rows.Scan(&a.ID, &a.SheetID, &a.AuthorID, &a.Tool, &a.Color,
			&a.Width, &a.Opacity, &a.Geometry, &created); err != nil {
			return internalErr(c, err)
		}
		a.CreatedAt = created.Format(time.RFC3339)
		out = append(out, a)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/sheets/:id/annotations
//
// O id vem do cliente e a gravação é idempotente. É o que permite anotar sem
// rede e sincronizar depois: reenviar o mesmo traço não cria um segundo.
func (h *AtlasHandler) CreateAnnotation(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	jobsiteID, _, err := h.sheetContext(c, sheetID)
	if err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var in atlasAnnotation
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if len(in.Geometry) == 0 {
		return badRequest(c, "geometry is required")
	}
	if strings.TrimSpace(in.ID) == "" {
		in.ID = uuid.NewString()
	}
	userID, _ := actor(c)
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO atlas_annotation (id, sheet_id, author_id, tool, color, width, opacity, geometry)
		VALUES ($1,$2,$3,COALESCE(NULLIF($4,''),'pen'),COALESCE(NULLIF($5,''),'#ef4444'),
		        COALESCE(NULLIF($6,0),2), COALESCE(NULLIF($7,0),1), $8)
		ON CONFLICT (id) DO NOTHING`,
		in.ID, sheetID, userID, in.Tool, in.Color, in.Width, in.Opacity, string(in.Geometry))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": in.ID}})
}

// DELETE /atlas/annotations/:id — soft delete, pelo motivo escrito na migração:
// apagar o traço não pode apagar o registro de que ele existiu.
func (h *AtlasHandler) DeleteAnnotation(c *fiber.Ctx) error {
	annotationID := c.Params("id")
	var jobsiteID, authorID string
	err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, a.author_id
		FROM atlas_annotation a
		JOIN atlas_sheet s ON s.id = a.sheet_id
		JOIN atlas_document_version v ON v.id = s.version_id
		JOIN atlas_document d ON d.id = v.document_id
		WHERE a.id = $1`, annotationID).Scan(&jobsiteID, &authorID)
	if err != nil {
		return atlasNotFound(c, "anotação")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	// Traço dos outros só sai pela mão de quem gerencia a obra.
	userID, _ := actor(c)
	if authorID != userID {
		if err := h.require(c, jobsiteID, "manage"); err != nil {
			return atlasForbidden(c)
		}
	}
	if _, err := h.db.Exec(c.Context(),
		`UPDATE atlas_annotation SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
		annotationID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": annotationID}})
}

// ── Eventos ─────────────────────────────────────────────────────────────────

type atlasEvent struct {
	ID         string          `json:"id"`
	JobsiteID  string          `json:"jobsiteId"`
	SheetID    *string         `json:"sheetId"`
	Kind       string          `json:"kind"`
	Title      string          `json:"title"`
	Body       string          `json:"body"`
	Status     string          `json:"status"`
	PageX      *float64        `json:"pageX"`
	PageY      *float64        `json:"pageY"`
	Region     json.RawMessage `json:"region"`
	CreatedBy  string          `json:"createdBy"`
	CreatedAt  string          `json:"createdAt"`
	ResolvedBy *string         `json:"resolvedBy"`
	ResolvedAt *string         `json:"resolvedAt"`
	Replies    int             `json:"replies"`
	Media      int             `json:"media"`
}

// GET /atlas/jobsites/:id/events — aceita ?sheetId= para a folha aberta.
func (h *AtlasHandler) ListEvents(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	sheetID := c.Query("sheetId")
	rows, err := h.db.Query(c.Context(), `
		SELECT e.id, e.jobsite_id, e.sheet_id, e.kind, e.title, e.body, e.status,
		       e.page_x, e.page_y, e.region, e.created_by, e.created_at,
		       e.resolved_by, e.resolved_at,
		       (SELECT count(*) FROM atlas_event_reply r WHERE r.event_id = e.id),
		       (SELECT count(*) FROM atlas_media m WHERE m.event_id = e.id AND m.status = 'uploaded')
		FROM atlas_event e
		WHERE e.jobsite_id = $1 AND ($2 = '' OR e.sheet_id = $2)
		ORDER BY e.created_at DESC`, jobsiteID, sheetID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasEvent{}
	for rows.Next() {
		var e atlasEvent
		var created time.Time
		var resolved *time.Time
		if err := rows.Scan(&e.ID, &e.JobsiteID, &e.SheetID, &e.Kind, &e.Title, &e.Body,
			&e.Status, &e.PageX, &e.PageY, &e.Region, &e.CreatedBy, &created,
			&e.ResolvedBy, &resolved, &e.Replies, &e.Media); err != nil {
			return internalErr(c, err)
		}
		e.CreatedAt = created.Format(time.RFC3339)
		e.ResolvedAt = isoOrNil(resolved)
		out = append(out, e)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/jobsites/:id/events
func (h *AtlasHandler) CreateEvent(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var in atlasEvent
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.Title) == "" && strings.TrimSpace(in.Body) == "" {
		return badRequest(c, "title or body is required")
	}
	userID, _ := actor(c)
	id := in.ID
	if strings.TrimSpace(id) == "" {
		id = uuid.NewString()
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_event
			(id, jobsite_id, sheet_id, kind, title, body, page_x, page_y, region, created_by)
		VALUES ($1,$2,$3,COALESCE(NULLIF($4,''),'comment'),$5,$6,$7,$8,$9,$10)
		ON CONFLICT (id) DO NOTHING`,
		id, jobsiteID, in.SheetID, in.Kind, in.Title, in.Body,
		in.PageX, in.PageY, rawOrNil(in.Region), userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// PATCH /atlas/events/:id
func (h *AtlasHandler) UpdateEvent(c *fiber.Ctx) error {
	eventID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_event WHERE id = $1`, eventID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "evento")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	userID, _ := actor(c)
	status := strPtr(patch, "status")
	_, err := h.db.Exec(c.Context(), `
		UPDATE atlas_event SET
			title  = COALESCE($2, title),
			body   = COALESCE($3, body),
			kind   = COALESCE($4, kind),
			status = COALESCE($5, status),
			resolved_by = CASE WHEN $5 = 'resolved' THEN $6 ELSE resolved_by END,
			resolved_at = CASE WHEN $5 = 'resolved' THEN now() ELSE resolved_at END
		WHERE id = $1`,
		eventID, strPtr(patch, "title"), strPtr(patch, "body"), strPtr(patch, "kind"),
		status, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": eventID}})
}

// GET /atlas/events/:id/replies
func (h *AtlasHandler) ListReplies(c *fiber.Ctx) error {
	eventID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_event WHERE id = $1`, eventID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "evento")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT r.id, r.author_id, COALESCE(u.name,''), r.body, r.created_at
		FROM atlas_event_reply r
		LEFT JOIN users u ON u.id = r.author_id
		WHERE r.event_id = $1 ORDER BY r.created_at`, eventID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type reply struct {
		ID         string `json:"id"`
		AuthorID   string `json:"authorId"`
		AuthorName string `json:"authorName"`
		Body       string `json:"body"`
		CreatedAt  string `json:"createdAt"`
	}
	out := []reply{}
	for rows.Next() {
		var r reply
		var created time.Time
		if err := rows.Scan(&r.ID, &r.AuthorID, &r.AuthorName, &r.Body, &created); err != nil {
			return internalErr(c, err)
		}
		r.CreatedAt = created.Format(time.RFC3339)
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/events/:id/replies
func (h *AtlasHandler) CreateReply(c *fiber.Ctx) error {
	eventID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_event WHERE id = $1`, eventID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "evento")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&in); err != nil || strings.TrimSpace(in.Body) == "" {
		return badRequest(c, "body is required")
	}
	userID, _ := actor(c)
	id := uuid.NewString()
	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalErr(c, err)
	}
	defer func() { _ = tx.Rollback(c.Context()) }()

	if _, err := tx.Exec(c.Context(), `
		INSERT INTO atlas_event_reply (id, event_id, author_id, body) VALUES ($1,$2,$3,$4)`,
		id, eventID, userID, strings.TrimSpace(in.Body)); err != nil {
		return internalErr(c, err)
	}
	// Responder move o evento de "aberto" para "respondido"; um evento já
	// resolvido não volta atrás por causa de um comentário.
	if _, err := tx.Exec(c.Context(), `
		UPDATE atlas_event SET status='answered' WHERE id=$1 AND status='open'`,
		eventID); err != nil {
		return internalErr(c, err)
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// ── Diário de obra ──────────────────────────────────────────────────────────

type atlasDailyLog struct {
	ID          string   `json:"id"`
	JobsiteID   string   `json:"jobsiteId"`
	LogDate     string   `json:"logDate"`
	Weather     string   `json:"weather"`
	Temperature *float64 `json:"temperature"`
	CrewSize    *int     `json:"crewSize"`
	Summary     string   `json:"summary"`
	CreatedBy   string   `json:"createdBy"`
	CreatedAt   string   `json:"createdAt"`
	Media       int      `json:"media"`
}

// GET /atlas/jobsites/:id/daily-logs — aceita ?from= e ?to= (YYYY-MM-DD).
func (h *AtlasHandler) ListDailyLogs(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT l.id, l.jobsite_id, l.log_date, l.weather, l.temperature, l.crew_size,
		       l.summary, l.created_by, l.created_at,
		       (SELECT count(*) FROM atlas_media m
		         WHERE m.daily_log_id = l.id AND m.status='uploaded')
		FROM atlas_daily_log l
		WHERE l.jobsite_id = $1
		  AND ($2 = '' OR l.log_date >= $2::date)
		  AND ($3 = '' OR l.log_date <= $3::date)
		ORDER BY l.log_date DESC, l.created_at DESC`,
		jobsiteID, c.Query("from"), c.Query("to"))
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasDailyLog{}
	for rows.Next() {
		var l atlasDailyLog
		var logDate, created time.Time
		if err := rows.Scan(&l.ID, &l.JobsiteID, &logDate, &l.Weather, &l.Temperature,
			&l.CrewSize, &l.Summary, &l.CreatedBy, &created, &l.Media); err != nil {
			return internalErr(c, err)
		}
		l.LogDate = logDate.Format("2006-01-02")
		l.CreatedAt = created.Format(time.RFC3339)
		out = append(out, l)
	}
	return c.JSON(fiber.Map{"data": out})
}

// POST /atlas/jobsites/:id/daily-logs
func (h *AtlasHandler) CreateDailyLog(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var in atlasDailyLog
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.LogDate) == "" {
		return badRequest(c, "logDate is required")
	}
	if _, err := time.Parse("2006-01-02", in.LogDate); err != nil {
		return badRequest(c, "logDate must be YYYY-MM-DD")
	}
	userID, _ := actor(c)
	id := uuid.NewString()
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_daily_log
			(id, jobsite_id, log_date, weather, temperature, crew_size, summary, created_by)
		VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8)`,
		id, jobsiteID, in.LogDate, in.Weather, in.Temperature, in.CrewSize, in.Summary, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// PATCH /atlas/daily-logs/:id
func (h *AtlasHandler) UpdateDailyLog(c *fiber.Ctx) error {
	logID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_daily_log WHERE id=$1`, logID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "registro")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE atlas_daily_log SET
			weather = COALESCE($2, weather),
			summary = COALESCE($3, summary),
			updated_at = now()
		WHERE id = $1`, logID, strPtr(patch, "weather"), strPtr(patch, "summary"))
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": logID}})
}

// ── Mídia ───────────────────────────────────────────────────────────────────

// POST /atlas/jobsites/:id/media — mesma dança das versões: linha `pending`,
// URL assinada, confirmação depois.
func (h *AtlasHandler) CreateMedia(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	var in struct {
		EventID     *string `json:"eventId"`
		DailyLogID  *string `json:"dailyLogId"`
		Kind        string  `json:"kind"`
		FileName    string  `json:"fileName"`
		ContentType string  `json:"contentType"`
		ByteSize    int64   `json:"byteSize"`
		Caption     string  `json:"caption"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if in.EventID == nil && in.DailyLogID == nil {
		return badRequest(c, "eventId or dailyLogId is required")
	}
	userID, _ := actor(c)
	id := uuid.NewString()
	key := service.MediaKey(jobsiteID, id, in.FileName)
	url, err := h.r2.UploadURL(c.Context(), key, in.ContentType, time.Hour)
	if err != nil {
		return internalErr(c, err)
	}
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO atlas_media
			(id, jobsite_id, event_id, daily_log_id, kind, r2_key, file_name,
			 content_type, byte_size, caption, uploaded_by)
		VALUES ($1,$2,$3,$4,COALESCE(NULLIF($5,''),'photo'),$6,$7,$8,$9,$10,$11)`,
		id, jobsiteID, in.EventID, in.DailyLogID, in.Kind, key, in.FileName,
		in.ContentType, in.ByteSize, in.Caption, userID)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"mediaId": id, "r2Key": key, "uploadUrl": url, "expiresIn": 3600,
	}})
}

// POST /atlas/media/:id/confirm
func (h *AtlasHandler) ConfirmMedia(c *fiber.Ctx) error {
	mediaID := c.Params("id")
	var jobsiteID, key string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id, r2_key FROM atlas_media WHERE id=$1`, mediaID).Scan(&jobsiteID, &key); err != nil {
		return atlasNotFound(c, "mídia")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	size, ctype, err := h.r2.Stat(c.Context(), key)
	if err != nil {
		_, _ = h.db.Exec(c.Context(), `UPDATE atlas_media SET status='failed' WHERE id=$1`, mediaID)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "arquivo não encontrado no storage", "code": "UPLOAD_INCOMPLETE",
		})
	}
	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_media SET status='uploaded', byte_size=$2,
			content_type = COALESCE(NULLIF($3,''), content_type)
		WHERE id=$1`, mediaID, size, ctype); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": mediaID, "byteSize": size}})
}

// GET /atlas/media/:id/url
func (h *AtlasHandler) MediaURL(c *fiber.Ctx) error {
	mediaID := c.Params("id")
	var jobsiteID, key string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id, r2_key FROM atlas_media WHERE id=$1`, mediaID).Scan(&jobsiteID, &key); err != nil {
		return atlasNotFound(c, "mídia")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	url, err := h.r2.DownloadURL(c.Context(), key, 30*time.Minute)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"url": url, "expiresIn": 1800}})
}

// GET /atlas/jobsites/:id/media — o que está pendurado em eventos e no diário,
// já com URL assinada, para a galeria da sala da obra não pedir uma por uma.
func (h *AtlasHandler) ListMedia(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	limit := 60
	if n, err := strconv.Atoi(c.Query("limit")); err == nil && n > 0 && n <= 200 {
		limit = n
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT id, event_id, daily_log_id, kind, r2_key, file_name, content_type,
		       byte_size, caption, uploaded_by, uploaded_at
		FROM atlas_media
		WHERE jobsite_id = $1 AND status = 'uploaded'
		  AND ($2 = '' OR event_id = $2)
		  AND ($3 = '' OR daily_log_id = $3)
		ORDER BY uploaded_at DESC LIMIT $4`,
		jobsiteID, c.Query("eventId"), c.Query("dailyLogId"), limit)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type media struct {
		ID          string  `json:"id"`
		EventID     *string `json:"eventId"`
		DailyLogID  *string `json:"dailyLogId"`
		Kind        string  `json:"kind"`
		FileName    string  `json:"fileName"`
		ContentType string  `json:"contentType"`
		ByteSize    int64   `json:"byteSize"`
		Caption     string  `json:"caption"`
		UploadedBy  string  `json:"uploadedBy"`
		UploadedAt  string  `json:"uploadedAt"`
		URL         string  `json:"url"`
	}
	out := []media{}
	keys := []string{}
	for rows.Next() {
		var m media
		var key string
		var uploaded time.Time
		if err := rows.Scan(&m.ID, &m.EventID, &m.DailyLogID, &m.Kind, &key, &m.FileName,
			&m.ContentType, &m.ByteSize, &m.Caption, &m.UploadedBy, &uploaded); err != nil {
			return internalErr(c, err)
		}
		m.UploadedAt = uploaded.Format(time.RFC3339)
		out = append(out, m)
		keys = append(keys, key)
	}
	if h.r2.Configured() {
		for i := range out {
			if url, err := h.r2.DownloadURL(c.Context(), keys[i], 30*time.Minute); err == nil {
				out[i].URL = url
			}
		}
	}
	return c.JSON(fiber.Map{"data": out})
}

// ── Sala da obra ────────────────────────────────────────────────────────────

// GET /atlas/jobsites/:id — a obra com o que a sala precisa para abrir: a obra,
// o nível do usuário nela e os números que o cabeçalho mostra. Uma chamada em
// vez de quatro, porque esta tela abre em tablet com sinal de obra.
func (h *AtlasHandler) GetJobsite(c *fiber.Ctx) error {
	id := c.Params("id")
	level, err := h.jobsiteLevel(c, id)
	if err != nil {
		return atlasForbidden(c)
	}
	var j atlasJobsite
	var created time.Time
	err = h.db.QueryRow(c.Context(), `
		SELECT j.id, j.name, j.address, j.client, j.code, j.status,
		       j.catalog_job_site_id, j.created_by, j.created_at,
		       (SELECT count(*) FROM atlas_document d
		         WHERE d.jobsite_id = j.id AND d.archived_at IS NULL),
		       (SELECT count(*) FROM atlas_event e
		         WHERE e.jobsite_id = j.id AND e.status <> 'resolved')
		FROM atlas_jobsite j WHERE j.id = $1`, id).
		Scan(&j.ID, &j.Name, &j.Address, &j.Client, &j.Code, &j.Status,
			&j.CatalogSiteID, &j.CreatedBy, &created, &j.Documents, &j.OpenEvents)
	if errors.Is(err, pgx.ErrNoRows) {
		return atlasNotFound(c, "obra")
	}
	if err != nil {
		return internalErr(c, err)
	}
	j.CreatedAt = created.Format(time.RFC3339)
	j.Level = level
	return c.JSON(fiber.Map{"data": j})
}

func isoOrNil(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}
