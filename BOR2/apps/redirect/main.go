// Serviço de uma função só: manter vivo o endereço antigo da plataforma.
//
// O site respondia em pg-bor.up.railway.app, nome que dizia "BOR" quando o BOR
// ainda era o produto inteiro. Virou pg-dip.up.railway.app — mas o Railway só
// permite um domínio *.up.railway.app por serviço, então o endereço antigo
// precisa de alguém para atendê-lo. É este processo.
//
// Devolve 308 e preserva caminho e query, então link antigo salvo em e-mail ou
// mensagem continua chegando onde deve. Combinado: fica no ar cerca de 30 dias,
// tempo de todo mundo se atualizar, e depois some junto com o domínio.
package main

import (
	"log"
	"net/http"
	"os"
)

const destino = "https://pg-dip.up.railway.app"

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	// O Railway derruba o contêiner se o healthcheck for redirecionado junto
	// com o resto, então ele responde antes da regra geral.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","redirectsTo":"` + destino + `"}`))
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		alvo := destino + r.URL.RequestURI()
		// 308 preserva o método: um POST antigo não vira GET no caminho.
		http.Redirect(w, r, alvo, http.StatusPermanentRedirect)
	})

	log.Printf("redirecionando tudo para %s na porta %s", destino, port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
