# syntax=docker/dockerfile:1
# Build context is apps/web/ — fully self-contained (no monorepo deps needed)

# ── Dependency stage ──────────────────────────────────────────────────────────
# Cache mount keeps the bun package store across builds.
# The layer itself is invalidated only when package.json changes.
FROM oven/bun:1.3.11-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

# ── Build stage ───────────────────────────────────────────────────────────────
# Next.js cache mount preserves incremental build artifacts (compiled pages,
# webpack chunks) so only changed files are rebuilt on each deploy.
FROM oven/bun:1.3.11-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1.3.11-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["bun", "server.js"]
