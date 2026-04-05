# syntax=docker/dockerfile:1
# Build context must be the monorepo root (BOR2/)

FROM oven/bun:1.3.11-alpine AS deps
WORKDIR /app
# Copy workspace manifests — cache bun install when these don't change
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.11-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
WORKDIR /app/apps/web
RUN bun run build

FROM oven/bun:1.3.11-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["bun", "server.js"]
