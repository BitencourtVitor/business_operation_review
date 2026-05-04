#!/usr/bin/env bun
/**
 * BOR2 — Notifications Table Migration
 * Run: bun run scripts/notifications-migrate.ts
 */

import postgres from "postgres"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

async function main() {
  console.log("\n════════════════════════════════════════")
  console.log("  BOR2 — Notifications Migration")
  console.log("════════════════════════════════════════\n")

  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          BIGSERIAL    PRIMARY KEY,
        title       TEXT         NOT NULL,
        content     TEXT         NOT NULL,
        recipients  JSONB        NOT NULL DEFAULT '[]',
        viewed_by   JSONB        NOT NULL DEFAULT '[]',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_recipients
        ON notifications USING GIN (recipients);

      CREATE INDEX IF NOT EXISTS idx_notifications_created_at
        ON notifications (created_at DESC);
    `)

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM notifications`
    console.log(`  ✅  Table 'notifications' ready — ${count} existing rows`)
    console.log("\n" + "═".repeat(40) + "\n")
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error("\n❌ Migration failed:", err.message ?? err)
  process.exit(1)
})
