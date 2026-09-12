package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// GET /atlas/versions/:id/urls
//
// As URLs assinadas de todas as folhas de uma versão, de uma vez.
//
// Existe pelo mesmo motivo do `/thumbs`: baixar uma pasta pedia uma URL por
// folha, e num set de 97 folhas isso é 97 idas ao servidor antes do primeiro
// byte de cada arquivo. A latência de cada ida dominava o download inteiro, e o
// campo via 0,1 MB por segundo numa rede que dá muito mais.
//
// `whole` diz que aquela folha ainda não tem recorte e aponta para o set
// inteiro: quem baixa precisa saber disso para gravar o arquivo uma vez só, em
// vez de multiplicar o set pelo número de páginas.
func (h *AtlasHandler) VersionSheetURLs(c *fiber.Ctx) error {
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
	rows, err := h.db.Query(c.Context(), `
		SELECT s.id, s.r2_key, v.r2_key, s.page_index
		FROM atlas_sheet s
		JOIN atlas_document_version v ON v.id = s.version_id
		WHERE s.version_id = $1 AND s.superseded_at IS NULL
		ORDER BY s.page_index`, versionID)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()

	type folha struct {
		SheetID   string `json:"sheetId"`
		URL       string `json:"url"`
		Whole     bool   `json:"whole"`
		PageIndex int    `json:"pageIndex"`
	}
	out := []folha{}
	// O set inteiro é o mesmo objeto para todas as folhas sem recorte: assinar
	// uma vez basta, e assinar 97 vezes a mesma chave só gasta tempo.
	inteiro := ""
	for rows.Next() {
		var id, planKey, originalKey string
		var pageIndex int
		if err := rows.Scan(&id, &planKey, &originalKey, &pageIndex); err != nil {
			return internalErr(c, err)
		}
		if planKey != "" {
			url, err := h.r2.DownloadURL(c.Context(), planKey, 6*time.Hour)
			if err != nil {
				continue
			}
			out = append(out, folha{SheetID: id, URL: url, PageIndex: pageIndex})
			continue
		}
		if inteiro == "" {
			url, err := h.r2.DownloadURL(c.Context(), originalKey, 6*time.Hour)
			if err != nil {
				continue
			}
			inteiro = url
		}
		out = append(out, folha{SheetID: id, URL: inteiro, Whole: true, PageIndex: pageIndex})
	}
	return c.JSON(fiber.Map{"data": out})
}
