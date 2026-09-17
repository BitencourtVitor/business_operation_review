package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// A leitura do trecho da prancha por IA (ATL-103).
//
// Um recorte por chamada. O navegador corta o trecho marcado em pedaços de até
// dez polegadas, desenha cada um em 3072 px e manda aqui com o texto do PDF que
// cai dentro dele. Daqui vai ao Gemini com resolução ultra_high, que é requisito:
// a resolução que o modelo enxerga é a do pedaço, e não economizar nela foi
// decisão do Vitor.
//
// Pelo OpenRouter, com a mesma chave da Aria e do ditado, para os créditos de IA
// ficarem num lugar só. O OpenRouter não documenta `media_resolution`, mas
// traduz o `detail` da imagem: medido em 14/09 com o mesmo recorte, `low` deu
// 268 tokens, o padrão 1.088 (high) e `original` 2.170, que é o ultra_high.
// Qualquer outro valor cai no padrão, então `original` é obrigatório aqui.
//
// O que volta é rascunho de takeoff: cada elemento com a caixa onde está, a tag
// que o identifica e se precisa de revisão. O dicionário do set vai junto em
// toda chamada, porque é ele que diz que o hexágono é janela nesta obra.

const openRouterChat = "https://openrouter.ai/api/v1/chat/completions"

type takeoffAIText struct {
	Text string    `json:"text"`
	Box  []float64 `json:"box"` // 0 a 1000 no recorte
}

type takeoffAIElement struct {
	Kind       string    `json:"kind"`
	Tag        string    `json:"tag"`
	Label      string    `json:"label"`
	Box        []float64 `json:"box"`
	Units      int       `json:"units"`
	Substrate  string    `json:"substrate"`
	Confidence float64   `json:"confidence"`
	Review     bool      `json:"review"`
	Reason     string    `json:"reason"`
}

type takeoffAILine struct {
	Kind string  `json:"kind"`
	X1   float64 `json:"x1"`
	Y1   float64 `json:"y1"`
	X2   float64 `json:"x2"`
	Y2   float64 `json:"y2"`
}

// POST /atlas/sheets/:id/takeoff/ai
func (h *AtlasHandler) TakeoffAI(c *fiber.Ctx) error {
	sheetID := c.Params("id")
	var jobsiteID, documentID, sheetNumber string
	if err := h.db.QueryRow(c.Context(), `
		SELECT d.jobsite_id, d.id, COALESCE(s.sheet_number, '')
		  FROM atlas_sheet s
		  JOIN atlas_document_version v ON v.id = s.version_id
		  JOIN atlas_document d ON d.id = v.document_id
		 WHERE s.id = $1`, sheetID).Scan(&jobsiteID, &documentID, &sheetNumber); err != nil {
		return atlasNotFound(c, "folha")
	}
	if err := h.require(c, jobsiteID, "manage"); err != nil {
		return atlasForbidden(c)
	}
	key := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	if key == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "AI reading has no credential: OPENROUTER_API_KEY is missing on the API",
			"code":  "AI_NOT_CONFIGURED",
		})
	}

	var in struct {
		Image string          `json:"image"`
		Mime  string          `json:"mime"`
		Texts []takeoffAIText `json:"texts"`
		// Tamanho do recorte no papel, em polegadas: diz ao modelo a escala do que vê.
		WidthIn  float64 `json:"widthIn"`
		HeightIn float64 `json:"heightIn"`
	}
	if err := c.BodyParser(&in); err != nil || in.Image == "" {
		return badRequest(c, "image é obrigatório")
	}
	if in.Mime == "" {
		in.Mime = "image/png"
	}

	terms, err := h.takeoffTerms(c.Context(), documentID)
	if err != nil {
		return internalErr(c, err)
	}
	prompt := montarPromptTakeoff(resolverDicionario(terms), in.Texts, sheetNumber, in.WidthIn, in.HeightIn)

	model := envOr("ATLAS_TAKEOFF_MODEL", "google/gemini-3.8-flash-20260902")
	ctx, cancel := context.WithTimeout(c.Context(), 4*time.Minute)
	defer cancel()
	res, err := chamarOpenRouterVisao(ctx, key, model, envOr("ATLAS_TAKEOFF_REASONING", "high"), prompt, in.Mime, in.Image)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error(), "code": "AI_FAILED"})
	}

	var saida struct {
		Elements []takeoffAIElement `json:"elements"`
		Lines    []takeoffAILine    `json:"lines"`
	}
	if err := json.Unmarshal([]byte(jsonDoTexto(res.text)), &saida); err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "the AI answer did not come in the agreed format", "code": "AI_BAD_OUTPUT",
		})
	}
	elementos := saida.Elements[:0]
	for _, e := range saida.Elements {
		if len(e.Box) != 4 {
			continue
		}
		for i := range e.Box {
			e.Box[i] = math.Max(0, math.Min(1000, e.Box[i]))
		}
		e.Kind = strings.ToLower(strings.TrimSpace(e.Kind))
		elementos = append(elementos, e)
	}

	// O custo é o que o OpenRouter cobrou, quando ele diz; senão, estimado pelo
	// preço cheio de 2027.
	custo := res.cost
	if custo <= 0 {
		precoIn := envFloat("ATLAS_TAKEOFF_PRICE_IN", 1.50)
		precoOut := envFloat("ATLAS_TAKEOFF_PRICE_OUT", 7.50)
		custo = (float64(res.input)*precoIn + float64(res.output+res.thoughts)*precoOut) / 1e6
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"elements": elementos,
		"lines":    saida.Lines,
		"model":    model,
		"usage": fiber.Map{
			"input": res.input, "output": res.output, "thoughts": res.thoughts,
			"costUsd": math.Round(custo*1e5) / 1e5,
		},
	}})
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func envFloat(key string, def float64) float64 {
	if v, err := strconv.ParseFloat(strings.TrimSpace(os.Getenv(key)), 64); err == nil && v > 0 {
		return v
	}
	return def
}

