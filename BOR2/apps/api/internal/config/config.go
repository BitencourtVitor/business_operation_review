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
}

type AIConfig struct {
	OpenRouterKey   string
	Model           string
	ClassifierModel string
}

type AppConfig struct {
	Port           string
	Env            string
	AllowedOrigins string
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
			Port:           getEnv("API_PORT", "8080"),
			Env:            getEnv("APP_ENV", "development"),
			AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
		},
		Database: DatabaseConfig{
			URL: requireEnv("DATABASE_URL"),
		},
		Auth: AuthConfig{
			Secret: requireEnv("BETTER_AUTH_SECRET"),
			URL:    getEnv("BETTER_AUTH_URL", "http://localhost:8080"),
		},
		AI: AIConfig{
			OpenRouterKey:   getEnv("OPENROUTER_API_KEY", ""),
			Model:           getEnv("AI_MODEL", "google/gemini-2.0-flash-001"),
			ClassifierModel: getEnv("AI_CLASSIFIER_MODEL", "google/gemini-2.0-flash-lite-001"),
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
