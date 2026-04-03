package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	conn, err := pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}
	defer conn.Close(context.Background())

	// Get current version from golang-migrate's schema_migrations
	var currentVersion int64
	err = conn.QueryRow(context.Background(), "SELECT version FROM schema_migrations LIMIT 1").Scan(&currentVersion)
	if err != nil {
		log.Printf("no existing migrations found, starting from 0")
		currentVersion = 0
	}
	fmt.Printf("Current migration version: %d\n\n", currentVersion)

	// Find migration files
	migrationsDir := "db/migrations"
	files, err := filepath.Glob(filepath.Join(migrationsDir, "*.up.sql"))
	if err != nil {
		log.Fatalf("glob error: %v", err)
	}
	sort.Strings(files)

	applied := 0
	for _, f := range files {
		baseName := strings.TrimSuffix(filepath.Base(f), ".up.sql")
		parts := strings.SplitN(baseName, "_", 2)
		versionNum, _ := strconv.ParseInt(strings.TrimLeft(parts[0], "0"), 10, 64)
		if parts[0] == "000000" {
			versionNum = 0
		}

		if versionNum <= currentVersion {
			fmt.Printf("  skip %s (v%d <= current v%d)\n", baseName, versionNum, currentVersion)
			continue
		}

		sql, err := os.ReadFile(f)
		if err != nil {
			log.Fatalf("read %s error: %v", f, err)
		}

		_, err = conn.Exec(context.Background(), string(sql))
		if err != nil {
			log.Fatalf("✗ %s failed: %v", baseName, err)
		}

		// Update to new version (golang-migrate stores only latest)
		_, err = conn.Exec(context.Background(),
			"UPDATE schema_migrations SET version = $1, dirty = false", versionNum)
		if err != nil {
			log.Fatalf("update version error: %v", err)
		}

		fmt.Printf("  ✓ %s (v%d)\n", baseName, versionNum)
		applied++
	}

	if applied == 0 {
		fmt.Println("\n✓ No new migrations to apply")
	} else {
		fmt.Printf("\n✓ Applied %d migrations\n", applied)
	}
}
