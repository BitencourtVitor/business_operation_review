package handler

import (
	"context"
)

type gapSheet struct {
	SheetID     string `json:"sheetId"`
	PageIndex   int    `json:"pageIndex"`
	SheetNumber string `json:"sheetNumber"`
}

// versionGap é o que uma versão mudou em relação à anterior.
//
// A janela de versões não existe para abrir o caderno antigo. Existe para dizer
// o que mudou de um para o outro e por quê, e o "o que mudou" mora aqui.
type versionGap struct {
	// first: não há anterior. partial: só as folhas trocadas subiram. full: o
	// set inteiro subiu de novo.
	Kind string `json:"kind"`
	// No set inteiro, se deu para comparar folha a folha. Sem a impressão digital
	// das páginas nos dois lados não dá, e a resposta honesta é "subiu tudo".
	Compared bool       `json:"compared"`
	Changed  []gapSheet `json:"changed"`
	// Folhas nomeadas que existiam na anterior e não existem nesta.
	Removed []string `json:"removed"`
}

func gapVazio(kind string) versionGap {
	return versionGap{Kind: kind, Changed: []gapSheet{}, Removed: []string{}}
}

// versionGaps calcula o gap de cada versão da pasta.
//
// Na troca parcial o gap é o que subiu: toda folha não herdada. No set inteiro
// o gap sai da comparação com a anterior: a folha casa com a de mesmo nome (ou
// de mesma página, quando não tem nome) e mudou quando a impressão digital do
// texto ou do desenho é outra. É o que deixa a janela dizer "3 de 97 mudaram"
// mesmo quando o projetista reemitiu o caderno inteiro.
func (h *AtlasHandler) versionGaps(ctx context.Context, documentID string) (map[string]versionGap, error) {
	out := map[string]versionGap{}

	type par struct{ id, anterior, scope string }
	rows, err := h.db.Query(ctx, `
		SELECT id, COALESCE(lag(id) OVER (ORDER BY seq, uploaded_at), ''), scope
		  FROM atlas_document_version
		 WHERE document_id = $1 AND status IN ('uploaded', 'published')`, documentID)
	if err != nil {
		return nil, err
	}
	pares := []par{}
	for rows.Next() {
		var p par
		if err := rows.Scan(&p.id, &p.anterior, &p.scope); err != nil {
			rows.Close()
			return nil, err
		}
		pares = append(pares, p)
	}
	rows.Close()

	for _, p := range pares {
		if p.anterior == "" {
			out[p.id] = gapVazio("first")
			continue
		}
		g := gapVazio("full")
		if p.scope != "full" {
			g.Kind = "partial"
			g.Compared = true
		} else {
			// Dá para comparar quando as duas versões têm impressão em todas as
			// folhas. Uma folha sem impressão já tornaria a lista mentirosa.
			var semNaNova, semNaAnterior int
			_ = h.db.QueryRow(ctx, `
				SELECT count(*) FILTER (WHERE version_id = $1 AND text_hash = ''),
				       count(*) FILTER (WHERE version_id = $2 AND text_hash = '')
				  FROM atlas_sheet
				 WHERE version_id IN ($1, $2) AND superseded_at IS NULL`,
				p.id, p.anterior).Scan(&semNaNova, &semNaAnterior)
			g.Compared = semNaNova == 0 && semNaAnterior == 0
		}
		if !g.Compared {
			out[p.id] = g
			continue
		}

		mudou, err := h.db.Query(ctx, `
			SELECT s.id, s.page_index, s.sheet_number
			  FROM atlas_sheet s
			 WHERE s.version_id = $1 AND s.superseded_at IS NULL
			   AND s.inherited_from IS NULL
			   AND ($3 <> 'full' OR NOT EXISTS (
			       SELECT 1 FROM atlas_sheet a
			        WHERE a.version_id = $2 AND a.superseded_at IS NULL
			          AND CASE WHEN s.sheet_number <> '' THEN a.sheet_number = s.sheet_number
			                   ELSE a.page_index = s.page_index END
			          AND a.text_hash = s.text_hash AND a.geom_hash = s.geom_hash))
			 ORDER BY s.page_index`, p.id, p.anterior, p.scope)
		if err != nil {
			return nil, err
		}
		for mudou.Next() {
			var f gapSheet
			if err := mudou.Scan(&f.SheetID, &f.PageIndex, &f.SheetNumber); err != nil {
				mudou.Close()
				return nil, err
			}
			g.Changed = append(g.Changed, f)
		}
		mudou.Close()

		saiu, err := h.db.Query(ctx, `
			SELECT a.sheet_number
			  FROM atlas_sheet a
			 WHERE a.version_id = $2 AND a.superseded_at IS NULL AND a.sheet_number <> ''
			   AND NOT EXISTS (SELECT 1 FROM atlas_sheet s
			                    WHERE s.version_id = $1 AND s.superseded_at IS NULL
			                      AND s.sheet_number = a.sheet_number)
			 ORDER BY a.page_index`, p.id, p.anterior)
		if err != nil {
			return nil, err
		}
		for saiu.Next() {
			var nome string
			if saiu.Scan(&nome) == nil {
				g.Removed = append(g.Removed, nome)
			}
		}
		saiu.Close()
		out[p.id] = g
	}
	return out, nil
}
