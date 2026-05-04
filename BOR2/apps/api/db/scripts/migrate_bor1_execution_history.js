/**
 * migrate_bor1_execution_history.js
 *
 * Copia do BOR1 (Supabase) para o BOR2 (Railway) os registros históricos de:
 *   - operational_forecast_index   (OFI scores capturados por mês)
 *   - monthly_execution_history    (status real de execução por mês)
 *
 * Escopo: todos os registros com reference_year < 2026
 *         OU (reference_year = 2026 AND reference_month < 4)
 *         → i.e., tudo antes do ciclo de abril/2026, que pertence ao BOR2.
 *
 * Uso:
 *   node migrate_bor1_execution_history.js [--dry-run]
 *
 * Dependências: módulo 'pg' disponível em BOR2/apps/web/node_modules/pg
 */

const { Client } = require("C:/Users/Ryzen/Documents/trae_projects/Premium - BOR/BOR2/apps/web/node_modules/pg")

// ─── Credenciais ──────────────────────────────────────────────────────────────

const BOR1_URL = "https://zsqbejfmbyuanetoxewt.supabase.co"
const BOR1_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcWJlamZtYnl1YW5ldG94ZXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDg0OTkyNCwiZXhwIjoyMDY2NDI1OTI0fQ._hlw7jC_qX6Hw3apWga9RtaqHSK3rG_IUnJSLGSIT_g"
const BOR2_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

const DRY_RUN = process.argv.includes("--dry-run")

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function bor1Fetch(table, params = {}) {
  const qs = new URLSearchParams({ ...params, limit: "2000" }).toString()
  const res = await fetch(`${BOR1_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: BOR1_KEY, Authorization: `Bearer ${BOR1_KEY}` },
  })
  if (!res.ok) throw new Error(`BOR1 ${table}: ${await res.text()}`)
  return res.json()
}

// BOR1 stores raw status like "open"/"closed"/"Not Started"
// BOR2 normalizes to "started"/"completed"/"not_started"
function mapActualStatus(raw) {
  if (!raw) return "not_started"
  const s = raw.toLowerCase().trim()
  if (s === "closed")                          return "completed"
  if (s === "open" || s === "started")         return "started"
  return "not_started"
}

function isHistorical(year, month) {
  return year < 2026 || (year === 2026 && month < 4)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — nenhuma escrita será feita\n" : "🚀 Iniciando migração BOR1 → BOR2\n")

  const pg = new Client({ connectionString: BOR2_URL })
  await pg.connect()

  try {
    // ── 1. operational_forecast_index ────────────────────────────────────────

    console.log("Buscando operational_forecast_index do BOR1...")
    const ofiRows = await bor1Fetch("operational_forecast_index", {
      select: "obra_id,reference_month,reference_year,capture_date,fieldwire_score,machines_score,contract_score,systems_score,total_score,created_at",
    })

    const ofiHistorical = ofiRows.filter(r =>
      isHistorical(Number(r.reference_year), Number(r.reference_month))
    )
    console.log(`  BOR1 total: ${ofiRows.length}  |  históricos (< abr/2026): ${ofiHistorical.length}`)

    if (!DRY_RUN && ofiHistorical.length > 0) {
      // Limpa registros históricos no BOR2 antes de inserir
      await pg.query(`
        DELETE FROM operational_forecast_index
        WHERE (reference_year < 2026)
           OR (reference_year = 2026 AND reference_month < 4)
      `)
      console.log("  BOR2: registros históricos de OFI removidos")

      let inserted = 0
      for (const r of ofiHistorical) {
        const captureDate = r.capture_date ?? (r.created_at ? r.created_at.split("T")[0] : null)
        await pg.query(`
          INSERT INTO operational_forecast_index
            (obra_id, reference_month, reference_year, capture_date,
             fieldwire_score, machines_score, contract_score, systems_score, total_score)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [
          r.obra_id,
          r.reference_month,
          r.reference_year,
          captureDate,
          r.fieldwire_score ?? 0,
          r.machines_score  ?? 0,
          r.contract_score  ?? 0,
          r.systems_score   ?? 0,
          r.total_score     ?? 0,
        ])
        inserted++
      }
      console.log(`  ✅ OFI inseridos: ${inserted}`)
    }

    // ── 2. monthly_execution_history ─────────────────────────────────────────

    console.log("\nBuscando monthly_execution_history do BOR1...")
    const histRows = await bor1Fetch("monthly_execution_history", {
      select: "obra_id,reference_month,reference_year,actual_status,actual_start_date,actual_end_date,subcontractor,is_cycle_completed,reason",
    })

    const histHistorical = histRows.filter(r =>
      isHistorical(Number(r.reference_year), Number(r.reference_month))
    )
    console.log(`  BOR1 total: ${histRows.length}  |  históricos (< abr/2026): ${histHistorical.length}`)

    if (!DRY_RUN && histHistorical.length > 0) {
      await pg.query(`
        DELETE FROM monthly_execution_history
        WHERE (reference_year < 2026)
           OR (reference_year = 2026 AND reference_month < 4)
      `)
      console.log("  BOR2: registros históricos de execution removidos")

      let inserted = 0
      for (const r of histHistorical) {
        const actualStatus  = mapActualStatus(r.actual_status)
        const plannedStatus = r.actual_status ?? ""   // preserva o status cru como planned_status
        const isCompleted   = actualStatus === "completed"

        await pg.query(`
          INSERT INTO monthly_execution_history
            (obra_id, reference_month, reference_year,
             planned_status, actual_status, reason, subcontractor,
             is_cycle_completed, actual_start_date, actual_end_date)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          r.obra_id,
          r.reference_month,
          r.reference_year,
          plannedStatus,
          actualStatus,
          r.reason        ?? "",
          r.subcontractor ?? "",
          r.is_cycle_completed ?? isCompleted,
          r.actual_start_date  ?? null,
          r.actual_end_date    ?? null,
        ])
        inserted++
      }
      console.log(`  ✅ Execution history inseridos: ${inserted}`)
    }

    console.log("\n✅ Migração concluída.")
  } finally {
    await pg.end()
  }
}

main().catch(err => {
  console.error("❌ Erro:", err.message)
  process.exit(1)
})
