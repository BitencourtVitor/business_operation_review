package handler

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// O índice de destinos da obra inteira, e a sugestão antes do envio.
//
// O primeiro desenho casava só dentro da própria versão, e isso deixava de fora
// o caso comum: a prancha cita um código cuja folha mora em outra pasta, ou
// seja, em outra categoria da mesma obra. Quem lê o desenho não sabe em que
// pasta o componente foi arquivado, e não deveria precisar saber.
//
// A sugestão acontece **antes** de o documento existir, na terceira etapa do
// envio, então o índice mistura duas origens: as folhas que já estão na obra, e
// as folhas que estão subindo agora, que ainda só existem no navegador de quem
// enviou. As segundas entram pelo número da página, porque identificador de
// folha elas ainda não têm.

// indiceDaObra monta o índice de títulos da obra: título normalizado para a
// primeira folha que o carrega.
//
// A versão que conta é a vigente de cada documento não arquivado. Casar contra
// revisão velha faria a prancha nova apontar para a folha que saiu de circulação,
// que é o erro que a versão existe para impedir.
//
// `preferir` é o documento de quem está lendo: havendo o mesmo código na própria
// pasta e em outra, a própria vence, porque é o contexto de quem tem a prancha
// na mão. Entre pastas diferentes vale a ordem de criação e, dentro do
// documento, a primeira página, que é a decisão de 09/09 sobre homônimo.
func (h *AtlasHandler) indiceDaObra(ctx context.Context, jobsiteID, preferir string) (map[string]destino, error) {
	rows, err := h.db.Query(ctx, `
		SELECT s.id, s.page_index, COALESCE(s.sheet_number,''), d.id, COALESCE(d.name,''),
		       COALESCE((
		           SELECT string_agg(
		                      CASE WHEN COALESCE(t.subcategory,'') = '' THEN c.name
		                           ELSE t.subcategory || ' ' || c.name END,
		                      ' · ' ORDER BY c.position, c.name)
		             FROM atlas_document_tag t
		             JOIN atlas_doc_category c ON c.id = t.category_id
		            WHERE t.document_id = d.id), '')
		  FROM atlas_document d
		  JOIN LATERAL (
		      SELECT v.id
		        FROM atlas_document_version v
		       WHERE v.document_id = d.id
		       ORDER BY v.uploaded_at DESC
		       LIMIT 1
		  ) u ON true
		  JOIN atlas_sheet s ON s.version_id = u.id
		                    AND s.superseded_at IS NULL
		                    AND COALESCE(s.sheet_number,'') <> ''
		 WHERE d.jobsite_id = $1 AND d.archived_at IS NULL
		 ORDER BY (d.id <> $2), d.created_at, s.page_index`, jobsiteID, preferir)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	indice := map[string]destino{}
	for rows.Next() {
		var d destino
		if rows.Scan(&d.SheetID, &d.PageIndex, &d.Name, &d.DocumentID, &d.DocumentName, &d.Categoria) != nil {
			continue
		}
		k := chaveTitulo(d.Name)
		if k == "" {
			continue
		}
		if _, existe := indice[k]; !existe {
			indice[k] = d
		}
	}
	return indice, nil
}

// autolinkSugestao é um vínculo proposto, ainda sem nada gravado.
type autolinkSugestao struct {
	// O texto lido na prancha, como ele está escrito lá.
	Text string  `json:"text"`
	X0   float64 `json:"x0"`
	Y0   float64 `json:"y0"`
	X1   float64 `json:"x1"`
	Y1   float64 `json:"y1"`
	// A folha de destino. `sheetId` vem vazio quando o destino é uma folha do
	// próprio arquivo que está subindo: ela ainda não existe no servidor, e o
	// que identifica é o número da página.
	SheetID      string `json:"sheetId"`
	PageIndex    int    `json:"pageIndex"`
	SheetName    string `json:"sheetName"`
	DocumentID   string `json:"documentId"`
	DocumentName string `json:"documentName"`
	Categoria    string `json:"category"`
	// O destino está em outra pasta da obra. É o que a tela marca com ícone.
	OutraPasta bool `json:"otherFolder"`
}

