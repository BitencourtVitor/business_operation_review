package domain

import (
	"encoding/json"
	"testing"
)

func TestFieldwireScoredSobreviveAoRoundTrip(t *testing.T) {
	// O JSON que a consulta do Forecast monta, com o On Atlas fora da nota.
	const vindoDoBanco = `[
		{"id":1,"status":"completed","category":"","document":"House Plan","scored":true},
		{"id":2,"status":"true","category":"","document":"Shared with subcontractor","scored":true},
		{"id":3,"status":null,"category":"","document":"On Atlas","scored":false}
	]`

	var docs []ForecastFieldwireDoc
	if err := json.Unmarshal([]byte(vindoDoBanco), &docs); err != nil {
		t.Fatal(err)
	}
	if len(docs) != 3 {
		t.Fatalf("esperava 3 documentos, veio %d", len(docs))
	}
	if docs[2].Scored {
		t.Error("On Atlas voltou como pontuavel")
	}
	if !docs[0].Scored || !docs[1].Scored {
		t.Error("documento de Fieldwire perdeu a marca de pontuavel")
	}

	// O que o navegador recebe. Sem o campo aqui, a tela conta o On Atlas.
	paraONavegador, err := json.Marshal(docs)
	if err != nil {
		t.Fatal(err)
	}
	var devolta []map[string]any
	if err := json.Unmarshal(paraONavegador, &devolta); err != nil {
		t.Fatal(err)
	}
	for i, d := range devolta {
		if _, tem := d["scored"]; !tem {
			t.Errorf("documento %d saiu para o navegador sem scored", i)
		}
	}
	if devolta[2]["scored"] != false {
		t.Errorf("On Atlas chegou ao navegador como %v", devolta[2]["scored"])
	}
}
