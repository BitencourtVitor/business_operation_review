package handler

import (
	"math"
	"testing"
)

// A escala é o número que a trena multiplica. Errar aqui não produz um erro na
// tela: produz uma medida com cara de certa, e alguém corta madeira por ela.
func TestEscalaDoCarimbo(t *testing.T) {
	casos := []struct {
		entrada string
		// Pés do mundo por ponto de PDF. A conferência é feita pelo caminho
		// inverso do código, com a conta escrita à mão, para os dois não
		// errarem juntos.
		querPesPorPt float64
		querOK       bool
	}{
		// 1/4" no papel vale 1 pé. Uma polegada tem 72 pt, então 1/4" são 18 pt,
		// e cada ponto vale 1/18 de pé.
		{`1/4" = 1'-0"`, 1.0 / 18, true},
		{`1/4"=1'`, 1.0 / 18, true},
		// 1/8" são 9 pt por pé.
		{`1/8" = 1'-0"`, 1.0 / 9, true},
		// 3/16" são 13,5 pt por pé.
		{`3/16" = 1'-0"`, 1.0 / 13.5, true},
		// Fração mista: 1 1/2" são 108 pt por pé.
		{`1 1/2" = 1'-0"`, 1.0 / 108, true},
		// Escala de implantação: 1" vale 20 pés, então cada ponto vale 20/72.
		{`1" = 20'`, 20.0 / 72, true},
		{`1"=100'`, 100.0 / 72, true},

		// O que não é escala precisa ser recusado, e não chutado.
		{"", 0, false},
		{"NOT TO SCALE", 0, false},
		{"AS NOTED", 0, false},
		{`1/0" = 1'`, 0, false},
		{"1-01-L", 0, false},
		{`1/4" = 0'`, 0, false},
	}

	for _, c := range casos {
		got, ok := escalaDoCarimbo(c.entrada)
		if ok != c.querOK {
			t.Errorf("escalaDoCarimbo(%q) reconheceu=%v, queria %v", c.entrada, ok, c.querOK)
			continue
		}
		if !c.querOK {
			continue
		}
		if math.Abs(got-c.querPesPorPt) > 1e-9 {
			t.Errorf("escalaDoCarimbo(%q) = %v, queria %v", c.entrada, got, c.querPesPorPt)
		}
	}
}

// Uma prancha A0 em 1/4" tem cerca de 42 pés de largura útil. Se a conta
// estivesse invertida, este número sairia na casa dos milhares, e o teste acima
// sozinho não pegaria a inversão porque ele confere contra a mesma fórmula.
func TestEscalaEmPranchaReal(t *testing.T) {
	f, ok := escalaDoCarimbo(`1/4" = 1'-0"`)
	if !ok {
		t.Fatal("não reconheceu a escala mais comum de todas")
	}
	const larguraA0pt = 3024 // a largura real do set arquitetônico do acervo
	pes := larguraA0pt * f
	if pes < 100 || pes > 200 {
		t.Errorf("prancha de 3024 pt em 1/4\" deu %.1f pés; esperado algo entre 100 e 200", pes)
	}
}
