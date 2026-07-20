#!/usr/bin/env bun
/**
 * Atualiza previous_beams_date/previous_start_date/previous_end_date no
 * forecast_core pra obras da Pulte Homes, usando o schedule mais atual
 * exportado em "Premium - Data Att Forecast/Pulte Homes/Schedules New
 * England Market PREMIUM FRAMING INC (15).xls" (na verdade HTML, mesmo
 * truque de export do Toll Brothers Supply Pro).
 *
 * Mapeamento de datas por job (Community + Job Number):
 *  - Beams  = task "Beams/ Basement Walls/Sills" (Scheduled Start)
 *  - Start  = task "Framing 1 - Sills/Kneewall 1" (Scheduled Start)
 *  - End    = ultima task de categoria "Rough Carpentry" (Estimated Completion)
 * Match contra forecast_core por endereco normalizado (numero + rua),
 * excluindo qualquer job cujo endereco bata com MAIS de um lado (1:N ou
 * N:1) -- isso pega o caso do "71 East Point Drive" (edificio de 34
 * unidades no xls, 1 unica linha no forecast_core) e evita sobrescrever
 * errado.
 */
import postgres from "postgres"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

type Diff = {
  id: string
  job_site: string
  lote_bld: string
  address: string
  obs: string
  changes: Record<string, [string | null, string]>
}

const DIFFS: Diff[] = JSON.parse(
  await Bun.file(
    String.raw`C:\Users\Ryzen\AppData\Local\Temp\claude\C--Users-Ryzen-Documents-trae-projects-Premium---BOR\5ab2eb20-2238-4bcd-aec1-476c8d6d2688\scratchpad\pulte_diffs.json`
  ).text()
)

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })
  try {
    console.log(`Atualizando ${DIFFS.length} obras da Pulte Homes com datas divergentes...\n`)
    let updated = 0
    for (const d of DIFFS) {
      const sets: Record<string, string> = {}
      if (d.changes.beams) sets.previous_beams_date = d.changes.beams[1]
      if (d.changes.start) sets.previous_start_date = d.changes.start[1]
      if (d.changes.end) sets.previous_end_date = d.changes.end[1]

      await sql`
        UPDATE forecast_core
        SET previous_beams_date = COALESCE(${sets.previous_beams_date ?? null}, previous_beams_date),
            previous_start_date = COALESCE(${sets.previous_start_date ?? null}, previous_start_date),
            previous_end_date = COALESCE(${sets.previous_end_date ?? null}, previous_end_date),
            lastupdate_datetimez = NOW()
        WHERE id = ${d.id}
      `
      console.log(`  ✓ ${d.job_site} lote ${d.lote_bld}  ${JSON.stringify(d.changes)}`)
      updated++
    }
    console.log(`\n${updated} obras atualizadas.`)
  } finally {
    await sql.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
