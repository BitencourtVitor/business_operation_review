// atlas-r2-orphans — acha objeto no bucket que nenhuma linha do banco reivindica.
//
// A cascata do esquema apaga bem: remover uma obra leva documento, versão, folha,
// anotação, evento e mídia. O que ela nunca alcança é o R2. Toda obra apagada
// antes de existir o `atlas-jobsite-purge` deixou o set de plantas inteiro no
// bucket, sem nenhuma linha apontando para ele. É lixo que ninguém consegue
// nomear pela tela, e que continua ocupando o free tier de 10 GB que o Atlas
// divide com o PCG na mesma conta.
//
// A varredura é pelo lado do bucket, e não pelo do banco, de propósito: o que se
// procura é justamente o que o banco não conhece.
//
//	go run ./cmd/atlas-r2-orphans          # lista
//	go run ./cmd/atlas-r2-orphans --apply  # apaga
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bitencourtVitor/bor2-api/internal/config"
	"github.com/bitencourtVitor/bor2-api/internal/service"
)

func main() {
	apply := flag.Bool("apply", false, "apaga os órfãos; sem isto só lista")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fail("config: %v", err)
	}
	ctx := context.Background()

	db, err := pgxpool.New(ctx, cfg.Database.URL)
	if err != nil {
		fail("banco: %v", err)
	}
	defer db.Close()

	// As obras que existem. A chave do R2 começa por `jobsites/<id>/`, então é o
	// primeiro segmento que diz de quem o objeto é.
	vivas := map[string]string{}
	rows, err := db.Query(ctx, `SELECT id, name FROM atlas_jobsite`)
	if err != nil {
		fail("listar obras: %v", err)
	}
	for rows.Next() {
		var id, name string
		if rows.Scan(&id, &name) == nil {
			vivas[id] = name
		}
	}
	rows.Close()
	fmt.Printf("obras vivas no banco: %d\n", len(vivas))

	client, bucket := s3client(cfg)

	// Além da obra morta, existe o caso mais sutil: obra viva com objeto que
	// nenhuma linha dela reivindica, resto de versão substituída ou de upload
	// interrompido. Por isso todas as chaves conhecidas entram num conjunto.
	conhecidas := map[string]bool{}
	for _, q := range []string{
		`SELECT r2_key FROM atlas_document_version WHERE COALESCE(r2_key,'') <> ''`,
		`SELECT r2_key FROM atlas_media            WHERE COALESCE(r2_key,'') <> ''`,
		`SELECT r2_key FROM atlas_sheet            WHERE COALESCE(r2_key,'') <> ''`,
		`SELECT thumb_key FROM atlas_sheet         WHERE COALESCE(thumb_key,'') <> ''`,
	} {
		r, err := db.Query(ctx, q)
		if err != nil {
			fail("listar chaves: %v", err)
		}
		for r.Next() {
			var k string
			if r.Scan(&k) == nil {
				conhecidas[k] = true
			}
		}
		r.Close()
	}
	fmt.Printf("chaves reivindicadas pelo banco: %d\n", len(conhecidas))

	type orfao struct {
		key  string
		size int64
		obra string
	}
	orfaos := []orfao{}
	var total, totalBytes int64

	var token *string
	for {
		out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket), ContinuationToken: token,
		})
		if err != nil {
			fail("listar bucket: %v", err)
		}
		for _, o := range out.Contents {
			key := aws.ToString(o.Key)
			total++
			totalBytes += aws.ToInt64(o.Size)
			if conhecidas[key] {
				continue
			}
			// O healthcheck do atlas-r2check não é órfão: ele nasce e morre na
			// mesma execução, e só aparece aqui se a rodada foi interrompida.
			if strings.HasPrefix(key, "_healthcheck/") {
				continue
			}
			motivo := "sem linha no banco"
			if id := jobsiteDaChave(key); id != "" {
				if nome, viva := vivas[id]; viva {
					motivo = "obra viva (" + nome + "), objeto solto"
				} else {
					motivo = "obra apagada (" + id + ")"
				}
			}
			orfaos = append(orfaos, orfao{key, aws.ToInt64(o.Size), motivo})
		}
		if !aws.ToBool(out.IsTruncated) {
			break
		}
		token = out.NextContinuationToken
	}

	sort.Slice(orfaos, func(i, j int) bool { return orfaos[i].key < orfaos[j].key })

	var bytesOrfaos int64
	porMotivo := map[string]int{}
	for _, o := range orfaos {
		bytesOrfaos += o.size
		porMotivo[o.obra]++
	}

	fmt.Printf("\nobjetos no bucket: %d (%s)\n", total, mb(totalBytes))
	fmt.Printf("órfãos: %d (%s)\n\n", len(orfaos), mb(bytesOrfaos))
	for motivo, n := range porMotivo {
		fmt.Printf("  %-44s %d objetos\n", motivo, n)
	}
	if len(orfaos) > 0 {
		fmt.Println("\nprimeiras chaves:")
		for i, o := range orfaos {
			if i >= 15 {
				fmt.Printf("  ... e mais %d\n", len(orfaos)-15)
				break
			}
			fmt.Printf("  %s  (%s)\n", o.key, mb(o.size))
		}
	}

	if !*apply {
		fmt.Println("\n== DRY-RUN == nada foi apagado. Repita com --apply.")
		return
	}
	if len(orfaos) == 0 {
		return
	}

	r2 := service.NewR2Service(cfg.R2.Endpoint, cfg.R2.Bucket, cfg.R2.AccessKey, cfg.R2.SecretKey)
	falhas := 0
	for _, o := range orfaos {
		if err := r2.Delete(ctx, o.key); err != nil {
			fmt.Printf("  falhou %s: %v\n", o.key, err)
			falhas++
		}
	}
	fmt.Printf("\napagados: %d, falhas: %d, liberado: %s\n", len(orfaos)-falhas, falhas, mb(bytesOrfaos))
}

// jobsiteDaChave devolve o id da obra embutido na chave, quando ela segue a
// convenção `jobsites/<id>/...`.
func jobsiteDaChave(key string) string {
	if !strings.HasPrefix(key, "jobsites/") {
		return ""
	}
	partes := strings.Split(key, "/")
	if len(partes) < 2 {
		return ""
	}
	return partes[1]
}

func s3client(cfg *config.Config) (*s3.Client, string) {
	if cfg.R2.Endpoint == "" || cfg.R2.Bucket == "" {
		fail("R2 não configurado")
	}
	_, err := awscfg.LoadDefaultConfig(context.Background())
	_ = err
	return s3.New(s3.Options{
		Region:       "auto",
		BaseEndpoint: aws.String(cfg.R2.Endpoint),
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.R2.AccessKey, cfg.R2.SecretKey, ""),
	}), cfg.R2.Bucket
}

func mb(b int64) string {
	if b < 1024*1024 {
		return fmt.Sprintf("%.0f KB", float64(b)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(b)/1024/1024)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "atlas-r2-orphans: "+format+"\n", args...)
	os.Exit(1)
}
