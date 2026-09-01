// atlas-r2check — prova que o bucket do Atlas responde de ponta a ponta.
//
// Existe porque a validação do R2 feita em 01/09 cobriu só leitura: listagem
// deu 200 e o escopo restrito deu 403 em ListBuckets, mas nenhum byte foi
// escrito (AT-8, pendência 3). Um bucket que lista e não aceita PUT só se
// revela no primeiro upload de 112 MB de um usuário real.
//
// Sobe um objeto minúsculo pela URL assinada, confere pelo HeadObject, lê de
// volta pela URL assinada de leitura e apaga. Não deixa rastro no bucket.
//
//	go run ./cmd/atlas-r2check
package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/config"
	"github.com/bitencourtVitor/bor2-api/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fail("config: %v", err)
	}
	r2 := service.NewR2Service(cfg.R2.Endpoint, cfg.R2.Bucket, cfg.R2.AccessKey, cfg.R2.SecretKey)
	if !r2.Configured() {
		fail("R2 não configurado: falta R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID ou R2_SECRET_ACCESS_KEY")
	}

	ctx := context.Background()
	key := fmt.Sprintf("_healthcheck/%d.txt", time.Now().UnixNano())
	payload := []byte("atlas r2 check\n")

	putURL, err := r2.UploadURL(ctx, key, "text/plain", 5*time.Minute)
	if err != nil {
		fail("assinar PUT: %v", err)
	}
	fmt.Println("PUT assinado   ok")

	req, _ := http.NewRequest(http.MethodPut, putURL, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "text/plain")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fail("PUT: %v", err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode/100 != 2 {
		fail("PUT devolveu %d: %s", res.StatusCode, string(body))
	}
	fmt.Printf("upload         ok (%d bytes)\n", len(payload))

	size, ctype, err := r2.Stat(ctx, key)
	if err != nil {
		fail("HeadObject: %v", err)
	}
	if size != int64(len(payload)) {
		fail("tamanho no bucket é %d, esperado %d", size, len(payload))
	}
	fmt.Printf("head           ok (%d bytes, %s)\n", size, ctype)

	getURL, err := r2.DownloadURL(ctx, key, 5*time.Minute)
	if err != nil {
		fail("assinar GET: %v", err)
	}
	res, err = http.Get(getURL)
	if err != nil {
		fail("GET: %v", err)
	}
	got, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode/100 != 2 || !bytes.Equal(got, payload) {
		fail("GET devolveu %d e %q", res.StatusCode, string(got))
	}
	fmt.Println("download       ok (conteúdo confere)")

	if err := r2.Delete(ctx, key); err != nil {
		fail("delete: %v", err)
	}
	fmt.Println("delete         ok")
	fmt.Printf("\nbucket %q pronto para o Atlas.\n", cfg.R2.Bucket)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "FALHOU: "+format+"\n", args...)
	os.Exit(1)
}
