#!/usr/bin/env bun
/**
 * Sincroniza registros divergentes do Supabase → Railway.
 * Não toca registros que já estão corretos.
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
  return String(v).trim()
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
    console.log("  Forecast Sync: Supabase → Railway (divergentes)")
    console.log("════════════════════════════════════════════════════\n")

    process.stdout.write("Fetching Supabase... ")
    const supRows = await fetchSupabase("forecast_data")
    console.log(`${supRows.length} rows`)

    process.stdout.write("Fetching Railway...  ")
    const railRows = await sql`SELECT * FROM forecast_core`
    console.log(`${railRows.length} rows\n`)

    const supMap  = new Map(supRows.map(r  => [String(r.id), r]))
    const railMap = new Map(railRows.map(r => [String(r.id), r]))

    const FIELDS: Array<{ sup: string; rail: string; date?: boolean }> = [
      { sup: "cliente",             rail: "cliente" },
      { sup: "job_site",            rail: "job_site" },
      { sup: "type",                rail: "type" },
      { sup: "lote_bld",            rail: "lote_bld" },
      { sup: "status",              rail: "status" },
      { sup: "address",             rail: "address" },
      { sup: "obs",                 rail: "obs" },
      { sup: "hvac",                rail: "hvac" },
      { sup: "buildertrend",        rail: "buildertrend" },
      { sup: "storage",             rail: "storage" },
      { sup: "qbtime",              rail: "qb_time" },
      { sup: "machine_provider",    rail: "machine_provider" },
      { sup: "previous_beams_date", rail: "previous_beams_date", date: true },
      { sup: "previous_start_date", rail: "previous_start_date", date: true },
      { sup: "previous_end_date",   rail: "previous_end_date",   date: true },
    ]

    // Identifica registros com divergências
    const toSync: string[] = []
    for (const [id, supR] of supMap) {
      const railR = railMap.get(id)
      if (!railR) continue
      let hasDiff = false
      for (const { sup, rail, date } of FIELDS) {
        const sv = date ? normDate(supR[sup])  : norm(supR[sup])
        const rv = date ? normDate(railR[rail]) : norm(railR[rail])
        if (sv !== rv) { hasDiff = true; break }
      }
      if (hasDiff) toSync.push(id)
    }

    console.log(`▸ ${toSync.length} registros a sincronizar\n`)

    let updated = 0
    for (const id of toSync) {
      const s = supMap.get(id)!
      const r = railMap.get(id)!

      await sql`
        UPDATE forecast_core SET
          cliente              = ${s.cliente              ?? r.cliente              ?? null},
          job_site             = ${s.job_site             ?? r.job_site             ?? null},
          type                 = ${s.type                 ?? r.type                 ?? null},
          lote_bld             = ${s.lote_bld             ?? r.lote_bld             ?? null},
          status               = ${s.status               ?? r.status               ?? null},
          address              = ${s.address              ?? r.address              ?? null},
          obs                  = ${s.obs                  ?? r.obs                  ?? null},
          hvac                 = ${s.hvac                 ?? r.hvac                 ?? false},
          buildertrend         = ${s.buildertrend         ?? r.buildertrend         ?? false},
          storage              = ${s.storage              ?? r.storage              ?? false},
          qb_time              = ${s.qbtime               ?? r.qb_time              ?? false},
          machine_provider     = ${s.machine_provider     ?? r.machine_provider     ?? null},
          previous_beams_date  = ${s.previous_beams_date  ?? r.previous_beams_date  ?? null},
          previous_start_date  = ${s.previous_start_date  ?? r.previous_start_date  ?? null},
          previous_end_date    = ${s.previous_end_date    ?? r.previous_end_date    ?? null}
        WHERE id = ${id}
      `

      console.log(`  ✓ ${id}  ${norm(s.cliente)} / ${norm(s.job_site)} ${norm(s.type)} ${norm(s.lote_bld)}`)
      updated++
    }

    console.log(`\n▸ ${updated} registros atualizados`)
    console.log("\n▸ Verificando resultado final...")

    // Re-verifica
    const railFinal = await sql`SELECT * FROM forecast_core`
    const finalMap  = new Map(railFinal.map(r => [String(r.id), r]))
    let remaining = 0
    for (const [id, supR] of supMap) {
      const railR = finalMap.get(id)
      if (!railR) continue
      for (const { sup, rail, date } of FIELDS) {
        const sv = date ? normDate(supR[sup])  : norm(supR[sup])
        const rv = date ? normDate(railR[rail]) : norm(railR[rail])
        if (sv !== rv) { remaining++; break }
      }
    }

    if (remaining === 0) {
      console.log("  ✅ Nenhuma divergência restante — Railway 100% sincronizado!")
    } else {
      console.log(`  ⚠️  ${remaining} registros ainda divergentes`)
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
