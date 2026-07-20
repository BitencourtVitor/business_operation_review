#!/usr/bin/env bun
/**
 * Corrige has_orders=false em 10 obras da Toll Brothers que já existiam no
 * forecast_core (fora das 34 lançadas em toll-brothers-missing-import.ts) e
 * que na verdade têm Order real gerada no Supply Pro — confirmado via
 * Orders > To Do (Except EPOs): tasks "Frame First Floor"/"Frame Second
 * Floor & Roof" com marcador [ON] pra cada uma delas.
 *
 * Duas delas (Broadleaf lote 7 e 12) tinham obs desatualizada dizendo
 * "Ainda não há Orders geradas para este Lot." — corrigida mantendo o resto
 * da nota (contrato/sharepoint).
 */
import postgres from "postgres"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

const IDS = [
  "17b81e81-036c-4683-994a-1d7b86597849", // Willis Brook 66
  "13b0b490-1e45-46dc-a5f5-661d282f3a8f", // Willis Brook 55
  "619e3449-6ef5-4086-8089-55dec8212e7c", // Willis Brook 14
  "4b071864-3c0b-4df6-945d-bb52cc616d92", // Willis Brook 63
  "4F544DF5",                             // Broadleaf 19
  "982533A5",                             // Broadleaf 20
  "a58ab5b2-0885-4836-a16d-059ce85ea752", // Broadleaf 9
  "c898c856-d4bd-44cb-9510-a8c39448b320", // Broadleaf 10
  "ac552865-ad0f-459f-a393-d2042bae5f1d", // Broadleaf 12
  "7869c728-c35b-4cdc-9c09-7d4e962b1c29", // Broadleaf 7
]

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })
  try {
    const flipped = await sql`
      UPDATE forecast_core
      SET has_orders = true, lastupdate_datetimez = NOW()
      WHERE id = ANY(${IDS})
    `
    console.log(`has_orders corrigido em: ${flipped.count} linhas`)

    const staleObsFixed = await sql`
      UPDATE forecast_core
      SET obs = trim(replace(obs, 'Ainda não há Orders geradas para este Lot.', 'Order já gerada (Frame First/Second Floor com [ON] no Supply Pro).')),
          lastupdate_datetimez = NOW()
      WHERE id = ANY(${IDS})
        AND obs ILIKE '%Ainda não há Orders geradas para este Lot.%'
    `
    console.log(`obs desatualizada corrigida em: ${staleObsFixed.count} linhas`)

    const check = await sql`SELECT job_site, lote_bld, has_orders, obs FROM forecast_core WHERE id = ANY(${IDS}) ORDER BY job_site, lote_bld::int`
    for (const r of check) console.log(`  ${r.job_site} lote ${r.lote_bld}  has_orders=${r.has_orders}  obs="${r.obs}"`)
  } finally {
    await sql.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
