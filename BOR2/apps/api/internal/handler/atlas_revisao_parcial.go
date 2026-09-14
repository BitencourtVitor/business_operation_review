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
		// As páginas da versão anterior que saem, em índice de página.
		Pages []int `json:"pages"`
		// Quantas páginas entram no lugar delas. Zero é o mesmo número que sai.
		//
		// O que entra não precisa ter o tamanho do que sai: três páginas no lugar
		// de uma é uma revisão que abriu detalhe. As folhas depois do trecho andam
		// para abrir ou fechar o espaço.
		Inserted int `json:"inserted"`
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
	if in.Inserted <= 0 {
		in.Inserted = len(in.Pages)
	}
	herdadas, err := h.herdarFolhas(c.Context(), versionID, documentID, in.Scope, in.Pages, in.Inserted)
	if err != nil {
		return badRequest(c, err.Error())
	}
	var total int
	_ = h.db.QueryRow(c.Context(), `
		SELECT count(*) FROM atlas_sheet
		 WHERE version_id = $1 AND superseded_at IS NULL`, versionID).Scan(&total)
	return c.JSON(fiber.Map{"data": fiber.Map{
		"versionId": versionID, "herdadas": herdadas, "trocadas": len(in.Pages),
		"total": total, "scope": in.Scope,
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
