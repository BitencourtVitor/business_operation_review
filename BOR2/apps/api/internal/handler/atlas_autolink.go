package handler

import (
	"encoding/json"
	"math"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Criação automática dos vínculos entre folhas.
//
// A prancha de conjunto já traz impressa a referência: um código escrito sobre o
// desenho que aponta para a folha daquele componente. No papel a pessoa procura
// a folha; aqui ela toca e chega. Fazer isso à mão num set de 2.800 pranchas é
// trabalho que ninguém faz, e é por isso que a funcionalidade só existe de
// verdade se nascer em lote.
//
// A divisão de trabalho é deliberada. Quem lê o PDF é o cliente, com o pdf.js
// que já está lá e já extrai texto com posição; mandar 112 MB para o servidor
// reparsear seria refazer o que já foi feito. O servidor faz o que só ele pode:
// decidir quais páginas merecem link, resolver o destino de cada código e
// gravar.
//
// ── Como se decide que uma página merece link, sem inteligência artificial ──
//
// A pergunta que parecia necessária era "isto é uma planta?", e ela é cara
// porque exige interpretar o desenho. Mas ela é um atalho para outra, que é a
// que de fato importa: **esta página cita códigos de outras folhas deste set?**
//
// Essa não se infere, se conta. O índice de títulos da versão já existe, e basta
// varrer o texto da página procurando por eles. Página que cita várias outras é
// prancha de conjunto por definição, não por semelhança. Página que não cita
// nenhuma é folha terminal. Não há modelo envolvido, não há custo por página, e
// o resultado não é uma probabilidade: é a contagem do fato.
//
// Isso é confiável **aqui** por uma razão que não vale para qualquer set: os
// títulos são códigos com letra, dígito e símbolo, todos os 196 do acervo, e
// nenhum é só dígito. `1-01-L` não colide por acaso com texto solto na prancha.
// Fossem números puros, toda cota e todo número de porta virariam falso
// positivo, e aí sim faria falta algo mais esperto.
//
// Dois sinais secundários entram para separar os dois formatos de página que
// citam, porque eles se comportam diferente e o segundo é o mais perigoso:
//
//   - **Dispersão.** Numa prancha de conjunto as referências estão espalhadas
//     sobre o desenho. Num índice ou numa tabela de programação elas estão
//     empilhadas numa coluna, com o mesmo x. As duas merecem link; saber qual é
//     qual serve para o relatório de conferência, e para desconfiar quando um
//     desenho vem com dispersão de tabela.
//   - **Concentração.** Página que casa com quase todo o índice de uma vez é o
//     sumário do set, e não uma prancha. Ela continua ganhando links, e sinalizá-la
//     evita que alguém a confunda com um desenho que deu errado.

// destino é a folha para onde um código escrito na prancha aponta.
//
// Ela não é necessariamente do documento que está sendo lido: o código citado no
// meio do desenho pode ser folha de outra pasta da mesma obra, e era essa a
// limitação do primeiro desenho, que só olhava a própria versão. Por isso o
// destino carrega de que documento ele é: a tela precisa avisar que o link
// atravessa a fronteira da pasta.
type destino struct {
	SheetID      string
	PageIndex    int
	Name         string
	DocumentID   string
	DocumentName string
	Categoria    string
}

type autolinkToken struct {
	// O texto reconhecido na página, como veio da prancha.
	Text string `json:"text"`
	// A caixa do texto, em coordenada normalizada, que vira a área clicável.
	X0 float64 `json:"x0"`
	Y0 float64 `json:"y0"`
	X1 float64 `json:"x1"`
	Y1 float64 `json:"y1"`
}

type autolinkPage struct {
	SheetID string `json:"sheetId"`
	// Todo o texto da página, e não só o que o cliente achou que era referência.
	// Quem decide o que é referência é o índice, que mora aqui: mandar o cliente
	// pré-filtrar duplicaria a regra e deixaria as duas metades divergirem.
	Tokens []autolinkToken `json:"tokens"`
	// Página sem texto extraível. Vem do cliente porque só ele abriu o arquivo.
	// Não é erro: é prancha rasterizada, que precisa de OCR e por ora fica de
	// fora, declarada em vez de silenciosamente vazia.
	NoText bool `json:"noText"`
}

type autolinkPageResult struct {
	SheetID string `json:"sheetId"`
	// Quantos códigos de outras folhas esta página cita.
	Refs int `json:"refs"`
	// A leitura da página: `referencing` cita outras, `terminal` não cita
	// nenhuma, `index` cita quase todas, `no-text` é rasterizada.
	Shape string `json:"shape"`
	// Espalhamento horizontal das citações. Perto de zero é coluna, ou seja,
	// tabela; acima disso é desenho.
	Spread float64 `json:"spread"`
	Linked int     `json:"linked"`
}

// POST /atlas/versions/:id/autolink
func (h *AtlasHandler) Autolink(c *fiber.Ctx) error {
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
		Pages []autolinkPage `json:"pages"`
		// Quantas citações bastam para a página valer link. Duas por padrão: uma
		// só é frequentemente o título da folha vizinha impresso numa legenda, e
		// exigir três descartaria prancha de conjunto pequena, que existe.
		MinRefs int `json:"minRefs"`
		// Sem isto a rota devolve o que faria e não grava. Vínculo falso é pior
		// que vínculo ausente: quem toca e cai na folha errada perde a confiança
		// em todos os outros, e não há como saber quais estavam certos.
		Apply bool `json:"apply"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if in.MinRefs <= 0 {
		in.MinRefs = 2
	}

	indice, err := h.indiceDaObra(c.Context(), jobsiteID, documentID)
	if err != nil {
		return internalErr(c, err)
	}

	userID, _ := actor(c)

	paginas := []autolinkPageResult{}
	totalLinks := 0

	for _, p := range in.Pages {
		res := autolinkPageResult{SheetID: p.SheetID}
		if p.NoText {
			res.Shape = "no-text"
			paginas = append(paginas, res)
			continue
		}

		// Primeiro passo: o que esta página cita. Cada destino conta uma vez,
		// mesmo aparecendo cinco vezes na prancha, porque o que mede a natureza
		// da página é quantas folhas ela alcança e não quantas vezes repete uma.
		type hit struct {
			d destino
			t autolinkToken
		}
		hits := []hit{}
		alcancados := map[string]bool{}
		for _, t := range p.Tokens {
			k := chaveTitulo(t.Text)
			if k == "" {
				continue
			}
			d, achou := indice[k]
			if !achou {
				continue
			}
			// Folha não se referencia a si mesma. Acontece em toda página: o
			// título dela está no próprio carimbo, e sem esta linha toda folha
			// ganharia um link para ela mesma e contaria como referenciadora.
			if d.SheetID == p.SheetID {
				continue
			}
			hits = append(hits, hit{d, t})
			alcancados[k] = true
		}
		res.Refs = len(alcancados)
		xs := make([]float64, 0, len(hits))
		for _, hi := range hits {
			xs = append(xs, (hi.t.X0+hi.t.X1)/2)
		}
		res.Spread = dispersao(xs)

		switch {
		case res.Refs == 0:
			res.Shape = "terminal"
		case len(indice) > 0 && float64(res.Refs) >= 0.8*float64(len(indice)):
			res.Shape = "index"
		default:
			res.Shape = "referencing"
		}

		if res.Refs < in.MinRefs {
			paginas = append(paginas, res)
			continue
		}

		for _, hi := range hits {
			res.Linked++
			totalLinks++
			if !in.Apply {
				continue
			}
			geom, _ := json.Marshal(map[string]any{
				"x0": hi.t.X0, "y0": hi.t.Y0, "x1": hi.t.X1, "y1": hi.t.Y1,
				"auto": true,
				"target": map[string]any{
					"sheetId": hi.d.SheetID, "pageIndex": hi.d.PageIndex, "sheetName": hi.d.Name,
					"documentId": documentID, "documentName": documentName,
				},
			})
			// `shared` é true porque o vínculo é do documento e não de quem
			// rodou a automação: link que só o autor enxerga não serve em campo.
			_, _ = h.db.Exec(c.Context(), `
				INSERT INTO atlas_annotation (id, sheet_id, author_id, tool, color, width, opacity, geometry, shared)
				VALUES ($1,$2,$3,'link','',0,1,$4,true)`,
				uuid.NewString(), p.SheetID, userID, geom)
		}
		paginas = append(paginas, res)
	}

	forma := map[string]int{}
	for _, p := range paginas {
		forma[p.Shape]++
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"dryRun":   !in.Apply,
		"destinos": len(indice),
		"paginas":  paginas,
		"forma":    forma,
		"links":    totalLinks,
	}})
}

// dispersao mede o espalhamento horizontal das citações numa página.
//
// Serve para separar dois formatos que ambos citam outras folhas: a prancha de
// conjunto, em que as referências estão sobre o desenho e portanto espalhadas, e
// a tabela ou índice, em que elas estão empilhadas numa coluna e compartilham o
// mesmo x. As duas ganham link; a leitura serve para conferência, e para
// desconfiar de um desenho que venha com cara de tabela.
//
// É desvio padrão simples, em coordenada normalizada, então o número já é
// comparável entre páginas de tamanhos diferentes sem nenhuma conversão.
func dispersao(xs []float64) float64 {
	if len(xs) < 2 {
		return 0
	}
	var soma float64
	for _, x := range xs {
		soma += x
	}
	media := soma / float64(len(xs))
	var acc float64
	for _, x := range xs {
		acc += (x - media) * (x - media)
	}
	return math.Sqrt(acc / float64(len(xs)))
}

// chaveTitulo normaliza um código de folha para comparação.
//
// Os títulos são códigos, não números: `1-01-L`, `E1005-L`. Das 196 folhas
// tituladas do acervo, todas têm letra, dígito e símbolo, e nenhuma é só dígito.
// Então a comparação não pode ser numérica nem sensível a caixa, e precisa
// tolerar o que muda entre o carimbo e o texto solto na prancha: espaço a mais,
// e o sufixo de desambiguação que o sistema acrescentou e a prancha não conhece.
//
// O sufixo sai justamente por isso. O que está escrito na prancha de conjunto é
// `1-01-L`; quem virou `1-01-L (2)` foi a folha, por decisão do sistema. Manter
// o sufixo na chave faria a segunda folha nunca casar com nada, e é ela que a
// regra do homônimo precisa alcançar para poder descartá-la em favor da
// primeira.
//
// Devolve vazio para o que não tem cara de código. É essa recusa que impede a
// varredura de tratar palavra solta e número de cota como candidatos: exige
// letra e dígito no mesmo token, que é o que todo título real do acervo tem e o
// que quase nenhum texto de prancha tem por acaso.
func chaveTitulo(s string) string {
	t := strings.TrimSpace(s)
	if t == "" {
		return ""
	}
	// O sufixo numérico entre parênteses, no fim.
	if i := strings.LastIndex(t, "("); i > 0 && strings.HasSuffix(t, ")") {
		miolo := t[i+1 : len(t)-1]
		if miolo != "" && strings.Trim(miolo, "0123456789") == "" {
			t = strings.TrimSpace(t[:i])
		}
	}
	// E o sufixo de letra da convenção antiga, que segue gravado no acervo.
	if i := strings.LastIndex(t, "-"); i > 0 && len(t)-i == 2 {
		letra := t[i+1:]
		if letra >= "A" && letra <= "Z" {
			t = t[:i]
		}
	}
	t = strings.ToUpper(strings.Join(strings.Fields(t), ""))
	if len(t) < 3 || len(t) > 24 {
		return ""
	}
	var temLetra, temDigito bool
	for _, r := range t {
		switch {
		case r >= 'A' && r <= 'Z':
			temLetra = true
		case r >= '0' && r <= '9':
			temDigito = true
		}
	}
	if !temLetra || !temDigito {
		return ""
	}
	return t
}
