package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// O texto de cada página, guardado no ingest e lido pela varredura de links.
//
// O `pdftotext -bbox-layout` já roda no ingest para nomear a folha pelo
// gabarito. Guardar o que ele leu faz a sugestão de hiperlink virar uma
// consulta, em vez de o navegador abrir o mesmo PDF e refazer a leitura com
// pdf.js — que é a espera que se sente ao clicar em "Scan for links".

// palavraGuardada é uma palavra com a caixa já normalizada de 0 a 1, que é como
// o autolink trabalha. Nome curto porque são milhares por documento.
type palavraGuardada struct {
	T  string  `json:"t"`
	X0 float64 `json:"x0"`
	Y0 float64 `json:"y0"`
	X1 float64 `json:"x1"`
	Y1 float64 `json:"y1"`
}

type paginaGuardada struct {
	PageIndex     int
	Width, Height float64
	Words         []palavraGuardada
	NoText        bool
}

// normalizarPagina converte as palavras do poppler, que vêm em pontos, para a
// caixa de 0 a 1. Página sem palavra é prancha rasterizada: precisa de OCR e por
// ora fica declarada, não silenciosamente vazia.
func normalizarPagina(p ingestPagina) ([]palavraGuardada, bool) {
	largura, altura := p.Width, p.Height
	if largura <= 0 {
		largura = 1
	}
	if altura <= 0 {
		altura = 1
	}
	out := make([]palavraGuardada, 0, len(p.Words))
	for _, w := range p.Words {
		if w.Text == "" {
			continue
		}
		out = append(out, palavraGuardada{
			T:  w.Text,
			X0: w.X0 / largura, Y0: w.Y0 / altura,
			X1: w.X1 / largura, Y1: w.Y1 / altura,
		})
	}
	return out, len(out) == 0
}

