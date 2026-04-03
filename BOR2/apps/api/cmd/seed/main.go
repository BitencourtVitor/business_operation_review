package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	email := "admin@bor2.com"
	password := "Admin@BOR2025"
	name := "Admin BOR2"

	if len(os.Args) >= 3 {
		email = os.Args[1]
		password = os.Args[2]
	}
	if len(os.Args) >= 4 {
		name = os.Args[3]
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Fatalf("bcrypt error: %v", err)
	}

	conn, err := pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}
	defer conn.Close(context.Background())

	_, err = conn.Exec(context.Background(), `
		INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, 'admin', NOW(), NOW())
		ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3, updated_at = NOW()
	`, email, string(hash), name)
	if err != nil {
		log.Fatalf("insert error: %v", err)
	}

	fmt.Printf("✓ User seeded: %s\n", email)
}
