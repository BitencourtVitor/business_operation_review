package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env.qbsync")
	db, _ := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))

	fmt.Println("── sync state ────────────────────────────────────────────────")
	rows, err := db.Query(context.Background(),
		"SELECT company, entity, last_synced_at::text FROM qb_sync_state ORDER BY company, entity")
	if err != nil {
		fmt.Println("ERROR:", err)
		return
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var company, entity, synced string
		rows.Scan(&company, &entity, &synced)
		fmt.Printf("  %-10s  %-15s  %s\n", company, entity, synced)
		count++
	}
	fmt.Printf("\n  total rows: %d\n", count)

	fmt.Println("\n── credentials last updated ──────────────────────────────────")
	rows2, _ := db.Query(context.Background(),
		"SELECT company, token_updated_at::text FROM qb_credentials ORDER BY company")
	defer rows2.Close()
	for rows2.Next() {
		var company, updated string
		rows2.Scan(&company, &updated)
		fmt.Printf("  %-10s  %s\n", company, updated)
	}
}
