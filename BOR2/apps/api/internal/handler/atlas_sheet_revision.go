package handler

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/bitencourtVitor/bor2-api/internal/service"
)

// Revisão de uma folha só, sem refazer o set.
//
// O projetista não manda o set de volta: manda a prancha corrigida. Antes disto
// trocar uma folha significava subir as 97 de novo, o que gastava upload à toa e
// — pior — apagava as folhas antigas junto, levando as anotações feitas sobre
// elas.
//
// Aqui a página tem linhagem: a folha em vigor é a que ninguém sucedeu, e as
// anteriores ficam guardadas com quem as trocou, quando, e com que nome e
// observação. As anotações não migram entre revisões de propósito. Elas foram
// feitas sobre um desenho, e aquele desenho continua existindo na revisão em
// que foram feitas; carregá-las para a prancha nova as poria sobre traços que
// mudaram de lugar.

// atlasSheetRevision é uma linha do histórico de uma página.
type atlasSheetRevision struct {
	ID          string `json:"id"`
	PageIndex   int    `json:"pageIndex"`
	SheetNumber string `json:"sheetNumber"`
	Name        string `json:"name"`
	Notes       string `json:"notes"`
	RevisedBy   string `json:"revisedBy"`
	// O cargo de quem revisou, que na tela vira o crachá ao lado do nome.
	RevisedRole string `json:"revisedRole"`
	RevisedAt   string `json:"revisedAt"`
	// Vazio na folha que está valendo.
	SupersededAt string `json:"supersededAt"`
	R2Key        string `json:"r2Key"`
	ThumbKey     string `json:"thumbKey"`
	ByteSize     int64  `json:"byteSize"`
	Annotations  int    `json:"annotations"`
	// O que foi anexado à justificativa: a foto do que se achou em obra, o
	// recorte do e-mail do projetista. Vem junto do histórico porque é lendo o
	// histórico que alguém pergunta "por que trocou".
	Attachments []atlasRevisionFile `json:"attachments"`
}

// atlasRevisionFile é um anexo da justificativa.
type atlasRevisionFile struct {
	ID          string `json:"id"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	ByteSize    int64  `json:"byteSize"`
}

// POST /atlas/sheets/:id/revisions — onde gravar a prancha nova.
//
// A folha nova ganha id aqui, antes do upload, porque é o id que endereça o
// objeto no bucket. Assinar e só depois decidir o id daria dois nomes para a
// mesma coisa.
func (h *AtlasHandler) OpenSheetRevision(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	jobsiteID, versionID, err := h.sheetContext(c, sheetID)
	if err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}

	newID := uuid.NewString()
	planKey := service.SheetKey(jobsiteID, versionID, newID)
	thumbKey := service.SheetThumbKey(jobsiteID, versionID, newID)

	planURL, err := h.r2.UploadURL(c.Context(), planKey, "application/pdf", 2*time.Hour)
	if err != nil {
		return internalErr(c, err)
	}
	thumbURL, err := h.r2.UploadURL(c.Context(), thumbKey, "image/jpeg", 2*time.Hour)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"sheetId":        newID,
		"r2Key":          planKey,
		"uploadUrl":      planURL,
		"thumbKey":       thumbKey,
		"thumbUploadUrl": thumbURL,
	}})
}

// PUT /atlas/sheets/:id/revisions — a prancha nova passa a valer.
//
// Só depois que o objeto está no bucket: se o upload falhou, nada aqui rodou e
// a folha antiga continua sendo a folha.
func (h *AtlasHandler) CommitSheetRevision(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	jobsiteID, versionID, err := h.sheetContext(c, sheetID)
	if err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	var in struct {
		SheetID  string   `json:"sheetId"`
		R2Key    string   `json:"r2Key"`
		ThumbKey string   `json:"thumbKey"`
		ByteSize int64    `json:"byteSize"`
		WidthPt  *float64 `json:"widthPt"`
		HeightPt *float64 `json:"heightPt"`
		Name     string   `json:"name"`
		Notes    string   `json:"notes"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if strings.TrimSpace(in.SheetID) == "" || strings.TrimSpace(in.R2Key) == "" {
		return badRequest(c, "sheetId and r2Key are required")
	}
	userID, _ := actor(c)

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalErr(c, err)
	}
	defer func() { _ = tx.Rollback(c.Context()) }()

	// Suceder e inserir na mesma transação: entre as duas a página ficaria sem
	// folha em vigor, e a lista abriria com um buraco.
	tag, err := tx.Exec(c.Context(),
		`UPDATE atlas_sheet SET superseded_at = now() WHERE id = $1 AND superseded_at IS NULL`,
		sheetID)
	if err != nil {
		return internalErr(c, err)
	}
	if tag.RowsAffected() == 0 {
		return badRequest(c, "this sheet is not the current one")
	}

	// O que identifica a folha — número, disciplina, nível, título — vem da que
	// saiu: a prancha corrigida é a mesma prancha. O que muda é o desenho.
	if _, err := tx.Exec(c.Context(), `
		INSERT INTO atlas_sheet
			(id, version_id, page_index, sheet_number, discipline, level, title,
			 revision, thumb_key, width_pt, height_pt, confidence, needs_review,
			 r2_key, byte_size, revised_at, revised_by, version_name, version_notes)
		SELECT $1, s.version_id, s.page_index, s.sheet_number, s.discipline, s.level,
		       s.title, s.revision,
		       COALESCE(NULLIF($3,''), s.thumb_key),
		       COALESCE($4, s.width_pt), COALESCE($5, s.height_pt),
		       s.confidence, s.needs_review,
		       $6, $7, now(), $8, $9, $10
		FROM atlas_sheet s WHERE s.id = $2`,
		in.SheetID, sheetID, in.ThumbKey, in.WidthPt, in.HeightPt,
		in.R2Key, in.ByteSize, userID, strings.TrimSpace(in.Name),
		strings.TrimSpace(in.Notes)); err != nil {
		return internalErr(c, err)
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"sheetId": in.SheetID, "versionId": versionID, "supersededId": sheetID,
	}})
}

