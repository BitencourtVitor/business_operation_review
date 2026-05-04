# Build context is apps/web/ — fully self-contained (no monorepo deps needed)

# ── Dependency stage ──────────────────────────────────────────────────────────
# node:alpine is always cached on Railway builders; bun install layer is
# reused on every code-only change (invalidated only when package.json changes)
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g bun@1.3.11
COPY package.json ./
RUN bun install

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g bun@1.3.11
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN bun run build

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g bun@1.3.11
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["bun", "server.js"]
