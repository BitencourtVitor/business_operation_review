package handler

import (
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/gofiber/fiber/v2"
)

// A descrição falada do ponto, em duas etapas separadas.
//
// Separadas porque a tela precisa mostrar as duas, e porque uma delas pode estar
// certa com a outra errada. Quem gravou vê o que foi transcrito antes de ver o
// que o agente entendeu, e corrige no meio do caminho em vez de descobrir no
// relatório.
//
// O áudio já está no bucket quando estas rotas são chamadas: ele sobe pelo mesmo
// caminho de qualquer mídia, com URL assinada e confirmação. Aqui o servidor só
// busca os bytes e conversa com o modelo, porque a credencial de IA não pode
// morar no aparelho.

func (h *AtlasHandler) midiaDoDitado(c *fiber.Ctx) (jobsiteID, key, contentType, eventID string, err error) {
	err = h.db.QueryRow(c.Context(), `
		SELECT jobsite_id, r2_key, content_type, COALESCE(event_id,'')
		  FROM atlas_media WHERE id = $1`, c.Params("id")).
		Scan(&jobsiteID, &key, &contentType, &eventID)
	return
}

// POST /atlas/media/:id/transcribe
func (h *AtlasHandler) TranscribeMedia(c *fiber.Ctx) error {
	jobsiteID, key, contentType, _, err := h.midiaDoDitado(c)
	if err != nil {
		return atlasNotFound(c, "mídia")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	if h.ditado == nil || !h.ditado.Configurado() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "speech to text is not configured on this server",
			"code":  "DICTATION_UNAVAILABLE",
		})
	}
	formato := service.FormatoDoAudio(contentType)
	if formato == "" {
		return badRequest(c, "audio must be wav or mp3")
	}
	if !h.r2.Configured() {
		return atlasNoStorage(c)
	}
	url, err := h.r2.DownloadURL(c.Context(), key, 10*time.Minute)
	if err != nil {
		return internalErr(c, err)
	}
	audio, err := h.ditado.BaixarAudio(c.Context(), url)
	if err != nil {
		return internalErr(c, err)
	}
	texto, err := h.ditado.Transcrever(c.Context(), audio, formato)
	if err != nil {
		// O modelo fora do ar não pode derrubar o registro do ponto. A gravação
		// continua no aparelho e no bucket, e a transcrição se repete depois.
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "could not transcribe this recording", "code": "DICTATION_FAILED",
		})
	}
	if _, err := h.db.Exec(c.Context(),
		`UPDATE atlas_media SET transcript = $2 WHERE id = $1`, c.Params("id"), texto); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"transcript": texto}})
}

// POST /atlas/media/:id/topics
//
// Lê a transcrição guardada e devolve os tópicos. O corpo pode trazer um texto
// corrigido à mão: quem ouviu o áudio sabe mais que o modelo, e a correção vira
// a base da leitura em vez de ser descartada.
func (h *AtlasHandler) MediaTopics(c *fiber.Ctx) error {
	jobsiteID, _, _, eventID, err := h.midiaDoDitado(c)
	if err != nil {
		return atlasNotFound(c, "mídia")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	if h.ditado == nil || !h.ditado.Configurado() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "speech to text is not configured on this server",
			"code":  "DICTATION_UNAVAILABLE",
		})
	}
	var in struct {
		Transcript string `json:"transcript"`
	}
	_ = c.BodyParser(&in)

	texto := strings.TrimSpace(in.Transcript)
	if texto == "" {
		_ = h.db.QueryRow(c.Context(),
			`SELECT transcript FROM atlas_media WHERE id = $1`, c.Params("id")).Scan(&texto)
	} else {
		_, _ = h.db.Exec(c.Context(),
			`UPDATE atlas_media SET transcript = $2 WHERE id = $1`, c.Params("id"), texto)
	}
	if strings.TrimSpace(texto) == "" {
		return badRequest(c, "there is nothing transcribed to read")
	}

	// O contexto da obra não se adivinha: já está gravado. Faltando o ponto, a
	// leitura sai só com o nome da obra, que ainda é melhor que nada.
	ctxObra := service.ContextoDaObra{}
	_ = h.db.QueryRow(c.Context(), `
		SELECT COALESCE(j.name,''), COALESCE(j.kind,'')
		  FROM atlas_jobsite j WHERE j.id = $1`, jobsiteID).
		Scan(&ctxObra.Obra, &ctxObra.TipoDeObra)
	if eventID != "" {
		_ = h.db.QueryRow(c.Context(), `
			SELECT COALESCE(esc.scope_value,''), COALESCE(d.name,''), COALESCE(s.sheet_number,'')
			  FROM atlas_event e
			  JOIN atlas_sheet s              ON s.id = e.sheet_id
			  JOIN atlas_document_version v   ON v.id = s.version_id
			  JOIN atlas_document d           ON d.id = v.document_id
			  JOIN atlas_documento_escopo esc ON esc.document_id = d.id
			 WHERE e.id = $1`, eventID).
			Scan(&ctxObra.Categoria, &ctxObra.Pasta, &ctxObra.Folha)
	}

	topicos, err := h.ditado.Topicos(c.Context(), texto, ctxObra)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "could not read this transcription", "code": "DICTATION_FAILED",
		})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"transcript": texto, "topics": topicos}})
}

// PATCH /atlas/media/:id
//
// O que a peça mostra, escrito por quem anexou. Existe para a solução de um
// ponto: cada foto ou vídeo do que foi feito ganha título e descrição, e é isso
// que o relatório imprime dentro do container.
func (h *AtlasHandler) UpdateMedia(c *fiber.Ctx) error {
	mediaID := c.Params("id")
	var jobsiteID string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id FROM atlas_media WHERE id=$1`, mediaID).Scan(&jobsiteID); err != nil {
		return atlasNotFound(c, "mídia")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}
	var patch map[string]any
	if err := c.BodyParser(&patch); err != nil {
		return badRequest(c, "invalid body")
	}
	fase := strPtr(patch, "phase")
	if texto, ok := fase.(string); ok && texto != "before" && texto != "after" {
		return badRequest(c, "phase must be before or after")
	}
	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_media SET
			title       = COALESCE($2, title),
			description = COALESCE($3, description),
			caption     = COALESCE($4, caption),
			transcript  = COALESCE($5, transcript),
			phase       = COALESCE($6, phase)
		WHERE id = $1`, mediaID,
		strPtr(patch, "title"), strPtr(patch, "description"), strPtr(patch, "caption"),
		strPtr(patch, "transcript"), fase); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": mediaID}})
}
