package handler

import (
	"github.com/gofiber/fiber/v2"

	"github.com/bitencourtVitor/bor2-api/internal/service"
)

// Apagar obra, pasta e revisão.
//
// Estas rotas não existiam. A tela só sabia **arquivar**, que tira a obra da
// frente e preserva tudo, e isso cobre o caso comum: obra entregue não deve
// sumir do sistema. O que faltava era a outra ponta, o registro que nunca
// deveria ter existido — o exemplo criado para testar, a pasta anexada na obra
// errada, a revisão subida em duplicidade.
//
// Sem essa porta, o caminho era mexer no banco à mão, e mexer no banco à mão
// deixa o bucket para trás por definição: quem apaga a linha perde justamente a
// informação de quais objetos eram dela.
//
// As três nascem com a limpeza embutida, e a ordem é sempre a mesma: coletar as
// chaves, apagar no bucket, apagar no banco. Coletar depois do DELETE seria
// coletar de linhas que já não existem.

// DELETE /atlas/jobsites/:id
//
// Some com a obra inteira. A cascata do esquema leva documento, versão, folha,
// anotação, evento, resposta e mídia; o bucket é limpo aqui antes disso.
//
// Cobra `manage`, a mesma permissão de subir documento e conceder acesso. Não é
// operação de quem só anota.
func (h *AtlasHandler) DeleteJobsite(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	var name string
	if err := h.db.QueryRow(c.Context(),
		`SELECT name FROM atlas_jobsite WHERE id = $1`, jobsiteID).Scan(&name); err != nil {
		return atlasNotFound(c, "obra")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	keys, err := service.JobsiteKeys(c.Context(), h.db, jobsiteID)
	if err != nil {
		return internalErr(c, err)
	}
	purge := service.DeleteKeys(c.Context(), h.r2, keys)

	if _, err := h.db.Exec(c.Context(), `DELETE FROM atlas_jobsite WHERE id = $1`, jobsiteID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"deleted": jobsiteID, "name": name,
		"storage": fiber.Map{"objects": len(keys), "deleted": purge.Deleted, "failed": purge.Failed},
	}})
}

// DELETE /atlas/documents/:id
//
// Some com a pasta e com as revisões dela. A mídia da obra fica: ela pende do
// evento e da obra, não do documento, e uma foto de campo não deixa de valer
// porque a pasta em que a marca foi feita saiu.
func (h *AtlasHandler) DeleteDocument(c *fiber.Ctx) error {
	documentID := c.Params("id")
	var jobsiteID, name string
	if err := h.db.QueryRow(c.Context(),
		`SELECT jobsite_id, COALESCE(name,'') FROM atlas_document WHERE id = $1`,
		documentID).Scan(&jobsiteID, &name); err != nil {
		return atlasNotFound(c, "documento")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	keys, err := service.DocumentKeys(c.Context(), h.db, documentID)
	if err != nil {
		return internalErr(c, err)
	}
	purge := service.DeleteKeys(c.Context(), h.r2, keys)

	if _, err := h.db.Exec(c.Context(), `DELETE FROM atlas_document WHERE id = $1`, documentID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"deleted": documentID, "name": name,
		"storage": fiber.Map{"objects": len(keys), "deleted": purge.Deleted, "failed": purge.Failed},
	}})
}

// DELETE /atlas/versions/:id
//
// Some com uma revisão e as folhas dela.
//
// A última revisão de uma pasta não sai por aqui. Apagá-la deixaria a pasta
// existindo e vazia, o que é um estado que nada no sistema sabe mostrar: a tela
// de documento abriria numa lista de folhas que não existem. Quem quer se livrar
// da pasta apaga a pasta, e há porta para isso logo acima.
func (h *AtlasHandler) DeleteVersion(c *fiber.Ctx) error {
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

	var restantes int
	if err := h.db.QueryRow(c.Context(),
		`SELECT count(*) FROM atlas_document_version WHERE document_id = $1`,
		documentID).Scan(&restantes); err != nil {
		return internalErr(c, err)
	}
	if restantes <= 1 {
		return badRequest(c, "esta é a única revisão da pasta; apague a pasta em vez da revisão")
	}

	keys, err := service.VersionKeys(c.Context(), h.db, versionID)
	if err != nil {
		return internalErr(c, err)
	}
	purge := service.DeleteKeys(c.Context(), h.r2, keys)

	if _, err := h.db.Exec(c.Context(),
		`DELETE FROM atlas_document_version WHERE id = $1`, versionID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"deleted": versionID,
		"storage": fiber.Map{"objects": len(keys), "deleted": purge.Deleted, "failed": purge.Failed},
	}})
}
