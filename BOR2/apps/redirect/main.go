// Serviço de uma função só: manter vivo o endereço antigo do site.
//
// Em 02/09/2026 o site foi de pg-bor para pg-dip (Data Intelligence Platform) e
// este serviço atendia o pg-bor. Em 23/09 a plataforma acabou, o Atlas virou o
// BuilderLog, e o site voltou para pg-bor. Os papéis se inverteram: agora é o
// pg-dip que mora aqui. O Railway só permite um domínio *.up.railway.app por
// serviço, então o endereço antigo precisa de alguém para atendê-lo.
//
// Devolve 308 e preserva caminho e query, então link antigo salvo em e-mail ou
// mensagem continua chegando onde deve. Fica no ar até ninguém mais usar o
// pg-dip, e depois some junto com o domínio.
package main

import (
	"log"
	"net/http"
	"os"
)

const destino = "https://pg-bor.up.railway.app"

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
