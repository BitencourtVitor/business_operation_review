# syntax=docker/dockerfile:1.7

# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy dependency manifests first so this layer is cached until go.mod/go.sum
# change — modules are not re-downloaded on every code change.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# The three binaries are built in one invocation so the packages they share are
# compiled once instead of three times. The cache mounts carry the module cache
# and the compiled-package cache across builds, so a deploy that touches a
# handful of files recompiles those files instead of the whole dependency tree.
#
#   api               — the HTTP API
#   qbtime-sync-cron  — daily Period Reports sync + workforce_productivity import
#   ofi-cron          — end-of-month OFI / Monthly Execution close+plan
#
# The cron binaries live here (rather than in their own Railway builds) because
# Railpack auto-detection would run ./api on those services and crash.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /out/ \
      ./cmd/api ./cmd/qbtime-sync-cron ./cmd/ofi-cron

# ── Final image ───────────────────────────────────────────────────────────────
FROM alpine:3.21

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

COPY --from=builder /out/api .
COPY --from=builder /out/qbtime-sync-cron .
COPY --from=builder /out/ofi-cron .

EXPOSE 8080

# This image bakes in three binaries (api, qbtime-sync-cron, ofi-cron) and is
# reused by three Railway services. A Dockerfile build ignores each service's
# start-command override, so the process to run is selected at runtime from the
# START_BIN env var (a persisted per-service variable). Unset ⇒ the HTTP API.
# This is deliberate: relying on Railway's start-command override silently booted
# ./api on the cron services, which panic for lack of DATABASE_URL.
ENTRYPOINT ["/bin/sh", "-c", "exec ./${START_BIN:-api}"]
