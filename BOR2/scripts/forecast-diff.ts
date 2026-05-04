#!/usr/bin/env bun
/**
 * Compara forecast_data (Supabase/BOR1) vs forecast_core (Railway/BOR2)
 * Identifica IDs faltando e campos divergentes.
 */

import postgres from "postgres"

const SUPABASE_URL = "https://zsqbejfmbyuanetoxewt.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcWJlamZtYnl1YW5ldG94ZXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDg0OTkyNCwiZXhwIjoyMDY2NDI1OTI0fQ._hlw7jC_qX6Hw3apWga9RtaqHSK3rG_IUnJSLGSIT_g"
const RAILWAY_URL  = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

type Row = Record<string, unknown>

async function fetchSupabase(table: string): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  let offset = 0
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    if (!res.ok) throw new Error(`${table} HTTP ${res.status}: ${await res.text()}`)
    const rows = await res.json() as Row[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "string") return v.trim()
  return String(v)
}

function normDate(v: unknown): string {
  if (!v) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })

  try {
    console.log("\n════════════════════════════════════════════════════")
    console.log("  Forecast Gap Analysis: Supabase ↔ Railway")
    console.log("════════════════════════════════════════════════════\n")

    // ── Fetch both sides ──────────────────────────────────────────
    process.stdout.write("Fetching Supabase forecast_data... ")
    const supRows = await fetchSupabase("forecast_data")
    console.log(`${supRows.length} rows`)

    process.stdout.write("Fetching Railway forecast_core...  ")
    const railRows = await sql`SELECT * FROM forecast_core`
    console.log(`${railRows.length} rows\n`)

    const supMap  = new Map(supRows.map(r  => [String(r.id),  r]))
    const railMap = new Map(railRows.map(r => [String(r.id),  r]))

    // ── 1. IDs em Supabase mas não no Railway ─────────────────────
    const missingInRail = supRows.filter(r => !railMap.has(String(r.id)))
    console.log(`▸ Registros no Supabase mas AUSENTES no Railway: ${missingInRail.length}`)
    if (missingInRail.length > 0) {
      for (const r of missingInRail) {
        console.log(`  ✗ ${r.id}  ${norm(r.cliente)} / ${norm(r.job_site)} / ${norm(r.type)} ${norm(r.lote_bld)}`)
      }
    }

    // ── 2. IDs no Railway mas não no Supabase ─────────────────────
    const extraInRail = railRows.filter(r => !supMap.has(String(r.id)))
    console.log(`\n▸ Registros no Railway mas AUSENTES no Supabase: ${extraInRail.length}`)
    if (extraInRail.length > 0) {
      for (const r of extraInRail) {
        console.log(`  + ${r.id}  ${norm(r.cliente)} / ${norm(r.job_site)} / ${norm(r.type)} ${norm(r.lote_bld)}`)
      }
    }

    // ── 3. Campos divergentes nos registros em comum ──────────────
    const FIELDS: Array<{ sup: string; rail: string; label: string; date?: boolean }> = [
      { sup: "cliente",              rail: "cliente",              label: "cliente" },
      { sup: "job_site",             rail: "job_site",             label: "job_site" },
      { sup: "type",                 rail: "type",                 label: "type" },
      { sup: "lote_bld",             rail: "lote_bld",             label: "lote_bld" },
      { sup: "status",               rail: "status",               label: "status" },
      { sup: "address",              rail: "address",              label: "address" },
      { sup: "obs",                  rail: "obs",                  label: "obs" },
      { sup: "hvac",                 rail: "hvac",                 label: "hvac" },
      { sup: "buildertrend",         rail: "buildertrend",         label: "buildertrend" },
      { sup: "storage",              rail: "storage",              label: "storage" },
      { sup: "qbtime",               rail: "qb_time",              label: "qb_time" },
      { sup: "machine_provider",     rail: "machine_provider",     label: "machine_provider" },
      { sup: "previous_beams_date",  rail: "previous_beams_date",  label: "beams_date",  date: true },
      { sup: "previous_start_date",  rail: "previous_start_date",  label: "start_date",  date: true },
      { sup: "previous_end_date",    rail: "previous_end_date",    label: "end_date",    date: true },
    ]

    const diffs: Array<{ id: string; cliente: string; jobSite: string; field: string; sup: string; rail: string }> = []

    for (const [id, supR] of supMap) {
      const railR = railMap.get(id)
      if (!railR) continue

      for (const { sup, rail, label, date } of FIELDS) {
        const sv = date ? normDate(supR[sup])  : norm(supR[sup])
        const rv = date ? normDate(railR[rail]) : norm(railR[rail])
        if (sv !== rv) {
          diffs.push({ id, cliente: norm(supR.cliente), jobSite: norm(supR.job_site), field: label, sup: sv || "(vazio)", rail: rv || "(vazio)" })
        }
      }
    }

    console.log(`\n▸ Campos divergentes em registros em comum: ${diffs.length}`)
    if (diffs.length > 0) {
      let lastId = ""
      for (const d of diffs) {
        if (d.id !== lastId) {
          console.log(`\n  [${d.id}] ${d.cliente} / ${d.jobSite}`)
          lastId = d.id
        }
        console.log(`    ${d.field.padEnd(18)} Supabase: "${d.sup}"  →  Railway: "${d.rail}"`)
      }
    }

    // ── 4. Sub-tabelas: contagem ──────────────────────────────────
    console.log("\n▸ Contagem sub-tabelas:")

    const subTables = [
      { sup: "forecast_fieldwire",      rail: "forecast_fieldwire" },
      { sup: "forecast_machines",       rail: "forecast_machines" },
      { sup: "forecast_contract_steps", rail: "forecast_contract_steps" },
    ]

    for (const { sup, rail } of subTables) {
      process.stdout.write(`  ${sup.padEnd(28)}`)
      const supSub  = await fetchSupabase(sup)
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM ${sql(rail)}`
      const ok = supSub.length === count
      console.log(`Supabase: ${String(supSub.length).padEnd(6)} Railway: ${String(count).padEnd(6)} ${ok ? "✓" : `✗ faltam ${supSub.length - (count as number)}`}`)
    }

    console.log("\n════════════════════════════════════════════════════\n")

  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error("\n❌ Erro:", err.message ?? err)
  process.exit(1)
})
