#!/usr/bin/env bun
import postgres from "postgres"

const sql = postgres("postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway", { ssl: "prefer" })

await sql.unsafe(`
  ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS created_by   TEXT        NOT NULL DEFAULT '';

  CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at
    ON notifications (scheduled_at)
    WHERE scheduled_at IS NOT NULL;
`)
console.log("✅ notifications table updated (scheduled_at, created_by)")
await sql.end()
