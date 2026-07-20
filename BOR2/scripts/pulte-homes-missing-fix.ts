#!/usr/bin/env bun
/**
 * Corrige os 5 casos que ficaram sem match automatico no
 * pulte-homes-schedule-sync.ts:
 *  - Bates Quarry Clubhouse (lote 888) ja existia, so nao bateu no matching
 *    por endereco (sem numero na rua) -- so precisa do end date.
 *  - 10 Tiger Terrace (Bates Quarry lote 27), 31/35 Emerald Run (Emerald Run
 *    lotes 18/20) e 33 Emerald Run (Emerald Run AFU lote 19) sao obras
 *    novas de verdade -- confirmado pelo Vitor via padrao de numeracao dos
 *    lotes vizinhos. Criadas com a mesma logica de
 *    PostgresForecastRepository.Create (mesma usada em
 *    toll-brothers-missing-import.ts).
 */
import postgres from "postgres"
import { randomUUID } from "crypto"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

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

const CLIENTE = "Pulte Homes"
const COMPANY = "framing"
const TYPE = "Lot"

const NEW_ROWS = [
  {
    job_site: "Bates Quarry at Walpole, MA",
    lote_bld: "27",
    address: "10 Tiger Terrace Walpole, MA 02081",
    beams: "2026-08-21",
    start: "2026-08-24",
    end: "2026-09-24",
  },
  {
    job_site: "Emerald Run at Shrewsbury, MA",
    lote_bld: "18",
    address: "31 Emerald Run Shrewsbury, MA 01545",
    beams: "2026-09-08",
    start: "2026-09-09",
    end: "2026-10-14",
  },
  {
    job_site: "Emerald Run at Shrewsbury, MA",
    lote_bld: "20",
    address: "35 Emerald Run Shrewsbury, MA 01545",
    beams: "2026-09-08",
    start: "2026-09-09",
    end: "2026-10-08",
  },
  {
    job_site: "Emerald Run (AFU) at Shrewsbury, MA",
    lote_bld: "19",
    address: "33 Emerald Run Shrewsbury, MA 01545",
    beams: "2026-09-04",
    start: "2026-09-09",
    end: "2026-10-06",
  },
]

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })
  try {
    console.log("Atualizando Bates Quarry Clubhouse (lote 888)...")
    await sql`
      UPDATE forecast_core
      SET previous_end_date = '2026-08-05', lastupdate_datetimez = NOW()
      WHERE id = 'd3948353'
    `
    console.log("  ✓ end date atualizada para 2026-08-05\n")

    console.log(`Criando ${NEW_ROWS.length} obras novas...\n`)
    for (const row of NEW_ROWS) {
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
           ${row.beams}, ${row.start}, ${row.end},
           ${0}, ${""}, ${false},
           ${CLIENTE}, ${row.job_site}, ${TYPE}, ${row.lote_bld}, ${row.address}, ${""},
           ${false}, ${false}, ${false}, ${false}, ${""},
           ${now}, ${now})
      `

      await seedFieldwireDocs(sql, id, CLIENTE, TYPE)
      await seedMachines(sql, id, CLIENTE, TYPE)

      console.log(`  ✓ criado ${id}  ${row.job_site} lote ${row.lote_bld}  (${row.address})`)
    }
  } finally {
    await sql.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
