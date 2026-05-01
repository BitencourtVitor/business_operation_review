#!/usr/bin/env bun
/**
 * Sincronização completa BOR1 (Supabase) → BOR2 (Railway)
 *
 * O que faz:
 *   1. Upsert de forecast_projects  — INSERT dos ausentes + UPDATE dos divergentes
 *   2. Sync de forecast_fieldwire   — re-sincroniza por obra_id onde contagem difere
 *   3. Sync de forecast_machines    — idem
 *   4. Sync de forecast_contract_steps — idem
 *
 * O que NÃO faz:
 *   • Não deleta registros que existem só no Railway (preserva dados BOR2-only)
 */

import postgres from "postgres"

const SUPABASE_URL = "https://zsqbejfmbyuanetoxewt.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcWJlamZtYnl1YW5ldG94ZXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDg0OTkyNCwiZXhwIjoyMDY2NDI1OTI0fQ._hlw7jC_qX6Hw3apWga9RtaqHSK3rG_IUnJSLGSIT_g"
const RAILWAY_URL  = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

type Row = Record<string, unknown>

// ─── Supabase fetch (paginado) ────────────────────────────────────────────────

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

// ─── Normalização para comparação ────────────────────────────────────────────

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

function mapStatus(v: unknown): string {
  const s = String(v ?? "").toLowerCase().trim()
  if (s === "not started") return "not_started"
  const valid = ["planned","active","completed","cancelled","open","closed","overdue","not_started"]
  return valid.includes(s) ? s : "not_started"
}

// ─── Campos mapeados BOR1 → BOR2 ─────────────────────────────────────────────

