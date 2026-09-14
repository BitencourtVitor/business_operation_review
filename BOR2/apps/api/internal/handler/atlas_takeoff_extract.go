package handler

import (
	"math"
	"regexp"
	"sort"
	"strings"
)

// A leitura do dicionário do set (ATL-103), a partir das palavras com posição
// que o pdftotext devolve.
//
// Não há tabela "de verdade" no PDF: a tabela de janelas é texto solto posto em
// colunas, e a legenda de símbolos é um desenho com rótulo ao lado. Então a
// leitura reconstrói linha e célula pela geometria (mesma altura é mesma linha,
// espaço grande é outra célula) e reconhece cada bloco pelo título impresso na
// folha. O que não se reconhece com segurança fica de fora: o dicionário vale
// pelo que acerta, e a pessoa completa à mão o que faltar.

type termoExtraido struct {
	Level   string
	Kind    string
	Code    string
	Meaning string
	Attrs   map[string]any
}

type celula struct {
	Text           string
	X0, Y0, X1, Y1 float64
}

func (c celula) yc() float64 { return (c.Y0 + c.Y1) / 2 }
func (c celula) h() float64  { return c.Y1 - c.Y0 }

type linha struct {
	Words []ingestWord
	Cells []celula
}

func (l linha) yc() float64 {
	if len(l.Words) == 0 {
		return 0
	}
	return (l.Words[0].Y0 + l.Words[0].Y1) / 2
}

func (l linha) texto() string {
	partes := make([]string, len(l.Words))
	for i, w := range l.Words {
		partes[i] = w.Text
	}
	return strings.Join(partes, " ")
}

// montarLinhas agrupa palavras de mesma altura e, dentro da linha, junta em
// célula as que estão coladas. O limite de célula é proporcional à letra: o
// espaço entre palavras é um terço da altura, o de coluna passa de uma altura.
func montarLinhas(words []ingestWord) []linha {
	ws := make([]ingestWord, 0, len(words))
	for _, w := range words {
		if strings.TrimSpace(w.Text) != "" && w.Y1 > w.Y0 {
			ws = append(ws, w)
		}
	}
	sort.Slice(ws, func(i, j int) bool {
		ci, cj := (ws[i].Y0+ws[i].Y1)/2, (ws[j].Y0+ws[j].Y1)/2
		if math.Abs(ci-cj) > 0.5 {
			return ci < cj
		}
		return ws[i].X0 < ws[j].X0
	})

	var out []linha
	for _, w := range ws {
		c := (w.Y0 + w.Y1) / 2
		h := w.Y1 - w.Y0
		if n := len(out); n > 0 {
			ult := out[n-1]
			ref := ult.Words[0]
			if math.Abs(c-(ref.Y0+ref.Y1)/2) <= 0.45*math.Max(h, ref.Y1-ref.Y0) {
				out[n-1].Words = append(out[n-1].Words, w)
				continue
			}
		}
		out = append(out, linha{Words: []ingestWord{w}})
	}

	for i := range out {
		sort.Slice(out[i].Words, func(a, b int) bool { return out[i].Words[a].X0 < out[i].Words[b].X0 })
		var cells []celula
		for _, w := range out[i].Words {
			h := w.Y1 - w.Y0
			if n := len(cells); n > 0 && w.X0-cells[n-1].X1 <= 0.9*h {
				c := &cells[n-1]
				c.Text += " " + w.Text
				c.X1 = math.Max(c.X1, w.X1)
				c.Y0 = math.Min(c.Y0, w.Y0)
				c.Y1 = math.Max(c.Y1, w.Y1)
				continue
			}
			cells = append(cells, celula{Text: w.Text, X0: w.X0, Y0: w.Y0, X1: w.X1, Y1: w.Y1})
		}
		out[i].Cells = cells
	}
	return out
}

