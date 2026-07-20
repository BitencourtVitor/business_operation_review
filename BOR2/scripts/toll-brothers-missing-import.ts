#!/usr/bin/env bun
/**
 * Lança as obras da Toll Brothers identificadas como ausentes no forecast_core
 * (raw do Supply Pro tem 172 obras, forecast tinha 85; destas 87 faltantes, 34
 * têm RS em 2026 e pertencem a comunidades ainda ativas — ver backlog RF-8).
 *
 * Replica exatamente o que o backend Go faz em PostgresForecastRepository.Create:
 * insere em forecast_core com os 5 flags de integração sempre false (nunca
 * herdados de lote vizinho) e re-executa o seed de forecast_fieldwire /
 * forecast_machines a partir dos catalogs (mesma query do Go).
 *
 * forecast_contract_steps NÃO é seedado aqui: no app isso é uma ação manual
 * separada (escolher qual subcontratado/team assume o lote), e essa escolha
 * de negócio não estava disponível nos dados de origem.
 */
import postgres from "postgres"
import { randomUUID } from "crypto"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

type Row = {
  job_site: string
  lote_bld: string
  address: string
  beams_date: string
  start_date: string
  end_date: string
}

const ROWS: Row[] = JSON.parse(
  await Bun.file(
    String.raw`C:\Users\Ryzen\AppData\Local\Temp\claude\C--Users-Ryzen-Documents-trae-projects-Premium---BOR\5ab2eb20-2238-4bcd-aec1-476c8d6d2688\scratchpad\toll_insert_final.json`
  ).text()
)

function toISODate(mdY: string): string {
  const [m, d, y] = mdY.split("/").map(Number)
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

async function seedFieldwireDocs(sql: postgres.Sql, projectID: string, cliente: string, projType: string) {
  await sql`
    WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_fieldwire)
    INSERT INTO forecast_fieldwire (id, project_id, category, document, status)
    SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY c.document),
           ${projectID},
           CASE WHEN c.client = '' THEN '' ELSE c.client || ' – ' || c.type END,
           c.document,
           false
    FROM catalog_forecast_fieldwire c, max_id
    WHERE ((LOWER(c.client) = LOWER(${cliente}) AND LOWER(c.type) = LOWER(${projType}))
        OR (LOWER(c.client) = LOWER(${cliente}) AND c.type = '')
        OR (c.client = '' AND c.type = ''))
      AND NOT EXISTS (
        SELECT 1 FROM forecast_fieldwire fw
        WHERE LOWER(fw.project_id) = LOWER(${projectID}) AND fw.document = c.document
      )
  `
}

async function seedMachines(sql: postgres.Sql, projectID: string, cliente: string, projType: string) {
  await sql`
    WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_machines)
    INSERT INTO forecast_machines (id, project_id, category, subcategory, equipment_category, title, unit, status)
    SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY c.id),
           ${projectID},
           c.category,
           c.subcategory,
           c.equipment_category,
           c.title,
           '',
           NULL
    FROM catalog_forecast_machines c, max_id
    WHERE LOWER(c.category)    = LOWER(${cliente})
      AND LOWER(c.subcategory) = LOWER(${projType})
      AND NOT EXISTS (
        SELECT 1 FROM forecast_machines m
        WHERE LOWER(m.project_id) = LOWER(${projectID})
          AND m.category = c.category AND m.subcategory = c.subcategory AND m.title = c.title
      )
  `
}

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })
  const CLIENTE = "Toll Brothers"
  const COMPANY = "framing"
  const TYPE = "Lot"

  try {
    console.log(`Lançando ${ROWS.length} obras da Toll Brothers no forecast_core...\n`)

    let created = 0
    for (const row of ROWS) {
      const existing = await sql`
        SELECT id FROM forecast_core
        WHERE LOWER(cliente) = LOWER(${CLIENTE})
          AND LOWER(job_site) = LOWER(${row.job_site})
          AND lote_bld = ${row.lote_bld}
      `
      if (existing.length > 0) {
        console.log(`  ⏭  já existe: ${row.job_site} lote ${row.lote_bld} (${existing[0].id}) — pulado`)
        continue
      }

      const id = randomUUID()
      const now = new Date()

      await sql`
        INSERT INTO forecast_core
          (id, name, company, status,
           previous_beams_date, previous_start_date, previous_end_date,
           contract_value, team, qb_time,
           cliente, job_site, type, lote_bld, address, obs,
           hvac, buildertrend, storage, has_orders, machine_provider,
           create_datetime, lastupdate_datetimez)
        VALUES
          (${id}, ${""}, ${COMPANY}, ${"not started"},
           ${toISODate(row.beams_date)}, ${toISODate(row.start_date)}, ${toISODate(row.end_date)},
           ${0}, ${""}, ${false},
           ${CLIENTE}, ${row.job_site}, ${TYPE}, ${row.lote_bld}, ${row.address}, ${""},
           ${false}, ${false}, ${false}, ${false}, ${""},
           ${now}, ${now})
      `

      await seedFieldwireDocs(sql, id, CLIENTE, TYPE)
      await seedMachines(sql, id, CLIENTE, TYPE)

      console.log(`  ✓ criado ${id}  ${row.job_site} lote ${row.lote_bld}  (${row.address})`)
      created++
    }

    console.log(`\n${created} obras criadas, ${ROWS.length - created} já existiam.`)
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error("\n❌ Erro:", err.message ?? err)
  process.exit(1)
})
