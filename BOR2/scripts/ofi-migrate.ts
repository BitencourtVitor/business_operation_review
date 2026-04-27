#!/usr/bin/env bun
/**
 * BOR1 (Supabase) → BOR2 (Railway) — OFI + Monthly Execution Migration
 * ----------------------------------------------------------------------
 * Run: bun run scripts/ofi-migrate.ts
 *
 * Tables populated:
 *   operational_forecast_index  ← operational_forecast_index  (BOR1)
 *   monthly_execution_history   ← monthly_execution_history   (BOR1)
 */

import postgres from "postgres"

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://zsqbejfmbyuanetoxewt.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcWJlamZtYnl1YW5ldG94ZXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDg0OTkyNCwiZXhwIjoyMDY2NDI1OTI0fQ._hlw7jC_qX6Hw3apWga9RtaqHSK3rG_IUnJSLGSIT_g"
const RAILWAY_URL  = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

// ─── Supabase fetch (paginated) ───────────────────────────────────────────────

async function fetchAll(table: string): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  let offset = 0

  process.stdout.write(`  Fetching ${table.padEnd(32)}`)

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`,
      {
        headers: {
          apikey:        SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer:        "count=exact",
        },
      }
    )
    if (!res.ok) throw new Error(`${table} → HTTP ${res.status}: ${await res.text()}`)

    const rows = await res.json() as Row[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }

  console.log(`${all.length} rows`)
  return all
}

// ─── Insert helpers ───────────────────────────────────────────────────────────

async function insertRows(
  sql:       postgres.Sql,
  bor2Table: string,
  rows:      Row[],
  colMap:    Record<string, string>   // { bor1_col: bor2_col }
) {
  if (!rows.length) {
    console.log(`  → ${bor2Table.padEnd(44)} 0 rows (skipped)`)
    return
  }

  const entries = Object.entries(colMap)
  const CHUNK   = 500

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk  = rows.slice(i, i + CHUNK)
    const mapped = chunk.map(row => {
      const obj: Row = {}
      for (const [bor1Col, bor2Col] of entries) {
        const v = row[bor1Col]
        obj[bor2Col] = v !== undefined ? v : null
      }
      return obj
    })

    await sql`
      INSERT INTO ${sql(bor2Table)} ${sql(mapped)}
      ON CONFLICT DO NOTHING
    `
  }

  console.log(`  → ${bor2Table.padEnd(44)} ${rows.length} rows inserted`)
}

// ─── Count verification ───────────────────────────────────────────────────────

async function verifyCount(sql: postgres.Sql, table: string): Promise<number> {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM ${sql(table)}`
  return count as number
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════")
  console.log("  BOR1 → BOR2   OFI + Monthly Execution Migration")
  console.log("════════════════════════════════════════════════════\n")

  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })

  try {
    // ── 1. Fetch from Supabase ──────────────────────────────────
    console.log("▸ Fetching data from BOR1 Supabase...")
    const [ofiRows, execRows] = await Promise.all([
      fetchAll("operational_forecast_index"),
      fetchAll("monthly_execution_history"),
    ])

    // ── 2. Truncate target tables (clean slate) ─────────────────
    console.log("\n▸ Clearing target tables in Railway...")
    await sql`TRUNCATE operational_forecast_index, monthly_execution_history RESTART IDENTITY CASCADE`
    console.log("  Tables cleared ✓\n")

    // ── 3. Insert ───────────────────────────────────────────────
    console.log("▸ Inserting data into Railway...")

    // BOR1 columns: id, obra_id, reference_month, reference_year,
    //               fieldwire_score, machines_score, contract_score,
    //               systems_score, total_score, created_at
    // BOR2 adds:    capture_date (nullable — not in BOR1, leave null)
    await insertRows(sql, "operational_forecast_index", ofiRows, {
      id:               "id",
      obra_id:          "obra_id",
      reference_month:  "reference_month",
      reference_year:   "reference_year",
      fieldwire_score:  "fieldwire_score",
      machines_score:   "machines_score",
      contract_score:   "contract_score",
      systems_score:    "systems_score",
      total_score:      "total_score",
      created_at:       "created_at",
    })

    // BOR1 columns: id, obra_id, reference_month, reference_year,
    //               actual_status, actual_start_date, actual_end_date,
    //               subcontractor, is_cycle_completed, reason, created_at
    // BOR2 adds:    planned_status (nullable — not in BOR1, leave null)
    // BOR2 lacks:   actual_start_date, actual_end_date (not in BOR2 schema — skip)
    // Normalize nulls that violate BOR2 NOT NULL constraints
    const execRowsNorm = execRows.map(r => ({
      ...r,
      reason:       r.reason       ?? "",
      actual_status: r.actual_status ?? "",
      subcontractor: r.subcontractor ?? "",
    }))

    await insertRows(sql, "monthly_execution_history", execRowsNorm, {
      id:                 "id",
      obra_id:            "obra_id",
      reference_month:    "reference_month",
      reference_year:     "reference_year",
      actual_status:      "actual_status",
      subcontractor:      "subcontractor",
      is_cycle_completed: "is_cycle_completed",
      reason:             "reason",
      created_at:         "created_at",
    })

    // ── 4. Verify counts ────────────────────────────────────────
    console.log("\n▸ Verifying row counts...\n")

    const checks = [
      { bor1: "operational_forecast_index", bor2: "operational_forecast_index", expected: ofiRows.length  },
      { bor1: "monthly_execution_history",  bor2: "monthly_execution_history",  expected: execRows.length },
    ]

    const P = (s: string, n: number) => s.padEnd(n)
    console.log(`  ${P("Table", 32)} ${P("Expected", 10)} ${P("Railway", 10)} Status`)
    console.log("  " + "─".repeat(58))

    let allOk = true
    for (const { bor1, bor2, expected } of checks) {
      const actual = await verifyCount(sql, bor2)
      const ok     = actual === expected
      if (!ok) allOk = false
      console.log(
        `  ${P(bor1, 32)} ${P(String(expected), 10)} ${P(String(actual), 10)} ` +
        (ok ? "✓" : `✗  missing ${expected - actual}`)
      )
    }

    console.log("\n" + "═".repeat(52))
    if (allOk) {
      console.log("  ✅  All counts match — migration complete!")
    } else {
      console.log("  ❌  Count mismatch — check errors above.")
      process.exit(1)
    }
    console.log("═".repeat(52) + "\n")

  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error("\n❌ Migration failed:", err.message ?? err)
  process.exit(1)
})
