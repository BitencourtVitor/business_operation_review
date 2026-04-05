#!/usr/bin/env bun
/**
 * BOR1 (Supabase) → BOR2 (Railway) — Forecast Migration
 * -------------------------------------------------------
 * Run: bun run scripts/forecast-migrate.ts
 *
 * Tables created / populated:
 *   forecast_core                      ← forecast_data           (BOR1)
 *   forecast_fieldwire                 ← forecast_fieldwire      (BOR1)
 *   forecast_machines                  ← forecast_machines       (BOR1)
 *   forecast_contract_steps            ← forecast_contract_steps (BOR1)
 *   catalog_forecast_fieldwire         ← C_fieldwire             (BOR1)
 *   catalog_forecast_machines          ← C_machines              (BOR1)
 *   catalog_forecast_machine_providers ← C_machine_provider      (BOR1)
 *   catalog_forecast_contract_steps    ← C_contract_steps        (BOR1)
 *   catalog_forecast_workforce         ← C_workforce             (BOR1)
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

  process.stdout.write(`  Fetching ${table.padEnd(28)}`)

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

// ─── DDL ──────────────────────────────────────────────────────────────────────

async function createTables(sql: postgres.Sql) {
  // Drop in reverse FK order so constraints don't block
  await sql.unsafe(`
    DROP TABLE IF EXISTS forecast_contract_steps CASCADE;
    DROP TABLE IF EXISTS forecast_machines        CASCADE;
    DROP TABLE IF EXISTS forecast_fieldwire       CASCADE;
    DROP TABLE IF EXISTS forecast_core            CASCADE;
    DROP TABLE IF EXISTS catalog_forecast_fieldwire          CASCADE;
    DROP TABLE IF EXISTS catalog_forecast_machines           CASCADE;
    DROP TABLE IF EXISTS catalog_forecast_machine_providers  CASCADE;
    DROP TABLE IF EXISTS catalog_forecast_contract_steps     CASCADE;
    DROP TABLE IF EXISTS catalog_forecast_workforce          CASCADE;
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS forecast_core (
      id                   TEXT        PRIMARY KEY,
      -- BOR2 extra columns (nullable, populated on manual create/edit)
      name                 TEXT,
      company              TEXT        DEFAULT 'framing',
      contract_value       FLOAT8      DEFAULT 0,
      team                 TEXT        DEFAULT '',
      -- BOR1 original columns
      cliente              TEXT,
      job_site             TEXT,
      type                 TEXT,
      lote_bld             TEXT,
      status               TEXT,
      address              TEXT,
      previous_beams_date  DATE,
      previous_start_date  DATE,
      previous_end_date    DATE,
      obs                  TEXT,
      hvac                 BOOLEAN     DEFAULT FALSE,
      buildertrend         BOOLEAN     DEFAULT FALSE,
      storage              BOOLEAN     DEFAULT FALSE,
      qb_time              BOOLEAN     DEFAULT FALSE,
      machine_provider     TEXT,
      create_datetime      TIMESTAMPTZ,
      lastupdate_datetimez TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS forecast_fieldwire (
      id          BIGINT      PRIMARY KEY,
      project_id  TEXT        REFERENCES forecast_core(id) ON DELETE CASCADE,
      category    TEXT,
      document    TEXT,
      status      BOOLEAN     DEFAULT FALSE,
      updated_at  TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS forecast_machines (
      id                 BIGINT      PRIMARY KEY,
      project_id         TEXT        REFERENCES forecast_core(id) ON DELETE CASCADE,
      category           TEXT,
      subcategory        TEXT,
      equipment_category TEXT,
      title              TEXT,
      unit               TEXT,
      status             TEXT,
      updated_at         TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS forecast_contract_steps (
      id          BIGINT      PRIMARY KEY,
      project_id  TEXT        REFERENCES forecast_core(id) ON DELETE CASCADE,
      team        TEXT,
      step        TEXT,
      status      BOOLEAN     DEFAULT FALSE,
      updated_at  TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS catalog_forecast_fieldwire (
      id             BIGINT      PRIMARY KEY,
      category       TEXT,
      document       TEXT,
      where_location TEXT,
      notes          TEXT,
      created_at     TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS catalog_forecast_machines (
      id                 BIGINT      PRIMARY KEY,
      category           TEXT,
      subcategory        TEXT,
      equipment_category TEXT,
      title              TEXT,
      created_at         TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS catalog_forecast_machine_providers (
      id         BIGINT      PRIMARY KEY,
      name       TEXT,
      created_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS catalog_forecast_contract_steps (
      id         BIGINT      PRIMARY KEY,
      step       TEXT,
      created_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS catalog_forecast_workforce (
      id         BIGINT      PRIMARY KEY,
      name       TEXT,
      created_at TIMESTAMPTZ
    );
  `)
}

// ─── Insert helpers ───────────────────────────────────────────────────────────

/** Insert rows in chunks, mapping BOR1 columns → BOR2 columns */
async function insertRows(
  sql:       postgres.Sql,
  bor2Table: string,
  rows:      Row[],
  colMap:    Record<string, string>  // { bor1_col: bor2_col }
) {
  if (!rows.length) { console.log(`  → ${bor2Table.padEnd(40)} 0 rows (skipped)`); return }

  const entries = Object.entries(colMap)
  const CHUNK   = 500

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk  = rows.slice(i, i + CHUNK)
    // Build array of objects keyed by BOR2 column names
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

  console.log(`  → ${bor2Table.padEnd(40)} ${rows.length} rows inserted`)
}