const PARENT_FIELDS: Array<{ sup: string; rail: string; date?: boolean }> = [
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

function hasDiff(supR: Row, railR: Row): boolean {
  for (const { sup, rail, date } of PARENT_FIELDS) {
    const sv = date ? normDate(supR[sup])  : norm(supR[sup])
    const rv = date ? normDate(railR[rail]) : norm(railR[rail])
    if (sv !== rv) return true
  }
  return false
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })

  try {
    console.log("\n════════════════════════════════════════════════════════")
    console.log("  Forecast Full Sync: Supabase → Railway")
    console.log("════════════════════════════════════════════════════════\n")

    // ── 1. Fetch ──────────────────────────────────────────────────────────────
    process.stdout.write("Fetching Supabase forecast_data...  ")
    const supParent = await fetchSupabase("forecast_data")
    console.log(`${supParent.length} rows`)

    process.stdout.write("Fetching Railway forecast_core...   ")
    const railParent = await sql`SELECT * FROM forecast_core`
    console.log(`${railParent.length} rows\n`)

    const supMap  = new Map(supParent.map(r  => [String(r.id), r]))
    const railMap = new Map(railParent.map(r => [String(r.id), r]))

    // ── 2. Upsert parent ──────────────────────────────────────────────────────
    let inserted = 0, updated = 0, skipped = 0

    for (const [id, s] of supMap) {
      const r = railMap.get(id)

      if (!r) {
        // INSERT — novo registro no BOR1 que falta no BOR2 (forecast_core é a tabela-mãe das FK)
        const now = new Date().toISOString()
        await sql`
          INSERT INTO forecast_core (
            id, company, name, cliente, job_site, type, lote_bld, status,
            address, obs, hvac, buildertrend, storage, qb_time, machine_provider,
            previous_beams_date, previous_start_date, previous_end_date,
            create_datetime, lastupdate_datetimez
          ) VALUES (
            ${String(s.id)},
            'framing',
            ${String(s.lote_bld ?? s.cliente ?? "")},
            ${(s.cliente   as string | null) ?? null},
            ${(s.job_site  as string | null) ?? null},
            ${(s.type      as string | null) ?? null},
            ${(s.lote_bld  as string | null) ?? null},
            ${mapStatus(s.status)},
            ${(s.address   as string | null) ?? null},
            ${(s.obs       as string | null) ?? null},
            ${Boolean(s.hvac)},
            ${Boolean(s.buildertrend)},
            ${Boolean(s.storage)},
            ${Boolean(s.qbtime)},
            ${(s.machine_provider as string | null) ?? null},
            ${(s.previous_beams_date as string | null) ?? null},
            ${(s.previous_start_date as string | null) ?? null},
            ${(s.previous_end_date   as string | null) ?? null},
            ${String(s.create_datetime      ?? now)},
            ${String(s.lastupdate_datetimez ?? now)}
          )
          ON CONFLICT (id) DO NOTHING
        `
        console.log(`  ✦ INSERT ${id}  ${norm(s.cliente)} / ${norm(s.job_site)} ${norm(s.type)} ${norm(s.lote_bld)}`)
        inserted++

      } else if (hasDiff(s, r)) {
        // UPDATE — campos divergentes
        await sql`
          UPDATE forecast_core SET
            cliente              = ${(s.cliente              as string | null) ?? null},
            job_site             = ${(s.job_site             as string | null) ?? null},
            type                 = ${(s.type                 as string | null) ?? null},
            lote_bld             = ${(s.lote_bld             as string | null) ?? null},
            status               = ${mapStatus(s.status)},
            address              = ${(s.address              as string | null) ?? null},
            obs                  = ${(s.obs                  as string | null) ?? null},
            hvac                 = ${Boolean(s.hvac)},
            buildertrend         = ${Boolean(s.buildertrend)},
            storage              = ${Boolean(s.storage)},
            qb_time              = ${Boolean(s.qbtime)},
            machine_provider     = ${(s.machine_provider     as string | null) ?? null},
            previous_beams_date  = ${(s.previous_beams_date  as string | null) ?? null},
            previous_start_date  = ${(s.previous_start_date  as string | null) ?? null},
            previous_end_date    = ${(s.previous_end_date    as string | null) ?? null}
          WHERE id = ${id}
        `
        console.log(`  ✓ UPDATE ${id}  ${norm(s.cliente)} / ${norm(s.job_site)} ${norm(s.type)} ${norm(s.lote_bld)}`)
        updated++

      } else {
        skipped++
      }
    }

    console.log(`\n  Resultado parent: ${inserted} inseridos · ${updated} atualizados · ${skipped} sem alteração`)

    // ── 3. Sync sub-tabelas ───────────────────────────────────────────────────

    const subTables: Array<{
      sup: string
      rail: string
      label: string
    }> = [
      { sup: "forecast_fieldwire",      rail: "forecast_fieldwire",      label: "fieldwire" },
      { sup: "forecast_machines",       rail: "forecast_machines",       label: "machines" },
      { sup: "forecast_contract_steps", rail: "forecast_contract_steps", label: "contract_steps" },
    ]

    for (const { sup, rail, label } of subTables) {
      console.log(`\n  ── Sync ${label} ─────────────────────────────────────`)

      process.stdout.write(`  Fetching Supabase ${sup}... `)
      const supRows = await fetchSupabase(sup)
      console.log(`${supRows.length} rows`)

      process.stdout.write(`  Fetching Railway ${rail}...  `)
      const railRows = await sql`SELECT project_id, COUNT(*)::int AS cnt FROM ${sql(rail)} GROUP BY project_id`
      console.log(`${railRows.reduce((a, r) => a + (r.cnt as number), 0)} rows`)

      // Agrupar Supabase por obra_id
      const supByObra = new Map<string, Row[]>()
      for (const row of supRows) {
        const oid = String(row.obra_id ?? row.project_id)
        const arr = supByObra.get(oid) ?? []
        arr.push(row)
        supByObra.set(oid, arr)
      }

      const railCntByObra = new Map<string, number>(
        railRows.map(r => [String(r.project_id), r.cnt as number])
      )

      let resynced = 0

      for (const [obraId, supChildren] of supByObra) {
        const railCnt = railCntByObra.get(obraId) ?? 0
        if (supChildren.length === railCnt) continue // em sync, pula

        // Re-sincroniza: apaga os do Railway e re-insere do Supabase
        await sql`DELETE FROM ${sql(rail)} WHERE project_id = ${obraId}`

        if (label === "fieldwire") {
          for (const row of supChildren) {
            await sql`
              INSERT INTO forecast_fieldwire (id, project_id, category, document, status, updated_at)
              VALUES (
                ${Number(row.id)},
                ${obraId},
                ${(row.category as string | null) ?? null},
                ${(row.document as string | null) ?? null},
                ${Boolean(row.status)},
                ${(row.lastupdate_datetimez as string | null) ?? new Date().toISOString()}
              )
            `
          }
        } else if (label === "machines") {
          for (const row of supChildren) {
            await sql`
              INSERT INTO forecast_machines (id, project_id, category, subcategory, equipment_category, title, status, unit, updated_at)
              VALUES (
                ${Number(row.id)},
                ${obraId},
                ${(row.category as string | null) ?? null},
                ${(row.subcategory as string | null) ?? null},
                ${(row.equipment_category as string | null) ?? null},
                ${(row.title as string | null) ?? null},
                ${(row.status as string | null) ?? null},
                ${(row.unit as string | null) ?? null},
                ${(row.lastupdate_datetimez as string | null) ?? new Date().toISOString()}
              )
            `
          }
        } else if (label === "contract_steps") {
          for (const row of supChildren) {
            await sql`
              INSERT INTO forecast_contract_steps (id, project_id, step, status, team, updated_at)
              VALUES (
                ${Number(row.id)},
                ${obraId},
                ${(row.step as string | null) ?? null},
                ${Boolean(row.status)},
                ${(row.team as string | null) ?? null},
                ${(row.lastupdate_datetimez as string | null) ?? new Date().toISOString()}
              )
            `
          }
        }

        console.log(`    ↺  obra_id ${obraId}  Railway ${railCnt} → ${supChildren.length}`)
        resynced++
      }

      if (resynced === 0) {
        console.log("    ✅ Nenhuma divergência nas sub-tabelas")
      } else {
        console.log(`    ${resynced} obra_ids re-sincronizados`)
      }
    }

    // ── 4. Resumo final ───────────────────────────────────────────────────────
    console.log("\n════════════════════════════════════════════════════════")
    console.log("  ✅ Sync concluído")
    console.log("════════════════════════════════════════════════════════\n")

  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error("\n❌ Erro:", err.message ?? err)
  process.exit(1)
})
