// atlas-jobsite-purge — apaga uma obra do Atlas por inteiro, bucket incluído.
//
// A tela agora tem `DELETE /atlas/jobsites/:id`, que faz a mesma coisa e é o
// caminho normal. Este comando continua existindo para o que a tela não alcança:
// obra sem ninguém com `manage` para removê-la, limpeza depois de importação que
// deu errado, e a conferência antes de apagar, que aqui vem de graça no dry-run.
//
// A regra de quais chaves pendem de uma obra mora no `service`, e não aqui. Duas
// cópias dela seria o modo garantido de a tela apagar uma coisa e o comando
// outra.
//
//	go run ./cmd/atlas-jobsite-purge --jobsite <uuid>          # mostra o que faria
//	go run ./cmd/atlas-jobsite-purge --jobsite <uuid> --apply  # apaga
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bitencourtVitor/bor2-api/internal/config"
	"github.com/bitencourtVitor/bor2-api/internal/service"
)

func main() {
	jobsite := flag.String("jobsite", "", "id da obra")
	apply := flag.Bool("apply", false, "grava; sem isto só mostra")
	flag.Parse()

	if *jobsite == "" {
		fail("faltou --jobsite <uuid>")
	}

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

	var name, unit string
	if err := db.QueryRow(ctx,
		`SELECT name, COALESCE(unit,'') FROM atlas_jobsite WHERE id = $1`,
		*jobsite).Scan(&name, &unit); err != nil {
		fail("obra %s não encontrada: %v", *jobsite, err)
	}
	fmt.Printf("obra: %s (unit %s)\n", name, unit)

	keys, err := service.JobsiteKeys(ctx, db, *jobsite)
	if err != nil {
		fail("%v", err)
	}
	fmt.Printf("objetos no R2: %d\n", len(keys))
	for _, k := range keys {
		fmt.Printf("  %s\n", k)
	}

	for _, c := range counts(ctx, db, *jobsite) {
		fmt.Printf("linhas em %-24s %d\n", c.table, c.n)
	}

	if !*apply {
		fmt.Println("\n== DRY-RUN == nada foi apagado. Repita com --apply.")
		return
	}

	// Bucket primeiro, banco depois. Ao contrário, uma falha no meio deixaria as
	// chaves órfãs sem registro de quais eram.
	r2 := service.NewR2Service(cfg.R2.Endpoint, cfg.R2.Bucket, cfg.R2.AccessKey, cfg.R2.SecretKey)
	if !r2.Configured() && len(keys) > 0 {
		fail("R2 não configurado e há %d objetos para apagar; abortando antes de criar órfão", len(keys))
	}
	purge := service.DeleteKeys(ctx, r2, keys)
	fmt.Printf("R2: %d apagados, %d falhas\n", purge.Deleted, len(purge.Failed))
	for _, k := range purge.Failed {
		fmt.Printf("  falhou apagar %s\n", k)
	}

	tag, err := db.Exec(ctx, `DELETE FROM atlas_jobsite WHERE id = $1`, *jobsite)
	if err != nil {
		fail("apagar obra: %v", err)
	}
	fmt.Printf("banco: %d obra apagada (cascata levou o resto)\n", tag.RowsAffected())
}

type tableCount struct {
	table string
	n     int
}

func counts(ctx context.Context, db *pgxpool.Pool, jobsite string) []tableCount {
	specs := []struct{ table, query string }{
		{"atlas_document", `SELECT count(*) FROM atlas_document WHERE jobsite_id = $1`},
		{"atlas_document_version", `SELECT count(*) FROM atlas_document_version v JOIN atlas_document d ON d.id = v.document_id WHERE d.jobsite_id = $1`},
		{"atlas_sheet", `SELECT count(*) FROM atlas_sheet s JOIN atlas_document_version v ON v.id = s.version_id JOIN atlas_document d ON d.id = v.document_id WHERE d.jobsite_id = $1`},
		{"atlas_event", `SELECT count(*) FROM atlas_event WHERE jobsite_id = $1`},
		{"atlas_media", `SELECT count(*) FROM atlas_media WHERE jobsite_id = $1`},
		{"atlas_daily_log", `SELECT count(*) FROM atlas_daily_log WHERE jobsite_id = $1`},
		{"atlas_jobsite_access", `SELECT count(*) FROM atlas_jobsite_access WHERE jobsite_id = $1`},
	}
	out := []tableCount{}
	for _, s := range specs {
		var n int
		if err := db.QueryRow(ctx, s.query, jobsite).Scan(&n); err == nil {
			out = append(out, tableCount{s.table, n})
		}
	}
	return out
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "atlas-jobsite-purge: "+format+"\n", args...)
	os.Exit(1)
}
