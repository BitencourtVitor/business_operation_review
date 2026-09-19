// r2size — quanto o bucket do Atlas ocupa hoje, por prefixo.
//
// Lista o bucket inteiro e soma. Existe porque a conta da Cloudflare cobra por
// volume guardado, e o free tier de 10 GB é compartilhado com o que o PCG já
// usa: saber o tamanho é o que separa "cabe" de "vai começar a custar".
//
//	go run ./cmd/r2size
package main

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/joho/godotenv"

	"github.com/bitencourtVitor/bor2-api/internal/config"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	client := s3.New(s3.Options{
		Region:       "auto",
		BaseEndpoint: aws.String(cfg.R2.Endpoint),
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.R2.AccessKey, cfg.R2.SecretKey, ""),
		UsePathStyle: true,
	})

	ctx := context.Background()
	var total int64
	var objetos int
	porTipo := map[string]int64{}
	contaTipo := map[string]int{}
	porObra := map[string]int64{}

	var token *string
	for {
		out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(cfg.R2.Bucket),
			ContinuationToken: token,
		})
		if err != nil {
			log.Fatalf("listar: %v", err)
		}
		for _, o := range out.Contents {
			tamanho := aws.ToInt64(o.Size)
			total += tamanho
			objetos++
			chave := aws.ToString(o.Key)
			partes := strings.Split(chave, "/")
			tipo := partes[0]
			porTipo[tipo] += tamanho
			contaTipo[tipo]++
			if len(partes) > 1 {
				porObra[partes[0]+"/"+partes[1]] += tamanho
			}
		}
		if !aws.ToBool(out.IsTruncated) {
			break
		}
		token = out.NextContinuationToken
	}

	mb := func(b int64) string { return fmt.Sprintf("%.2f MB", float64(b)/1048576) }
	fmt.Printf("bucket %s: %d objetos, %s (%.3f GB)\n\n",
		cfg.R2.Bucket, objetos, mb(total), float64(total)/1073741824)

	tipos := make([]string, 0, len(porTipo))
	for t := range porTipo {
		tipos = append(tipos, t)
	}
	sort.Slice(tipos, func(i, j int) bool { return porTipo[tipos[i]] > porTipo[tipos[j]] })
	obras := make([]string, 0, len(porObra))
	for o := range porObra {
		obras = append(obras, o)
	}
	sort.Slice(obras, func(i, j int) bool { return porObra[obras[i]] > porObra[obras[j]] })
	fmt.Println("maiores obras:")
	for i, o := range obras {
		if i == 8 {
			break
		}
		fmt.Printf("  %-45s %s\n", o, mb(porObra[o]))
	}
	fmt.Printf("obras no bucket: %d\n\n", len(obras))
	fmt.Println("por prefixo:")
	for _, t := range tipos {
		fmt.Printf("  %-28s %8d objetos  %s\n", t, contaTipo[t], mb(porTipo[t]))
	}
}