// acharFrase devolve a caixa de uma sequência de palavras, como "WINDOW
// SCHEDULE", onde quer que ela esteja na página.
func acharFrase(linhas []linha, frase string) []celula {
	alvo := strings.Fields(strings.ToUpper(frase))
	for i, a := range alvo {
		alvo[i] = strings.Trim(a, ":.,")
	}
	var out []celula
	for _, l := range linhas {
		for i := 0; i+len(alvo) <= len(l.Words); i++ {
			ok := true
			for k, a := range alvo {
				if strings.Trim(strings.ToUpper(l.Words[i+k].Text), ":.,") != a {
					ok = false
					break
				}
			}
			if !ok {
				continue
			}
			first, last := l.Words[i], l.Words[i+len(alvo)-1]
			out = append(out, celula{
				Text: frase, X0: first.X0, Y0: first.Y0, X1: last.X1,
				Y1: math.Max(first.Y1, last.Y1),
			})
		}
	}
	return out
}

var (
	reTagJanela  = regexp.MustCompile(`^[A-Z]{1,2}\d{1,2}[A-Z]{0,2}$`)
	reTipoJanela = regexp.MustCompile(`^(SH|DH|F|FX|CA|AW|SL|CT|T|A|AR|B|H|P)$`)
	reArea       = regexp.MustCompile(`(\d+(?:\.\d+)?)\s*SF`)
	reTamanho    = regexp.MustCompile(`\d+'\s*-\s*[\d ½/]+"?\s*[Xx]\s*\d+'\s*-\s*[\d ½/.]+"?`)
	reChaveTipo  = regexp.MustCompile(`^([A-Z]{1,3})\s+([A-Z][a-z].*)$`)
	reCodigoPort = regexp.MustCompile(`^[A-Z0-9]{1,5}$`)
	reAbrev      = regexp.MustCompile(`^[A-Z0-9&/().#+\-]{1,8}( [A-Z0-9&/.\-]{1,6})?$`)
	reCodigoTipo = regexp.MustCompile(`^[A-Z]{1,2}\d?$`)
)

func textoDasLinhas(linhas []linha) string {
	var b strings.Builder
	for _, l := range linhas {
		b.WriteString(strings.ToUpper(l.texto()))
		b.WriteByte('\n')
	}
	return b.String()
}

// extrairDaPagina lê uma página e devolve o que ela ensina ao dicionário.
func extrairDaPagina(p ingestPagina) []termoExtraido {
	linhas := montarLinhas(p.Words)
	if len(linhas) == 0 {
		return nil
	}
	texto := textoDasLinhas(linhas)
	var out []termoExtraido
	if strings.Contains(texto, "WINDOW SCHEDULE") {
		out = append(out, lerTabelaDeJanelas(linhas)...)
		out = append(out, lerChaveDeTipos(linhas)...)
	}
	if strings.Contains(texto, "WINDOW TYPES") {
		out = append(out, lerFolhaDeTipos(linhas)...)
	}
	if strings.Contains(texto, "DOOR SCHEDULE") {
		out = append(out, lerTabelaDePortas(linhas)...)
	}
	if strings.Contains(texto, "ABBREVIATIONS") {
		out = append(out, lerAbreviacoes(linhas, p.Width)...)
	}
	if strings.Contains(texto, "REFERENCE SYMBOLS") {
		out = append(out, lerLegendaDeSimbolos(linhas, p)...)
	}
	return out
}

// lerTabelaDeJanelas: "A3T SH 35 SF 9'-3"X5'-4" 6" wide Stud Pack btwn Windows".
func lerTabelaDeJanelas(linhas []linha) []termoExtraido {
	limite := math.Inf(1)
	for _, c := range acharFrase(linhas, "Remarks") {
		limite = c.X1 + 180
	}
	var out []termoExtraido
	for _, l := range linhas {
		for i := 0; i+1 < len(l.Words); i++ {
			tag, tipo := l.Words[i], l.Words[i+1]
			if !reTagJanela.MatchString(tag.Text) || !reTipoJanela.MatchString(tipo.Text) {
				continue
			}
			teto := limite
			if math.IsInf(teto, 1) {
				teto = tag.X0 + 330
			}
			var resto []string
			for _, w := range l.Words[i+2:] {
				if w.X0 > teto {
					break
				}
				resto = append(resto, w.Text)
			}
			linhaTexto := strings.Join(resto, " ")
			attrs := map[string]any{"category": "window", "type": tipo.Text}
			if m := reArea.FindStringSubmatch(linhaTexto); m != nil {
				attrs["area"] = m[1] + " SF"
				linhaTexto = strings.Replace(linhaTexto, m[0], "", 1)
			}
			if m := reTamanho.FindString(linhaTexto); m != "" {
				attrs["size"] = strings.ReplaceAll(m, " ", "")
				linhaTexto = strings.Replace(linhaTexto, m, "", 1)
			}
			if r := strings.TrimSpace(linhaTexto); r != "" {
				attrs["remarks"] = r
			}
			if u := unidadesDaTag(tag.Text); u > 0 {
				attrs["units"] = u
			}
			out = append(out, termoExtraido{
				Level: "project", Kind: "tag", Code: tag.Text,
				Meaning: descreverJanela(tag.Text, attrs), Attrs: attrs,
			})
			break
		}
	}
	return out
}