// GET /atlas/sheets/:id/history — todas as revisões desta página.
func (h *AtlasHandler) SheetHistory(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	jobsiteID, _, err := h.sheetContext(c, sheetID)
	if err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT s.id, s.page_index, s.sheet_number, s.version_name, s.version_notes,
		       -- A folha que veio no set não tem quem a revisou: ela nasceu do
		       -- envio, e quem a pôs ali é quem subiu o set. Sem esta segunda
		       -- fonte, a revisão original ficava anônima.
		       COALESCE(NULLIF(u.name,''), vu.name, ''),
		       COALESCE(NULLIF(u.role::text,''), vu.role::text, ''),
		       s.revised_at, s.superseded_at,
		       s.r2_key, s.thumb_key, s.byte_size,
		       (SELECT count(*) FROM atlas_annotation a
		         WHERE a.sheet_id = s.id AND a.deleted_at IS NULL),
		       COALESCE((
		           SELECT json_agg(json_build_object(
		                      'id', m.id, 'fileName', m.file_name,
		                      'contentType', m.content_type, 'byteSize', m.byte_size)
		                  ORDER BY m.uploaded_at)
		           FROM atlas_media m
		           WHERE m.sheet_id = s.id AND m.status <> 'failed'
		       ), '[]')::text
		FROM atlas_sheet s
		LEFT JOIN users u ON u.id = s.revised_by
		LEFT JOIN atlas_document_version v ON v.id = s.version_id
		LEFT JOIN users vu ON vu.id = v.uploaded_by
		WHERE (s.version_id, s.page_index) = (
			SELECT version_id, page_index FROM atlas_sheet WHERE id = $1
		)
		-- A que vale primeiro, e o resto do mais novo ao mais velho. Empate de
		-- data acontece: a original herdou a data da migração.
		ORDER BY (s.superseded_at IS NULL) DESC, s.revised_at DESC`, sheetID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	out := []atlasSheetRevision{}
	for rows.Next() {
		var r atlasSheetRevision
		var revised time.Time
		var superseded *time.Time
		var files string
		if err := rows.Scan(&r.ID, &r.PageIndex, &r.SheetNumber, &r.Name, &r.Notes,
			&r.RevisedBy, &r.RevisedRole, &revised, &superseded, &r.R2Key, &r.ThumbKey,
			&r.ByteSize, &r.Annotations, &files); err != nil {
			return internalErr(c, err)
		}
		r.Attachments = []atlasRevisionFile{}
		if files != "" {
			_ = json.Unmarshal([]byte(files), &r.Attachments)
		}
		r.RevisedAt = revised.Format(time.RFC3339)
		if superseded != nil {
			r.SupersededAt = superseded.Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}
