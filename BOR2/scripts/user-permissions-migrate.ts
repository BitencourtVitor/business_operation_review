#!/usr/bin/env bun
import postgres from "postgres"

const sql = postgres("postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway", { ssl: "prefer" })

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id     TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    permissions JSONB       NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`)
console.log("✅ user_permissions table created/verified")
await sql.end()
