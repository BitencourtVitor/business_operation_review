# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy dependency manifests first so this layer is cached until go.mod/go.sum
# change — modules are not re-downloaded on every code change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o api ./cmd/api/main.go
# The qbtime-sync-cron binary backs the daily Period Reports sync AND the daily
# workforce_productivity import (Railway Cron Job service). Built here so the
# cron service can run it via a Dockerfile build instead of Railpack
# auto-detection, which would run ./api and crash.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o qbtime-sync-cron ./cmd/qbtime-sync-cron
# The ofi-cron binary backs the end-of-month OFI/Monthly Execution close+plan
# (Railway Cron Job service). Same reason as qbtime-sync-cron above — it was
# missing from this build stage since it was written, so it never actually ran.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o ofi-cron ./cmd/ofi-cron

# ── Final image ───────────────────────────────────────────────────────────────
FROM alpine:3.21

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

COPY --from=builder /app/api .
COPY --from=builder /app/qbtime-sync-cron .
COPY --from=builder /app/ofi-cron .

EXPOSE 8080

# This image bakes in three binaries (api, qbtime-sync-cron, ofi-cron) and is
# reused by three Railway services. A Dockerfile build ignores each service's
# start-command override, so the process to run is selected at runtime from the
# START_BIN env var (a persisted per-service variable). Unset ⇒ the HTTP API.
# This is deliberate: relying on Railway's start-command override silently booted
# ./api on the cron services, which panic for lack of DATABASE_URL.
ENTRYPOINT ["/bin/sh", "-c", "exec ./${START_BIN:-api}"]
