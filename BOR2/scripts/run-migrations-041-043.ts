#!/usr/bin/env bun
/**
 * Runs migrations 000041, 000042, 000043 on Railway PostgreSQL.
 * Run: bun run scripts/run-migrations-041-043.ts
 */

import postgres from "postgres"
import { readFileSync } from "fs"
import { join } from "path"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

const sql = postgres(RAILWAY_URL, { max: 1 })

const migrationsDir = join(import.meta.dir, "../apps/api/db/migrations")

const files = [
  "000041_create_schedule_events.up.sql",
  "000042_create_schedule_trade_ownership.up.sql",
  "000043_add_actuals_to_schedule_row_meta.up.sql",
]

for (const file of files) {
  const content = readFileSync(join(migrationsDir, file), "utf-8")
  console.log(`\n▶ Running ${file}...`)
  try {
    await sql.unsafe(content)
    console.log(`  ✓ Done`)
  } catch (err: any) {
    // Already exists errors are acceptable (idempotent)
    if (err.message?.includes("already exists")) {
      console.log(`  ⚠ Already exists — skipped`)
    } else {
      console.error(`  ✗ Error: ${err.message}`)
      process.exit(1)
    }
  }
}

await sql.end()
console.log("\n✅ All migrations applied successfully.")
