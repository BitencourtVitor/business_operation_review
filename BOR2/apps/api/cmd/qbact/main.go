package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env")
	ctx := context.Background()
	db, _ := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	defer db.Close()

	fmt.Println("── sync_state (idade desde updated_at) ──")
	rows, _ := db.Query(ctx, `
		SELECT company, entity,
		       to_char(updated_at,'HH24:MI:SS') u,
		       round(extract(epoch from (now()-updated_at)))||'s atras' age
		FROM qb_sync_state
		WHERE entity IN ('Purchase','Bill','Invoice')
		ORDER BY updated_at DESC LIMIT 12`)
	for rows.Next() {
		var c, e, u, a string
		rows.Scan(&c, &e, &u, &a)
		fmt.Printf("  %-8s %-10s updated=%s (%s)\n", c, e, u, a)
	}
	rows.Close()

	fmt.Println("\n── backends escrevendo em qb_* agora ──")
	ar, _ := db.Query(ctx, `
		SELECT pid, state, left(regexp_replace(query,'\s+',' ','g'),70)
		FROM pg_stat_activity
		WHERE state='active' AND pid<>pg_backend_pid()
		  AND query ~* '(insert|update|delete).*qb_'`)
	n := 0
	for ar.Next() {
		var pid int
		var st, q string
		ar.Scan(&pid, &st, &q)
		fmt.Printf("  pid=%d %s  %s\n", pid, st, q)
		n++
	}
	ar.Close()
	if n == 0 {
		fmt.Println("  (nenhuma escrita ativa em qb_* neste instante)")
	}
}
