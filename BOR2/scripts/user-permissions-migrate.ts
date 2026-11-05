#!/usr/bin/env bun
import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!, { ssl: "prefer" })

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id     TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    permissions JSONB       NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`)
console.log("✅ user_permissions table created/verified")
await sql.end()