// guardarTexto grava o texto de todas as páginas de uma versão. Regravar é
// permitido: reprocessar a mesma versão tem de dar o mesmo resultado, não linha
// duplicada.
func (h *AtlasHandler) guardarTexto(ctx context.Context, versionID string, paginas []ingestPagina) error {
	linhas := make([][]any, 0, len(paginas))
	for i, p := range paginas {
		palavras, semTexto := normalizarPagina(p)
		bruto, err := json.Marshal(palavras)
		if err != nil {
			return err
		}
		linhas = append(linhas, []any{versionID, i, p.Width, p.Height, bruto, semTexto})
	}
	if len(linhas) == 0 {
		return nil
	}

	return pgx.BeginFunc(ctx, h.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM atlas_page_text WHERE version_id = $1`, versionID); err != nil {
			return err
		}
		_, err := tx.CopyFrom(ctx,
			pgx.Identifier{"atlas_page_text"},
			[]string{"version_id", "page_index", "width", "height", "words", "no_text"},
			pgx.CopyFromRows(linhas))
		return err
	})
}

// textoDaVersao devolve o texto guardado. Sem `indices` devolve a versão
// inteira; com eles, só as páginas pedidas, que é o caso do remapeamento.
func (h *AtlasHandler) textoDaVersao(ctx context.Context, versionID string, indices []int) ([]paginaGuardada, error) {
	consulta := `
		SELECT page_index, width, height, words, no_text
		  FROM atlas_page_text
		 WHERE version_id = $1`
	args := []any{versionID}
	if len(indices) > 0 {
		consulta += ` AND page_index = ANY($2::int[])`
		args = append(args, indices)
	}
	consulta += ` ORDER BY page_index`

	rows, err := h.db.Query(ctx, consulta, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []paginaGuardada{}
	for rows.Next() {
		var p paginaGuardada
		var bruto []byte
		if err := rows.Scan(&p.PageIndex, &p.Width, &p.Height, &bruto, &p.NoText); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(bruto, &p.Words); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// garantirTexto lê o texto guardado e, se a versão for anterior a esta função,
// baixa o original e o extrai na hora. A primeira varredura de um documento
// antigo paga o preço; as seguintes não.
func (h *AtlasHandler) garantirTexto(ctx context.Context, versionID, r2Key string, indices []int) ([]paginaGuardada, error) {
	guardado, err := h.textoDaVersao(ctx, versionID, indices)
	if err != nil {
		return nil, err
	}
	if len(guardado) > 0 {
		return guardado, nil
	}

	dir, err := os.MkdirTemp("", "atlas-texto-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)

	original := dir + "/original.pdf"
	if err := h.baixar(ctx, r2Key, original); err != nil {
		return nil, fmt.Errorf("baixar original: %w", err)
	}
	paginas, err := lerTexto(ctx, original)
	if err != nil {
		return nil, fmt.Errorf("ler texto: %w", err)
	}
	if err := h.guardarTexto(ctx, versionID, paginas); err != nil {
		return nil, err
	}
	return h.textoDaVersao(ctx, versionID, indices)
}

// POST /atlas/versions/:id/autolink/scan
//
// Sugere os vínculos de uma versão já enviada, lendo o texto que o ingest
// guardou. É o caminho que substitui a varredura no navegador: o trabalho de
// abrir o PDF e reconhecer glifo já foi feito uma vez, e não precisa ser
// refeito na máquina de quem clica.
//
// Não grava nada. A conferência continua humana, e quem grava é o
// `autolink/apply` com a lista confirmada.
func (h *AtlasHandler) AutolinkScan(c *fiber.Ctx) error {
	versionID := c.Params("id")

	var jobsiteID, documentID, r2Key string
	if err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, d.id, v.r2_key
		  FROM atlas_document_version v
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE v.id = $1`, versionID).Scan(&jobsiteID, &documentID, &r2Key); err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	var in struct {
		// Quais páginas reler. Vazio é a versão inteira, que é o caso do envio;
		// com índices é o remapeamento de algumas folhas.
		PageIndexes  []int `json:"pageIndexes"`
		MinRefs      int   `json:"minRefs"`
		OutrasPastas bool  `json:"otherFolders"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}

	// Os destinos são sempre o documento inteiro, mesmo relendo poucas páginas:
	// uma folha escolhida pode citar qualquer outra do set.
	local, err := h.folhasDaVersao(c.Context(), versionID)
	if err != nil {
		return internalErr(c, err)
	}

	paginas, err := h.garantirTexto(c.Context(), versionID, r2Key, in.PageIndexes)
	if err != nil {
		return internalErr(c, err)
	}

	entradas := make([]autolinkEntrada, 0, len(paginas))
	for _, p := range paginas {
		tokens := make([]autolinkToken, 0, len(p.Words))
		for _, w := range p.Words {
			tokens = append(tokens, autolinkToken{Text: w.T, X0: w.X0, Y0: w.Y0, X1: w.X1, Y1: w.Y1})
		}
		entradas = append(entradas, autolinkEntrada{PageIndex: p.PageIndex, Tokens: tokens, NoText: p.NoText})
	}

	sugestoes, destinos, total, err := h.sugerirVinculos(
		c.Context(), jobsiteID, local, entradas, in.MinRefs, in.OutrasPastas)
	if err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"destinos": destinos,
		"paginas":  sugestoes,
		"links":    total,
		"scanned":  len(entradas),
	}})
}

// folhasDaVersao é o índice de destinos do próprio documento: número da página
// e nome da folha, como o envio manda em `local`.
func (h *AtlasHandler) folhasDaVersao(ctx context.Context, versionID string) ([]autolinkLocal, error) {
	rows, err := h.db.Query(ctx, `
		SELECT page_index, COALESCE(sheet_number, '')
		  FROM atlas_sheet
		 WHERE version_id = $1
		 ORDER BY page_index`, versionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []autolinkLocal{}
	for rows.Next() {
		var l autolinkLocal
		if err := rows.Scan(&l.PageIndex, &l.Name); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