// O número da tag é quantas unidades de janela ela soma: A3T são três.
func unidadesDaTag(code string) int {
	m := regexp.MustCompile(`^[A-Z]{1,2}(\d{1,2})`).FindStringSubmatch(code)
	if m == nil {
		return 0
	}
	n := 0
	for _, r := range m[1] {
		n = n*10 + int(r-'0')
	}
	return n
}

func descreverJanela(code string, attrs map[string]any) string {
	partes := []string{"Window " + code}
	if t, ok := attrs["type"].(string); ok {
		partes = append(partes, t)
	}
	if s, ok := attrs["size"].(string); ok {
		partes = append(partes, s)
	}
	if a, ok := attrs["area"].(string); ok {
		partes = append(partes, a)
	}
	return strings.Join(partes, ", ")
}

// lerChaveDeTipos: o bloco "WINDOW TYPE KEY:" com "SH Single Hung" embaixo.
func lerChaveDeTipos(linhas []linha) []termoExtraido {
	var out []termoExtraido
	for _, hdr := range acharFrase(linhas, "WINDOW TYPE KEY") {
		for _, l := range linhas {
			if l.yc() <= hdr.Y1 || l.yc() > hdr.Y1+220 {
				continue
			}
			var partes []string
			for _, w := range l.Words {
				if w.X0 >= hdr.X0-10 && w.X0 <= hdr.X0+110 {
					partes = append(partes, w.Text)
				}
			}
			m := reChaveTipo.FindStringSubmatch(strings.Join(partes, " "))
			if m == nil {
				continue
			}
			out = append(out, termoExtraido{
				Level: "project", Kind: "abbreviation", Code: m[1], Meaning: m[2],
				Attrs: map[string]any{"group": "window type"},
			})
		}
	}
	return out
}

// lerFolhaDeTipos: na folha de tipos, a descrição fica logo abaixo da tag
// ("A3S" e, embaixo, "Three Single - Double Hung Windows w/ Studs Between").
// Uma linha de códigos curtos lado a lado com nome embaixo é a de portas.
func lerFolhaDeTipos(linhas []linha) []termoExtraido {
	var out []termoExtraido
	abaixo := func(x0, x1, y1, altura, largura float64) string {
		cx := (x0 + x1) / 2
		var partes []string
		for _, l := range linhas {
			if l.yc() <= y1 || l.yc() > y1+altura {
				continue
			}
			for _, w := range l.Words {
				wc := (w.X0 + w.X1) / 2
				if math.Abs(wc-cx) <= largura {
					partes = append(partes, w.Text)
				}
			}
		}
		return strings.TrimSpace(strings.Join(partes, " "))
	}

	for _, l := range linhas {
		curtos := 0
		for _, c := range l.Cells {
			if reCodigoTipo.MatchString(c.Text) {
				curtos++
			}
		}
		for _, w := range l.Words {
			if !reTagJanela.MatchString(w.Text) {
				continue
			}
			desc := semTitulos(abaixo(w.X0, w.X1, w.Y1, 58, 125))
			if desc == "" || !strings.ContainsAny(desc, "abcdefghijklmnopqrstuvwxyz") {
				continue
			}
			attrs := map[string]any{"category": "window", "description": desc}
			if strings.Contains(strings.ToLower(desc), "stone") {
				attrs["substrate"] = "stone"
			}
			out = append(out, termoExtraido{Level: "project", Kind: "tag", Code: w.Text, Meaning: desc, Attrs: attrs})
		}
		// Linha de tipos de porta: quatro ou mais códigos curtos na mesma altura.
		if curtos >= 4 {
			for _, c := range l.Cells {
				if !reCodigoTipo.MatchString(c.Text) {
					continue
				}
				desc := abaixo(c.X0, c.X1, c.Y1, 26, 45)
				if desc == "" || strings.ContainsAny(desc, "0123456789'\"") {
					continue
				}
				out = append(out, termoExtraido{
					Level: "project", Kind: "abbreviation", Code: c.Text, Meaning: desc,
					Attrs: map[string]any{"group": "door type"},
				})
			}
		}
	}
	return out
}

