// atlas-r2cors — publica a política de CORS do bucket do Atlas.
//
// Sem ela o navegador não busca a URL assinada, por mais válida que ela seja:
// o preflight do objeto responde 403 e o pdf.js nunca recebe os bytes, então o
// leitor mostra "Could not render this page" sobre uma planta que existe e
// baixa normalmente fora do navegador (AT-31).
//
// É provisionamento de bucket, não caminho de requisição — por isso mora num
// comando e não no R2Service, que responde só por assinar URL.
//
//	go run ./cmd/atlas-r2cors          # aplica e mostra o resultado
//	go run ./cmd/atlas-r2cors -dry-run # só mostra o que está publicado hoje
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/bitencourtVitor/bor2-api/internal/config"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "só lê a política atual, não escreve")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fail("config: %v", err)
	}
	if cfg.R2.Endpoint == "" || cfg.R2.Bucket == "" || cfg.R2.AccessKey == "" || cfg.R2.SecretKey == "" {
		fail("R2 não configurado: falta R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID ou R2_SECRET_ACCESS_KEY")
	}

	// As origens saem do mesmo ALLOWED_ORIGINS que o CORS da API usa: bucket e
	// API atendendo listas diferentes é a receita para o leitor funcionar em um
	// ambiente e falhar no outro sem ninguém entender por quê.
	origins := splitOrigins(cfg.App.AllowedOrigins)
	if len(origins) == 0 {
		fail("ALLOWED_ORIGINS vazio — sem origem para autorizar")
	}

	client := s3.New(s3.Options{
		Region:       "auto",
		BaseEndpoint: aws.String(cfg.R2.Endpoint),
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.R2.AccessKey, cfg.R2.SecretKey, "",
		),
		UsePathStyle: true,
	})
	ctx := context.Background()

	fmt.Printf("bucket %s\n", cfg.R2.Bucket)
	showCurrent(ctx, client, cfg.R2.Bucket)

	if *dryRun {
		return
	}

	rule := types.CORSRule{
		AllowedOrigins: origins,
		AllowedMethods: []string{"GET", "HEAD", "PUT"},
		// O pdf.js pede faixas de bytes para não baixar a página inteira, e o
		// upload direto manda o content-type. Sem estes cabeçalhos liberados o
		// preflight recusa mesmo com a origem certa.
		AllowedHeaders: []string{"Range", "Content-Type", "Content-Length", "Authorization"},
		// `Content-Range` e `ETag` precisam ser legíveis do outro lado, senão o
		// leitor não sabe o que recebeu.
		ExposeHeaders: []string{"Content-Range", "Content-Length", "ETag", "Accept-Ranges"},
		MaxAgeSeconds: aws.Int32(3600),
	}

	_, err = client.PutBucketCors(ctx, &s3.PutBucketCorsInput{
		Bucket:            aws.String(cfg.R2.Bucket),
		CORSConfiguration: &types.CORSConfiguration{CORSRules: []types.CORSRule{rule}},
	})
	if err != nil {
		fail("PutBucketCors: %v", err)
	}

	fmt.Println("\npolítica publicada:")
	showCurrent(ctx, client, cfg.R2.Bucket)
}

func showCurrent(ctx context.Context, client *s3.Client, bucket string) {
	out, err := client.GetBucketCors(ctx, &s3.GetBucketCorsInput{Bucket: aws.String(bucket)})
	if err != nil {
		var noSuch *types.NoSuchBucket
		if errors.As(err, &noSuch) {
			fail("bucket %s não existe", bucket)
		}
		fmt.Printf("  sem política de CORS publicada (%v)\n", err)
		return
	}
	for i, r := range out.CORSRules {
		fmt.Printf("  regra %d\n", i+1)
		fmt.Printf("    origens:   %s\n", strings.Join(r.AllowedOrigins, ", "))
		fmt.Printf("    métodos:   %s\n", strings.Join(r.AllowedMethods, ", "))
		fmt.Printf("    cabeçalhos: %s\n", strings.Join(r.AllowedHeaders, ", "))
		fmt.Printf("    expostos:  %s\n", strings.Join(r.ExposeHeaders, ", "))
	}
}

func splitOrigins(raw string) []string {
	var out []string
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			out = append(out, o)
		}
	}
	return out
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "erro: "+format+"\n", args...)
	os.Exit(1)
}
