package handler

import (
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// A escala da prancha, e a medição que ela habilita.
//
// Medir sobre a planta exige um número: quantas unidades do mundo cabem num
// ponto de PDF. Ele chega por dois caminhos, e a diferença entre eles é o quanto
// se confia no resultado.
//
//   - **Declarada**: lida do que está escrito na prancha, tipo `1/4" = 1'-0"`.
//     É palpite do sistema sobre o que o carimbo diz, e serve como ponto de
//     partida que a pessoa confere.
//   - **Calibrada**: a pessoa apontou dois pontos de distância conhecida e
//     disse quanto vale. É a verdade da folha, e sobrepõe a declarada.
//
// A ordem entre elas nunca inverte: calibrada não é substituída por declarada.
// Uma escala conferida à mão não pode ser desfeita por uma releitura automática
// do carimbo, senão a conferência não teria valor nenhum.

// PUT /atlas/sheets/:id/scale
func (h *AtlasHandler) SetSheetScale(c *fiber.Ctx) error {
	sheetID := c.Params("id")

	var jobsiteID, fonteAtual string
	if err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, s.scale_source
		  FROM atlas_sheet s
		  JOIN atlas_document_version v ON v.id = s.version_id
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE s.id = $1`, sheetID).Scan(&jobsiteID, &fonteAtual); err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "annotate"); err != nil {
		return atlasForbidden(c)
	}

	var in struct {
		// Calibração: dois pontos em coordenada normalizada e a distância real
		// entre eles.
		P1x       *float64 `json:"p1x"`
		P1y       *float64 `json:"p1y"`
		P2x       *float64 `json:"p2x"`
		P2y       *float64 `json:"p2y"`
		RealValue *float64 `json:"realValue"`
		Unit      string   `json:"unit"`
		// Ou a notação lida do carimbo, para o servidor interpretar.
		Label string `json:"label"`
		// Dimensões da página em pontos, necessárias para converter a distância
		// normalizada em pontos de PDF.
		WidthPt  float64 `json:"widthPt"`
		HeightPt float64 `json:"heightPt"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	if in.Unit == "" {
		in.Unit = "ft"
	}

	var unitsPerPt float64
	var fonte, label string

	switch {
	case in.RealValue != nil && in.P1x != nil && in.P1y != nil && in.P2x != nil && in.P2y != nil:
		if in.WidthPt <= 0 || in.HeightPt <= 0 {
			return badRequest(c, "widthPt e heightPt são obrigatórios para calibrar")
		}
		// A distância entre os dois pontos, em pontos de PDF. Os pontos chegam
		// normalizados, então cada eixo é reescalado pelo lado que lhe cabe: usar
		// a mesma medida nos dois deformaria a diagonal numa prancha que não é
		// quadrada, e nenhuma é.
		dx := (*in.P2x - *in.P1x) * in.WidthPt
		dy := (*in.P2y - *in.P1y) * in.HeightPt
		dist := math.Hypot(dx, dy)
		if dist < 1 {
			return badRequest(c, "os dois pontos estão muito próximos para calibrar")
		}
		if *in.RealValue <= 0 {
			return badRequest(c, "a distância real precisa ser maior que zero")
		}
		unitsPerPt = *in.RealValue / dist
		fonte = "calibrated"
		label = strings.TrimSpace(in.Label)

	case strings.TrimSpace(in.Label) != "":
		// Escala declarada não sobrepõe calibração. Ver o comentário do topo.
		if fonteAtual == "calibrated" {
			return badRequest(c, "esta folha já foi calibrada à mão; a escala do carimbo não sobrepõe")
		}
		f, ok := escalaDoCarimbo(in.Label)
		if !ok {
			return badRequest(c, "não consegui interpretar esta escala")
		}
		unitsPerPt = f
		fonte = "declared"
		label = strings.TrimSpace(in.Label)

	default:
		return badRequest(c, "informe a calibração (dois pontos e a distância real) ou a escala escrita na prancha")
	}

	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_sheet
		   SET scale_units_per_pt = $2, scale_label = $3, scale_unit = $4, scale_source = $5
		 WHERE id = $1`, sheetID, unitsPerPt, label, in.Unit, fonte); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{
		"sheetId": sheetID, "unitsPerPt": unitsPerPt,
		"label": label, "unit": in.Unit, "source": fonte,
	}})
}

// A notação arquitetônica de escala, como aparece no carimbo.
//
// Cobre as formas que os sets reais usam: `1/4" = 1'-0"`, `3/16"=1'`, `1" = 20'`.
// A conta é sempre a mesma: quantos pés do mundo cabem numa polegada do papel,
// dividido por 72, que é quantos pontos de PDF há numa polegada.
var reEscala = regexp.MustCompile(
	`^\s*(?:(\d+)\s+)?(?:(\d+)\s*/\s*(\d+)|(\d+(?:\.\d+)?))\s*"?\s*=\s*(\d+(?:\.\d+)?)\s*'`)

// escalaDoCarimbo interpreta a notação e devolve unidades do mundo por ponto.
//
// Devolve `false` em vez de chutar quando não reconhece. Escala errada é pior
// que escala ausente: a trena responde com confiança um número que não vale, e
// alguém corta madeira por ele.
func escalaDoCarimbo(s string) (float64, bool) {
	m := reEscala.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return 0, false
	}
	var polegadasNoPapel float64
	if m[4] != "" {
		polegadasNoPapel, _ = strconv.ParseFloat(m[4], 64)
	} else {
		num, _ := strconv.ParseFloat(m[2], 64)
		den, _ := strconv.ParseFloat(m[3], 64)
		if den == 0 {
			return 0, false
		}
		polegadasNoPapel = num / den
		// A parte inteira de uma fração mista, como o 1 de `1 1/2"`.
		if m[1] != "" {
			inteiro, _ := strconv.ParseFloat(m[1], 64)
			polegadasNoPapel += inteiro
		}
	}
	pesNoMundo, _ := strconv.ParseFloat(m[5], 64)
	if polegadasNoPapel <= 0 || pesNoMundo <= 0 {
		return 0, false
	}
	// 72 pontos de PDF por polegada.
	return pesNoMundo / (polegadasNoPapel * 72), true
}

// GET /atlas/policy e PUT /atlas/policy/:key
//
// Os parâmetros de operação, mutáveis sem deploy. O prazo de expiração do
// offline é o primeiro deles, e existe porque "configurável pelo administrador"
// não pode significar "editável no código por um desenvolvedor".
func (h *AtlasHandler) ListPolicy(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(),
		`SELECT key, value FROM atlas_policy ORDER BY key`)
	if err != nil {
		return internalErr(c, err)
	}
	defer rows.Close()
	out := map[string]any{}
	for rows.Next() {
		var k string
		var v any
		if rows.Scan(&k, &v) == nil {
			out[k] = v
		}
	}
	return c.JSON(fiber.Map{"data": out})
}

func (h *AtlasHandler) SetPolicy(c *fiber.Ctx) error {
	key := c.Params("key")
	var in struct {
		Value any `json:"value"`
	}
	if err := c.BodyParser(&in); err != nil {
		return badRequest(c, "invalid body")
	}
	// Chave desconhecida é recusada em vez de criada. Uma tabela de chave e
	// valor que aceita qualquer chave vira depósito de lixo em três meses, e
	// ninguém consegue mais dizer quais delas o código de fato lê.
	var existe bool
	if err := h.db.QueryRow(c.Context(),
		`SELECT true FROM atlas_policy WHERE key = $1`, key).Scan(&existe); err != nil {
		return atlasNotFound(c, "política")
	}
	userID, _ := actor(c)
	if _, err := h.db.Exec(c.Context(), `
		UPDATE atlas_policy SET value = $2, updated_by = $3, updated_at = now()
		 WHERE key = $1`, key, in.Value, userID); err != nil {
		return internalErr(c, err)
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"key": key, "value": in.Value}})
}