// ─── Count verification ───────────────────────────────────────────────────────

async function verifyCount(sql: postgres.Sql, table: string): Promise<number> {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM ${sql(table)}`
  return count as number
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════")
  console.log("  BOR1 → BOR2   Forecast Migration")
  console.log("════════════════════════════════════════════════════\n")

  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })

  try {
    // ── 1. Create tables ────────────────────────────────────────
    console.log("▸ Creating tables in Railway...")
    await createTables(sql)
    console.log("  Tables ready ✓\n")

    // ── 2. Fetch from Supabase ──────────────────────────────────
    console.log("▸ Fetching data from BOR1 Supabase...")
    const [
      coreRows,
      fieldwireRows,
      machineRows,
      contractRows,
      catFieldwireRows,
      catMachineRows,
      catProviderRows,
      catContractRows,
      catWorkforceRows,
    ] = await Promise.all([
      fetchAll("forecast_data"),
      fetchAll("forecast_fieldwire"),
      fetchAll("forecast_machines"),
      fetchAll("forecast_contract_steps"),
      fetchAll("C_fieldwire"),
      fetchAll("C_machines"),
      fetchAll("C_machine_provider"),
      fetchAll("C_contract_steps"),
      fetchAll("C_workforce"),
    ])

    // ── 3. Insert (parent first, then children, then catalogs) ──
    console.log("\n▸ Inserting data into Railway...")

    await insertRows(sql, "forecast_core", coreRows, {
      id:                   "id",
      cliente:              "cliente",
      job_site:             "job_site",
      type:                 "type",
      lote_bld:             "lote_bld",
      status:               "status",
      address:              "address",
      previous_beams_date:  "previous_beams_date",
      previous_start_date:  "previous_start_date",
      previous_end_date:    "previous_end_date",
      obs:                  "obs",
      hvac:                 "hvac",
      buildertrend:         "buildertrend",
      storage:              "storage",
      qbtime:               "qb_time",
      machine_provider:     "machine_provider",
      create_datetime:      "create_datetime",
      lastupdate_datetimez: "lastupdate_datetimez",
    })

    await insertRows(sql, "forecast_fieldwire", fieldwireRows, {
      id:                   "id",
      obra_id:              "project_id",
      category:             "category",
      document:             "document",
      status:               "status",
      lastupdate_datetimez: "updated_at",
    })

    await insertRows(sql, "forecast_machines", machineRows, {
      id:                   "id",
      obra_id:              "project_id",
      category:             "category",
      subcategory:          "subcategory",
      equipment_category:   "equipment_category",
      title:                "title",
      unit:                 "unit",
      status:               "status",
      lastupdate_datetimez: "updated_at",
    })

    await insertRows(sql, "forecast_contract_steps", contractRows, {
      id:                   "id",
      obra_id:              "project_id",
      team:                 "team",
      step:                 "step",
      status:               "status",
      lastupdate_datetimez: "updated_at",
    })

    await insertRows(sql, "catalog_forecast_fieldwire", catFieldwireRows, {
      id: "id", category: "category", document: "document",
      where_location: "where_location", notes: "notes", created_at: "created_at",
    })

    await insertRows(sql, "catalog_forecast_machines", catMachineRows, {
      id: "id", category: "category", subcategory: "subcategory",
      equipment_category: "equipment_category", title: "title", created_at: "created_at",
    })

    await insertRows(sql, "catalog_forecast_machine_providers", catProviderRows, {
      id: "id", name: "name", created_at: "created_at",
    })

    await insertRows(sql, "catalog_forecast_contract_steps", catContractRows, {
      id: "id", step: "step", created_at: "created_at",
    })

    await insertRows(sql, "catalog_forecast_workforce", catWorkforceRows, {
      id: "id", name: "name", created_at: "created_at",
    })

    // ── 4. Verify counts ────────────────────────────────────────
    console.log("\n▸ Verifying row counts...\n")

    const checks = [
      { bor1: "forecast_data",           bor2: "forecast_core",                       expected: coreRows.length          },
      { bor1: "forecast_fieldwire",      bor2: "forecast_fieldwire",                  expected: fieldwireRows.length     },
      { bor1: "forecast_machines",       bor2: "forecast_machines",                   expected: machineRows.length       },
      { bor1: "forecast_contract_steps", bor2: "forecast_contract_steps",             expected: contractRows.length      },
      { bor1: "C_fieldwire",             bor2: "catalog_forecast_fieldwire",          expected: catFieldwireRows.length  },
      { bor1: "C_machines",              bor2: "catalog_forecast_machines",           expected: catMachineRows.length    },
      { bor1: "C_machine_provider",      bor2: "catalog_forecast_machine_providers",  expected: catProviderRows.length   },
      { bor1: "C_contract_steps",        bor2: "catalog_forecast_contract_steps",     expected: catContractRows.length   },
      { bor1: "C_workforce",             bor2: "catalog_forecast_workforce",          expected: catWorkforceRows.length  },
    ]

    const P = (s: string, n: number) => s.padEnd(n)
    console.log(`  ${P("BOR1 table", 28)} ${P("Expected", 10)} ${P("Railway", 10)} Status`)
    console.log("  " + "─".repeat(62))

    let allOk = true
    for (const { bor1, bor2, expected } of checks) {
      const actual = await verifyCount(sql, bor2)
      const ok     = actual === expected
      if (!ok) allOk = false
      console.log(
        `  ${P(bor1, 28)} ${P(String(expected), 10)} ${P(String(actual), 10)} ` +
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
