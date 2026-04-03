package logger

import (
	"log/slog"
	"os"
)

var Default *slog.Logger

func Init(env string) {
	var handler slog.Handler

	if env == "production" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		})
	}

	Default = slog.New(handler)
	slog.SetDefault(Default)
}

func Info(msg string, args ...any) {
	Default.Info(msg, args...)
}

func Error(msg string, args ...any) {
	Default.Error(msg, args...)
}

func Debug(msg string, args ...any) {
	Default.Debug(msg, args...)
}

func Warn(msg string, args ...any) {
	Default.Warn(msg, args...)
}
