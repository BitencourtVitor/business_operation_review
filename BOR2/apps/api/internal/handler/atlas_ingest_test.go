package handler

import (
	"encoding/xml"
	"io"
	"strings"
	"testing"
)

// Um set da Toll Brothers trouxe U+000E no texto, e o pdftotext copia isso para
// a saída. Sem filtrar, o decodificador para com "illegal character code" e o
// processamento inteiro do documento morre (ATL-114).
func TestSemControleDeixaOXMLPassar(t *testing.T) {
	bruto := "<doc><word>PLAN\x0e A-1</word></doc>"

	// Sem o filtro, o mesmo conteúdo quebra: é o defeito que isto cobre.
	if err := lerTudo(xml.NewDecoder(strings.NewReader(bruto))); err == nil {
		t.Fatal("o XML com caractere de controle deveria falhar sem o filtro")
	}

	dec := xml.NewDecoder(semControle{strings.NewReader(bruto)})
	var texto string
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("com o filtro não podia falhar: %v", err)
		}
		if cd, ok := tok.(xml.CharData); ok {
			texto += string(cd)
		}
	}
	if texto != "PLAN A-1" {
		t.Fatalf("texto lido = %q, esperado %q", texto, "PLAN A-1")
	}
}

func lerTudo(dec *xml.Decoder) error {
	for {
		if _, err := dec.Token(); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}