type autolinkSugestaoPagina struct {
	PageIndex int                `json:"pageIndex"`
	Refs      int                `json:"refs"`
	Shape     string             `json:"shape"`
	Spread    float64            `json:"spread"`
	Links     []autolinkSugestao `json:"links"`
}

// POST /atlas/jobsites/:id/autolink/preview
//
// Sugere os vínculos de um arquivo que ainda não foi enviado. Não grava nada, e
// é de propósito: a decisão é de quem está enviando, um link de cada vez.
func (h *AtlasHandler) AutolinkPreview(c *fiber.Ctx) error {
	jobsiteID := c.Params("id")
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	var in struct {
		// As folhas do arquivo que está subindo, pelo número da página e pelo
		// nome que a marcação leu. São destino possível como qualquer outra.
		Local []struct {
			PageIndex int    `json:"pageIndex"`
			Name      string `json:"name"`
		} `json:"local"`
		Pages []struct {
			PageIndex int             `json:"pageIndex"`
			Tokens    []autolinkToken `json:"tokens"`
			NoText    bool            `json:"noText"`
		} `json:"pages"`
		MinRefs int `json:"minRefs"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if in.MinRefs <= 0 {
		in.MinRefs = 2
	}

	indice, err := h.indiceDaObra(c.Context(), jobsiteID, "")
	if err != nil {
		return internalErr(c, err)
	}
	// As folhas que estão subindo entram na frente: dentro do próprio arquivo, o
	// código citado quase sempre é de uma folha do próprio arquivo, e mandar a
	// pessoa para outra pasta nesse caso seria levá-la ao lugar errado.
	for _, l := range in.Local {
		k := chaveTitulo(l.Name)
		if k == "" {
			continue
		}
		indice[k] = destino{PageIndex: l.PageIndex, Name: l.Name}
	}

	paginas := []autolinkSugestaoPagina{}
	total := 0
	for _, p := range in.Pages {
		res := autolinkSugestaoPagina{PageIndex: p.PageIndex, Links: []autolinkSugestao{}}
		if p.NoText {
			res.Shape = "no-text"
			paginas = append(paginas, res)
			continue
		}

		alcancados := map[string]bool{}
		xs := []float64{}
		achados := []autolinkSugestao{}
		for _, t := range p.Tokens {
			k := chaveTitulo(t.Text)
			if k == "" {
				continue
			}
			d, achou := indice[k]
			if !achou {
				continue
			}
			// A folha não aponta para ela mesma: o título dela está no próprio
			// carimbo, e sem isto toda página ganharia um link para si.
			if d.SheetID == "" && d.PageIndex == p.PageIndex {
				continue
			}
			alcancados[k] = true
			xs = append(xs, (t.X0+t.X1)/2)
			achados = append(achados, autolinkSugestao{
				Text: t.Text, X0: t.X0, Y0: t.Y0, X1: t.X1, Y1: t.Y1,
				SheetID: d.SheetID, PageIndex: d.PageIndex, SheetName: d.Name,
				DocumentID: d.DocumentID, DocumentName: d.DocumentName, Categoria: d.Categoria,
				OutraPasta: d.SheetID != "",
			})
		}

		res.Refs = len(alcancados)
		res.Spread = dispersao(xs)
		switch {
		case res.Refs == 0:
			res.Shape = "terminal"
		case len(indice) > 0 && float64(res.Refs) >= 0.8*float64(len(indice)):
			res.Shape = "index"
		default:
			res.Shape = "referencing"
		}

		if res.Refs >= in.MinRefs {
			res.Links = achados
			total += len(achados)
		}
		paginas = append(paginas, res)
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"destinos": len(indice),
		"paginas":  paginas,
		"links":    total,
	}})
}

// POST /atlas/versions/:id/autolink/apply
//
// Grava os vínculos que a pessoa confirmou, e só eles. Chega depois do envio,
// quando as folhas já existem: é aqui que o número da página vira identificador
// de folha, tanto do lado de quem cita quanto do lado citado.
func (h *AtlasHandler) AutolinkApply(c *fiber.Ctx) error {
	versionID := c.Params("id")

	var jobsiteID, documentID, documentName string
	if err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, d.id, COALESCE(d.name,'')
		  FROM atlas_document_version v
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE v.id = $1`, versionID).Scan(&jobsiteID, &documentID, &documentName); err != nil {
		return atlasNotFound(c, "versão")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}

	var in struct {
		Links []struct {
			// A página que cita, dentro desta versão.
			PageIndex int     `json:"pageIndex"`
			X0        float64 `json:"x0"`
			Y0        float64 `json:"y0"`
			X1        float64 `json:"x1"`
			Y1        float64 `json:"y1"`
			Text      string  `json:"text"`
			// O destino: folha que já existia, ou página deste mesmo arquivo.
			TargetSheetID   string `json:"targetSheetId"`
			TargetPageIndex int    `json:"targetPageIndex"`
			TargetName      string `json:"targetName"`
		} `json:"links"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}

	// As folhas desta versão, pelo número da página: é o que traduz o que foi
	// confirmado antes do envio para o que existe depois dele.
	rows, err := h.db.Query(c.Context(), `
		SELECT page_index, id, COALESCE(sheet_number,'')
		  FROM atlas_sheet
		 WHERE version_id = $1 AND superseded_at IS NULL`, versionID)
	if err != nil {
		return internalErr(c, err)
	}
	folhas := map[int]struct{ ID, Nome string }{}
	for rows.Next() {
		var i int
		var id, nome string
		if rows.Scan(&i, &id, &nome) == nil {
			folhas[i] = struct{ ID, Nome string }{id, nome}
		}
	}
	rows.Close()

	userID, _ := actor(c)
	gravados := 0
	for _, l := range in.Links {
		origem, temOrigem := folhas[l.PageIndex]
		if !temOrigem {
			continue
		}
		alvoID := l.TargetSheetID
		alvoNome := l.TargetName
		alvoDoc, alvoDocNome := documentID, documentName
		alvoPagina := l.TargetPageIndex
		if alvoID == "" {
			// Destino dentro do próprio arquivo: agora ele tem folha.
			alvo, temAlvo := folhas[l.TargetPageIndex]
			if !temAlvo {
				continue
			}
			alvoID = alvo.ID
			if alvoNome == "" {
				alvoNome = alvo.Nome
			}
		} else {
			// Destino em outra pasta: o documento dele é outro, e a tela já
			// mostrou qual. Guardar o que foi resolvido evita ter de refazer a
			// consulta para desenhar o balão do link.
			_ = h.db.QueryRow(c.Context(), `
				SELECT d.id, COALESCE(d.name,''), s.page_index
				  FROM atlas_sheet s
				  JOIN atlas_document_version v ON v.id = s.version_id
				  JOIN atlas_document d ON d.id = v.document_id
				 WHERE s.id = $1`, alvoID).Scan(&alvoDoc, &alvoDocNome, &alvoPagina)
		}
		if alvoID == origem.ID {
			continue
		}

		geom, _ := json.Marshal(map[string]any{
			"x0": l.X0, "y0": l.Y0, "x1": l.X1, "y1": l.Y1,
			"auto": true, "text": l.Text,
			"target": map[string]any{
				"sheetId": alvoID, "pageIndex": alvoPagina, "sheetName": alvoNome,
				"documentId": alvoDoc, "documentName": alvoDocNome,
			},
		})
		// `shared` é true porque o vínculo é do documento e não de quem rodou a
		// automação: link que só o autor enxerga não serve em campo.
		if _, err := h.db.Exec(c.Context(), `
			INSERT INTO atlas_annotation (id, sheet_id, author_id, tool, color, width, opacity, geometry, shared)
			VALUES ($1,$2,$3,'link','',0,1,$4,true)`,
			uuid.NewString(), origem.ID, userID, geom); err == nil {
			gravados++
		}
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"links": gravados}})
}
