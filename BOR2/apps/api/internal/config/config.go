package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	App      AppConfig
	Database DatabaseConfig
	Auth     AuthConfig
	AI       AIConfig
	R2       R2Config
}

// R2Config é o bucket do Atlas. Opcional de propósito: a API precisa subir num
// ambiente que ainda não provisionou o storage, e o que falta nesse caso é o
// Atlas, não o serviço inteiro.
type R2Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
}

type AIConfig struct {
	OpenRouterKey string
	SQLModel      string // agentic SQL loop (writes/refines queries) — e.g. google/gemini-2.5-flash
	AnalystModel  string // final analytical answer — e.g. anthropic/claude-sonnet-4.5
	ReadOnlyDBURL string // DSN for the read-only aria_ro role (falls back to main DB if empty)
}

type AppConfig struct {
	Port                        string
	Env                         string
	AllowedOrigins              string
	CronSecret                  string
	AutoAccountingServiceSecret string
}

type DatabaseConfig struct {
	URL string
}

type AuthConfig struct {
	Secret string
	URL    string
}

func Load() (*Config, error) {
	// Load .env only in development
	if os.Getenv("APP_ENV") != "production" {
		_ = godotenv.Load()
	}

	cfg := &Config{
		App: AppConfig{
			Port:                        getEnv("API_PORT", "8080"),
			Env:                         getEnv("APP_ENV", "development"),
			AllowedOrigins:              getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
			CronSecret:                  getEnv("CRON_SECRET", ""),
			AutoAccountingServiceSecret: getEnv("AUTOACCOUNTING_SERVICE_SECRET", ""),
		},
		Database: DatabaseConfig{
			URL: requireEnv("DATABASE_URL"),
		},
		Auth: AuthConfig{
			Secret: requireEnv("BETTER_AUTH_SECRET"),
			URL:    getEnv("BETTER_AUTH_URL", "http://localhost:8080"),
		},
		AI: AIConfig{
			OpenRouterKey: getEnv("OPENROUTER_API_KEY", ""),
			SQLModel:      getEnv("AI_SQL_MODEL", "google/gemini-2.5-flash"),
			AnalystModel:  getEnv("AI_ANALYST_MODEL", "anthropic/claude-sonnet-4.5"),
			ReadOnlyDBURL: getEnv("ARIA_READONLY_DATABASE_URL", ""),
		},
		R2: R2Config{
			Endpoint:  getEnv("R2_ENDPOINT", ""),
			Bucket:    getEnv("R2_BUCKET_NAME", ""),
			AccessKey: getEnv("R2_ACCESS_KEY_ID", ""),
			SecretKey: getEnv("R2_SECRET_ACCESS_KEY", ""),
		},
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}
