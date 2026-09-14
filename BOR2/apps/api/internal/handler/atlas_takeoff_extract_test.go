package handler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Roda a extração sobre folhas reais de um set. Aponte ATLAS_TAKEOFF_SET para a
// pasta com as páginas em PDF (uma por arquivo); sem ela, o teste é pulado.
func TestExtrairDicionarioDoSet(t *testing.T) {
	dir := os.Getenv("ATLAS_TAKEOFF_SET")
	if dir == "" {
		t.Skip("ATLAS_TAKEOFF_SET não definido")
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.pdf"))
	var todos []termoExtraido
	for _, f := range files {
		paginas, err := lerTexto(context.Background(), f)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for _, p := range paginas {
			todos = append(todos, extrairDaPagina(p)...)
		}
	}
	termos := juntarTermos(todos)
	por := map[string]termoExtraido{}
	for _, tm := range termos {
		por[tm.Level+"|"+tm.Kind+"|"+strings.ToUpper(tm.Code)] = tm
		if os.Getenv("ATLAS_TAKEOFF_VERBOSE") != "" {
			t.Logf("%-8s %-12s %-24q %q %v", tm.Level, tm.Kind, tm.Code, tm.Meaning, tm.Attrs)
		}
	}
	quer := map[string]string{
		"project|tag|A3T":                  "SH",
		"project|tag|A3S":                  "SH",
		"project|tag|B1A":                  "SH",
		"project|tag|J":                    "BALCONY",
		"set|symbol|WINDOW TYPE INDICATOR": "window",
		"set|symbol|DOOR INDICATOR":        "door",
		"set|abbreviation|GWB":             "GYPSUM",
		"project|abbreviation|SH":          "Single",
	}
	for k, trecho := range quer {
		tm, ok := por[k]
		if !ok {
			t.Errorf("faltou %s", k)
			continue
		}
		blob := tm.Meaning
		for _, v := range tm.Attrs {
			if s, ok := v.(string); ok {
				blob += " " + s
			}
		}
		if !strings.Contains(blob, trecho) {
			t.Errorf("%s: esperava %q em %q %v", k, trecho, tm.Meaning, tm.Attrs)
		}
	}
	t.Logf("%d termos", len(termos))
}
