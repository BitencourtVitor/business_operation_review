# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy dependency manifests first so this layer is cached until go.mod/go.sum
# change — modules are not re-downloaded on every code change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o api ./cmd/api/main.go
# The qbtime-sync-cron binary backs the daily Period Reports sync (Railway Cron
# Job service). Built here so the cron service can run it via a Dockerfile build
# instead of Railpack auto-detection, which would run ./api and crash.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o qbtime-sync-cron ./cmd/qbtime-sync-cron

# ── Final image ───────────────────────────────────────────────────────────────
FROM alpine:3.21

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

COPY --from=builder /app/api .
COPY --from=builder /app/qbtime-sync-cron .

EXPOSE 8080

CMD ["./api"]
