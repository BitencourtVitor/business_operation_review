package handler

import (
	"github.com/gofiber/fiber/v2"
)

// A revisão parcial: trocar algumas folhas sem reemitir o set.
//
// Subir revisão hoje é subir o set inteiro. É o certo quando o projetista
// reemite as 51 pranchas, e é desproporcional no caso comum, que é uma folha ter
// sido corrigida: reemitir 51 para trocar uma faz o campo rebaixar 107 MB por
// causa de 2 MB, e apaga o histórico das 50 que não mudaram.
//
// A saída não é escrever por cima da folha antiga. Isso destruiria o que a
// revisão existe para preservar: a prancha que estava valendo quando alguém
// executou a partir dela. A saída é a versão continuar sendo criada e **herdar**
// as folhas que ninguém tocou.
//
// A herança é barata porque as duas linhas apontam para a mesma chave de R2: o
// objeto é gravado uma vez. O que se paga é uma linha de folha, que é metadado.

// POST /atlas/versions/:id/inherit
//
// Completa uma versão nova com as folhas da anterior que não foram substituídas.
//
// Chamada depois de o cliente ter criado as folhas que de fato mudaram. O que
// sobra do intervalo declarado é preenchido a partir da versão anterior, e é por
// isso que a rota precisa saber o escopo: sem ele não há como distinguir "esta
// página não mudou" de "esta página foi removida da revisão".
func (h *AtlasHandler) InheritSheets(c *fiber.Ctx) error {
	versionID := c.Params("id")

	var jobsiteID, documentID string
	if err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, d.id
		  FROM atlas_document_version v
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE v.id = $1`, versionID).Scan(&jobsiteID, &documentID); err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	var in struct {
		// `full` recusa: uma versão que reemite tudo não herda nada, e chamar
		// esta rota nela é sinal de engano em quem chamou.
		Scope string `json:"scope"`
		// As páginas que esta revisão de fato troca, em índice de página.
		Pages []int `json:"pages"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if in.Scope != "range" && in.Scope != "single" {
		return badRequest(c, "scope deve ser range ou single; full não herda nada")
	}
	if len(in.Pages) == 0 {
		return badRequest(c, "informe as páginas que esta revisão troca")
	}

	// A versão anterior é a de `seq` imediatamente menor. Não é a mais recente
	// por data: numa reimportação as duas podem ter a mesma hora, e `seq` é a
	// ordem que a migração 000152 tornou determinística justamente para casos
	// assim.
	var anterior string
	if err := h.db.QueryRow(c.Context(), `
		SELECT v.id FROM atlas_document_version v
		 WHERE v.document_id = $1
		   AND v.seq < (SELECT seq FROM atlas_document_version WHERE id = $2)
		 ORDER BY v.seq DESC LIMIT 1`, documentID, versionID).Scan(&anterior); err != nil {
		return badRequest(c, "esta é a primeira versão da pasta; não há de onde herdar")
	}

	// Herda tudo da anterior que não está no intervalo trocado, e que a versão
	// nova ainda não tem. A dupla condição importa: sem a segunda, chamar a rota
	// duas vezes duplicaria as folhas herdadas.
	//
	// A chave de R2 é copiada, não regravada. É isso que faz a revisão parcial
	// custar metadado em vez de banda.
	tag, err := h.db.Exec(c.Context(), `
		INSERT INTO atlas_sheet
			(id, version_id, page_index, sheet_number, discipline, level, title,
			 revision, thumb_key, width_pt, height_pt, r2_key, byte_size,
			 text_hash, geom_hash, inherited_from)
		SELECT gen_random_uuid()::text, $1, s.page_index, s.sheet_number, s.discipline,
		       s.level, s.title, s.revision, s.thumb_key, s.width_pt, s.height_pt,
		       s.r2_key, s.byte_size, s.text_hash, s.geom_hash, s.id
		  FROM atlas_sheet s
		 WHERE s.version_id = $2
		   AND NOT (s.page_index = ANY($3::int[]))
		   AND NOT EXISTS (SELECT 1 FROM atlas_sheet n
		                    WHERE n.version_id = $1 AND n.page_index = s.page_index)`,
		versionID, anterior, in.Pages)
	if err != nil {
		return internalErr(c, err)
	}

	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_document_version SET scope = $2, scope_pages = $3 WHERE id = $1`,
		versionID, in.Scope, in.Pages); err != nil {
		return internalErr(c, err)
	}

	var total int
	_ = h.db.QueryRow(c.Context(),
		`SELECT count(*) FROM atlas_sheet WHERE version_id = $1`, versionID).Scan(&total)

	return c.JSON(fiber.Map{"data": fiber.Map{
		"versionId": versionID, "herdadaDe": anterior,
		"herdadas": tag.RowsAffected(), "trocadas": len(in.Pages), "total": total,
		"scope": in.Scope,
	}})
}

// GET /atlas/versions/:id/diff
//
// O que esta revisão mudou em relação à anterior.
//
// Existe para a tela poder dizer "trocou 3 folhas" em vez de listar 51 e deixar
// quem lê procurar a diferença. E para o aviso de sobrescrita: quem mantém a
// pasta no aparelho precisa saber se vale rebaixar tudo ou se mudaram três
// páginas.
func (h *AtlasHandler) VersionDiff(c *fiber.Ctx) error {
	versionID := c.Params("id")

	var jobsiteID, documentID, scope string
	var pages []int32
	if err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, d.id, v.scope, v.scope_pages
		  FROM atlas_document_version v
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE v.id = $1`, versionID).Scan(&jobsiteID, &documentID, &scope, &pages); err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "read"); err != nil {
		return atlasForbidden(c)
	}

	var novas, herdadas int
	_ = h.db.QueryRow(c.Context(), `
		SELECT count(*) FILTER (WHERE inherited_from IS NULL),
		       count(*) FILTER (WHERE inherited_from IS NOT NULL)
		  FROM atlas_sheet WHERE version_id = $1`, versionID).Scan(&novas, &herdadas)

	return c.JSON(fiber.Map{"data": fiber.Map{
		"versionId": versionID, "scope": scope, "scopePages": pages,
		"novas": novas, "herdadas": herdadas, "total": novas + herdadas,
	}})
}
