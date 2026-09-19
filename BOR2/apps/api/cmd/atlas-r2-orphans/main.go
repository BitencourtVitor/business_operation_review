// atlas-r2-orphans — acha objeto no bucket que nenhuma linha do banco reivindica.
//
// A cascata do esquema apaga bem: remover uma obra leva documento, versão, folha,
// anotação, evento e mídia. O que ela nunca alcança é o R2. Toda obra apagada
// antes de existir o `atlas-jobsite-purge` deixou o set de plantas inteiro no
// bucket, sem nenhuma linha apontando para ele. É lixo que ninguém consegue
// nomear pela tela, e que continua ocupando o free tier de 10 GB que o Atlas
// divide com o PCG na mesma conta.
//
// A regra de quais chaves o banco reivindica mora no `service`, e é a mesma que
// a varredura mensal do agendador usa: duas cópias dela seria o jeito garantido
// de a automática apagar o que a manual preserva.
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

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/bitencourtVitor/bor2-api/internal/config"
	"github.com/bitencourtVitor/bor2-api/internal/service"
)

func main() {
	apply := flag.Bool("apply", false, "apaga os órfãos; sem isto só lista")
	flag.Parse()

	_ = godotenv.Load()
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

	r2 := service.NewR2Service(cfg.R2.Endpoint, cfg.R2.Bucket, cfg.R2.AccessKey, cfg.R2.SecretKey)
	if !r2.Configured() {
		fail("R2 não configurado neste ambiente")
	}

	res, err := service.VarrerOrfaos(ctx, db, r2, cfg.R2.Bucket, *apply)
	if err != nil {
		fail("varrer: %v", err)
	}

	fmt.Printf("objetos no bucket: %d (%s)\n", res.Objetos, mb(res.Bytes))
	fmt.Printf("órfãos: %d (%s)\n\n", len(res.Orfaos), mb(res.BytesOrfaos))

	porMotivo := map[string]int{}
	porPasta := map[string]int{}
	bytesPasta := map[string]int64{}
	for _, o := range res.Orfaos {
		porMotivo[o.Motivo]++
		partes := strings.Split(o.Key, "/")
		pasta := o.Key
		if len(partes) > 4 {
			pasta = strings.Join(partes[:4], "/")
		}
		porPasta[pasta]++
		bytesPasta[pasta] += o.Size
	}
	for motivo, n := range porMotivo {
		fmt.Printf("  %-44s %d objetos\n", motivo, n)
	}

	if len(res.Orfaos) > 0 {
		// O resumo por pasta vem antes das chaves: antes de apagar, o que se
		// quer saber é o que some, e 109 caminhos completos não respondem isso.
		pastas := make([]string, 0, len(porPasta))
		for p := range porPasta {
			pastas = append(pastas, p)
		}
		sort.Slice(pastas, func(i, j int) bool { return bytesPasta[pastas[i]] > bytesPasta[pastas[j]] })
		fmt.Println("\npor pasta:")
		for _, p := range pastas {
			fmt.Printf("  %-70s %4d objetos  %s\n", p, porPasta[p], mb(bytesPasta[p]))
		}
	}

	if !*apply {
		fmt.Println("\n== DRY-RUN == nada foi apagado. Repita com --apply.")
		return
	}
	fmt.Printf("\napagados: %d, falhas: %d, liberado: %s\n",
		res.Apagados, res.Falhas, mb(res.BytesLiberad))
}

func mb(b int64) string {
	switch {
	case b > 1048576:
		return fmt.Sprintf("%.1f MB", float64(b)/1048576)
	case b > 1024:
		return fmt.Sprintf("%.0f KB", float64(b)/1024)
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func fail(formato string, args ...any) {
	fmt.Fprintf(os.Stderr, formato+"\n", args...)
	os.Exit(1)
}