var reCercaJSON = regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)```")

// jsonDoTexto tira a cerca de código e o que vier antes ou depois do objeto.
func jsonDoTexto(s string) string {
	if m := reCercaJSON.FindStringSubmatch(s); m != nil {
		s = m[1]
	}
	i, j := strings.Index(s, "{"), strings.LastIndex(s, "}")
	if i < 0 || j <= i {
		return s
	}
	return s[i : j+1]
}

type respostaVisao struct {
	text                    string
	input, output, thoughts int
	cost                    float64
}

func chamarOpenRouterVisao(ctx context.Context, key, model, reasoning, prompt, mime, imagem string) (*respostaVisao, error) {
	montar := func(jsonFormat bool) ([]byte, error) {
		body := map[string]any{
			"model": model,
			"messages": []any{map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": prompt},
					map[string]any{"type": "image_url", "image_url": map[string]any{
						"url": "data:" + mime + ";base64," + imagem,
						// ultra_high. Ver o comentário do topo.
						"detail": "original",
					}},
				},
			}},
			"reasoning": map[string]any{"effort": reasoning},
			"usage":     map[string]any{"include": true},
		}
		if jsonFormat {
			body["response_format"] = map[string]any{"type": "json_object"}
		}
		return json.Marshal(body)
	}

	enviar := func(corpo []byte) (int, []byte, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterChat, bytes.NewReader(corpo))
		if err != nil {
			return 0, nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+key)
		req.Header.Set("X-Title", "Atlas Takeoff")
		resp, err := (&http.Client{Timeout: 4 * time.Minute}).Do(req)
		if err != nil {
			return 0, nil, err
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		return resp.StatusCode, b, err
	}

	corpo, err := montar(true)
	if err != nil {
		return nil, err
	}
	status, b, err := enviar(corpo)
	if err != nil {
		return nil, fmt.Errorf("openrouter: %w", err)
	}
	// Se o formato JSON não for aceito pelo provedor da vez, o prompt já pede
	// JSON: tenta de novo sem ele antes de desistir.
	if status == http.StatusBadRequest && strings.Contains(string(b), "response_format") {
		if corpo, err = montar(false); err != nil {
			return nil, err
		}
		if status, b, err = enviar(corpo); err != nil {
			return nil, fmt.Errorf("openrouter: %w", err)
		}
	}
	if status != http.StatusOK {
		msg := string(b)
		if len(msg) > 400 {
			msg = msg[:400]
		}
		return nil, fmt.Errorf("openrouter devolveu %d: %s", status, msg)
	}

	var r struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens            int     `json:"prompt_tokens"`
			CompletionTokens        int     `json:"completion_tokens"`
			Cost                    float64 `json:"cost"`
			CompletionTokensDetails struct {
				ReasoningTokens int `json:"reasoning_tokens"`
			} `json:"completion_tokens_details"`
		} `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, fmt.Errorf("openrouter: resposta ilegível: %w", err)
	}
	if r.Error != nil {
		return nil, fmt.Errorf("openrouter: %s", r.Error.Message)
	}
	if len(r.Choices) == 0 {
		return nil, fmt.Errorf("openrouter não devolveu resposta")
	}
	// No OpenRouter o raciocínio vem dentro de completion_tokens.
	pensado := r.Usage.CompletionTokensDetails.ReasoningTokens
	return &respostaVisao{
		text:     r.Choices[0].Message.Content,
		input:    r.Usage.PromptTokens,
		output:   max(0, r.Usage.CompletionTokens-pensado),
		thoughts: pensado,
		cost:     r.Usage.Cost,
	}, nil
}