// semTitulos tira da descrição as palavras de título da folha ("WINDOW
// TYPES"), que ficam em caixa alta e às vezes caem logo abaixo da tag.
func semTitulos(desc string) string {
	var partes []string
	for _, p := range strings.Fields(desc) {
		letras := strings.Trim(p, "().,:;*")
		if len(letras) >= 4 && strings.ToUpper(letras) == letras && strings.ToLower(letras) != letras {
			continue
		}
		partes = append(partes, p)
	}
	return strings.Join(partes, " ")
}

// lerTabelaDePortas: a coluna "NO." com o código e, ao lado, o nome do cômodo.
func lerTabelaDePortas(linhas []linha) []termoExtraido {
	var out []termoExtraido
	titulos := acharFrase(linhas, "Schedule")
	for _, hdr := range acharFrase(linhas, "NO.") {
		titulo := ""
		melhor := math.Inf(1)
		for _, t := range titulos {
			d := hdr.Y0 - t.Y1
			if d > 0 && d < 90 && math.Abs(t.X0-hdr.X0) < 600 && d < melhor {
				melhor = d
				for _, l := range linhas {
					if math.Abs(l.yc()-t.yc()) < 2 {
						for _, c := range l.Cells {
							if c.X0 <= t.X0+1 && c.X1 >= t.X1-1 {
								titulo = c.Text
							}
						}
					}
				}
			}
		}
		if !strings.Contains(strings.ToUpper(titulo), "DOOR") {
			continue
		}
		for _, l := range linhas {
			if l.yc() <= hdr.Y1 || l.yc() > hdr.Y1+700 {
				continue
			}
			for i, w := range l.Words {
				if math.Abs(w.X0-hdr.X0) > 12 || !reCodigoPort.MatchString(w.Text) {
					continue
				}
				var nome []string
				fim := w.X1
				for _, n := range l.Words[i+1:] {
					if n.X0-fim > 40 || strings.ContainsAny(n.Text, "0123456789'\"") || strings.ToUpper(n.Text) != n.Text {
						break
					}
					nome = append(nome, n.Text)
					fim = n.X1
				}
				if len(nome) == 0 || !strings.ContainsAny(strings.Join(nome, ""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
					break
				}
				room := strings.Join(nome, " ")
				out = append(out, termoExtraido{
					Level: "project", Kind: "tag", Code: w.Text, Meaning: "Door " + w.Text + ": " + room,
					Attrs: map[string]any{"category": "door", "room": room, "schedule": titulo},
				})
				break
			}
		}
	}
	return out
}

// lerAbreviacoes: pares "GWB GYPSUM WALL BOARD" dentro da tabela de abreviações.
func lerAbreviacoes(linhas []linha, largura float64) []termoExtraido {
	hdrs := acharFrase(linhas, "ABBREVIATIONS")
	if len(hdrs) == 0 {
		return nil
	}
	hdr := hdrs[0]
	xMax := largura
	for _, outro := range []string{"REFERENCE SYMBOLS", "GENERAL NOTES", "SYMBOLS"} {
		for _, c := range acharFrase(linhas, outro) {
			if c.X0 > hdr.X1 && math.Abs(c.yc()-hdr.yc()) < 12 && c.X0 < xMax {
				xMax = c.X0 - 5
			}
		}
	}
	vistos := map[string]bool{}
	var out []termoExtraido
	for _, l := range linhas {
		if l.yc() <= hdr.Y1 {
			continue
		}
		cells := l.Cells
		for i := 0; i+1 < len(cells); i++ {
			a, m := cells[i], cells[i+1]
			if a.X0 < hdr.X0-40 || m.X1 > xMax {
				continue
			}
			if !reAbrev.MatchString(a.Text) || m.X0-a.X1 > 80 || len(m.Text) <= len(a.Text) {
				continue
			}
			if reAbrev.MatchString(m.Text) || strings.ToUpper(m.Text) != m.Text {
				continue
			}
			key := strings.ToUpper(a.Text)
			if vistos[key] {
				i++
				continue
			}
			vistos[key] = true
			out = append(out, termoExtraido{
				Level: "set", Kind: "abbreviation", Code: a.Text, Meaning: m.Text, Attrs: map[string]any{},
			})
			i++
		}
	}
	return out
}

// lerLegendaDeSimbolos: cada rótulo "WINDOW TYPE INDICATOR" com o exemplo que
// está desenhado à esquerda dele. A forma do exemplo (hexágono, elipse) não
// está no texto: quem a mede é o navegador, que lê o vetor da folha pela caixa
// guardada aqui.
func lerLegendaDeSimbolos(linhas []linha, p ingestPagina) []termoExtraido {
	hdrs := acharFrase(linhas, "REFERENCE SYMBOLS")
	if len(hdrs) == 0 {
		return nil
	}
	hdr := hdrs[0]
	var cells []celula
	for _, l := range linhas {
		if l.yc() <= hdr.Y1 || l.yc() > hdr.Y1+900 {
			continue
		}
		for _, c := range l.Cells {
			if c.X0 >= hdr.X0-160 && c.X1 <= hdr.X1+260 {
				cells = append(cells, c)
			}
		}
	}
	var out []termoExtraido
	for _, c := range cells {
		up := strings.ToUpper(c.Text)
		if !strings.HasSuffix(up, "INDICATOR") && !strings.HasSuffix(up, "REFERENCE") {
			continue
		}
		var amostra *celula
		melhor := math.Inf(1)
		for i := range cells {
			s := cells[i]
			if s.X1 >= c.X0-15 || math.Abs(s.yc()-c.yc()) > 24 || len(s.Text) > 12 {
				continue
			}
			if d := c.X0 - s.X1; d < melhor {
				melhor = d
				amostra = &cells[i]
			}
		}
		attrs := map[string]any{"target": alvoDoSimbolo(up), "pageWidth": p.Width, "pageHeight": p.Height}
		if amostra != nil {
			attrs["sample"] = amostra.Text
			attrs["sampleBox"] = []float64{amostra.X0, amostra.Y0, amostra.X1, amostra.Y1}
		}
		out = append(out, termoExtraido{
			Level: "set", Kind: "symbol", Code: up, Meaning: capitalizar(c.Text), Attrs: attrs,
		})
	}
	return out
}

func alvoDoSimbolo(label string) string {
	switch {
	case strings.Contains(label, "WINDOW"):
		return "window"
	case strings.Contains(label, "DOOR"):
		return "door"
	case strings.Contains(label, "ROOM"):
		return "room"
	case strings.Contains(label, "GRID"):
		return "grid"
	case strings.Contains(label, "WALL"):
		return "wall"
	case strings.Contains(label, "REVISION"):
		return "revision"
	default:
		return "reference"
	}
}

func capitalizar(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// juntarTermos une o que várias folhas ensinaram sobre o mesmo código: a tabela
// dá tipo e tamanho, a folha de tipos dá a descrição. O primeiro significado
// fica, os atributos se somam.
func juntarTermos(termos []termoExtraido) []termoExtraido {
	idx := map[string]int{}
	var out []termoExtraido
	for _, t := range termos {
		k := t.Level + "|" + t.Kind + "|" + strings.ToUpper(t.Code)
		i, ok := idx[k]
		if !ok {
			if t.Attrs == nil {
				t.Attrs = map[string]any{}
			}
			idx[k] = len(out)
			out = append(out, t)
			continue
		}
		for a, v := range t.Attrs {
			if _, tem := out[i].Attrs[a]; !tem {
				out[i].Attrs[a] = v
			}
		}
		if d, ok := t.Attrs["description"].(string); ok && out[i].Kind == "tag" && !strings.Contains(out[i].Meaning, d) {
			out[i].Meaning += ". " + d
		}
	}
	return out
}