const promptTakeoffBase = `You read one crop of a US construction drawing set (wood framing contractor). Report what is BUILT, and keep it apart from the annotation around it.

COORDINATES
Every box is [x0, y0, x1, y1] on a 0 to 1000 grid of THIS image: x grows to the right, y grows down.

WHAT TO REPORT
- elements: every building element visible in the crop, one per occurrence.
- lines: long straight building lines useful for quantity takeoff: wall lines in plans, roof slopes, plate and floor lines in elevations.

RULES
1. Title blocks, legends, general notes, dimension strings, leaders, grid bubbles, section marks and keynote bubbles are annotation, never building elements. Report a dimension string only as kind "dimension", with its exact text in label.
2. Windows and doors are identified by the tag drawn on or beside them, read through THIS SET'S DICTIONARY below. The tag's shape tells the category: follow the set legend, not the general standard, when they disagree.
3. A tag names a type, and one type may hold several units (for example three windows side by side). Report ONE element per tag occurrence, never one per unit, and set units to how many units you actually see drawn in that element.
4. substrate: what the element sits in, when visible (siding, stone, brick, stucco). Hatch and texture tell it.
5. A symbol you cannot resolve through the dictionary is kind "unknown_symbol" with review true and a plain description in reason. Never invent a meaning.
6. confidence goes from 0 to 1. Set review true whenever you are not sure of the kind, the tag, the units or the box.
7. Use the PDF TEXT list for exact spelling of tags and numbers; it comes from the file itself.

ELEMENT KINDS: window, door, opening, railing, light_fixture, vent, stair, column, beam, roof, wall_finish, dimension, note, unknown_symbol, other.
LINE KINDS: wall, slope, plate, line.

Answer with JSON only, no prose:
{"elements":[{"kind":"","tag":"","label":"","box":[0,0,0,0],"units":0,"substrate":"","confidence":0,"review":false,"reason":""}],"lines":[{"kind":"","x1":0,"y1":0,"x2":0,"y2":0}]}`

func montarPromptTakeoff(dic []takeoffTerm, texts []takeoffAIText, sheetNumber string, wIn, hIn float64) string {
	var b strings.Builder
	b.WriteString(promptTakeoffBase)
	b.WriteString("\n\nTHIS CROP\n")
	if sheetNumber != "" {
		b.WriteString("Sheet: " + sheetNumber + "\n")
	}
	if wIn > 0 && hIn > 0 {
		fmt.Fprintf(&b, "Paper size of the crop: %.1f in x %.1f in\n", wIn, hIn)
	}

	presentes := map[string]bool{}
	for _, t := range texts {
		for _, w := range strings.Fields(strings.ToUpper(t.Text)) {
			presentes[strings.Trim(w, ".,:;()")] = true
		}
	}

	var simbolos, tags, abrevs []string
	for _, t := range dic {
		switch t.Kind {
		case "symbol":
			linha := "- " + t.Meaning
			if shape, ok := t.Attrs["shape"].(string); ok && shape != "" {
				linha = "- " + shape + " tag: " + t.Meaning
			}
			if s, ok := t.Attrs["sample"].(string); ok && s != "" {
				linha += fmt.Sprintf(" (legend sample text %q)", s)
			}
			simbolos = append(simbolos, linha+" ["+t.Level+"]")
		case "tag":
			tags = append(tags, "- "+t.Code+": "+t.Meaning)
		case "abbreviation":
			if presentes[strings.ToUpper(t.Code)] {
				abrevs = append(abrevs, "- "+t.Code+": "+t.Meaning)
			}
		}
	}
	sort.Strings(tags)

	b.WriteString("\nTHIS SET'S DICTIONARY (project overrides set, set overrides base)\n")
	b.WriteString("Symbol legend:\n")
	if len(simbolos) == 0 {
		b.WriteString("- none recorded\n")
	}
	for _, s := range simbolos {
		b.WriteString(s + "\n")
	}
	b.WriteString("Project tags (from the schedules):\n")
	if len(tags) == 0 {
		b.WriteString("- none recorded\n")
	}
	for i, s := range tags {
		if i >= 250 {
			break
		}
		b.WriteString(s + "\n")
	}
	if len(abrevs) > 0 {
		b.WriteString("Abbreviations that appear in this crop:\n")
		for _, s := range abrevs {
			b.WriteString(s + "\n")
		}
	}

	b.WriteString("\nPDF TEXT IN THIS CROP (exact, box on the same 0 to 1000 grid)\n")
	for i, t := range texts {
		if i >= 400 {
			b.WriteString("- ...\n")
			break
		}
		if len(t.Box) == 4 {
			fmt.Fprintf(&b, "- %q [%.0f,%.0f,%.0f,%.0f]\n", t.Text, t.Box[0], t.Box[1], t.Box[2], t.Box[3])
		}
	}
	return b.String()
}
