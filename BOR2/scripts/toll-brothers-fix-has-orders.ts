#!/usr/bin/env bun
/**
 * Corrige has_orders/obs das 34 obras da Toll Brothers lançadas em
 * toll-brothers-missing-import.ts: as tasks "Frame First Floor" e "Frame
 * Second Floor & Roof" de todas elas têm o marcador [ON] no Supply Pro
 * (Reports > Job Schedule), ou seja, já existe Order gerada pra Framing —
 * não deviam ter entrado com has_orders=false.
 */
import postgres from "postgres"

const RAILWAY_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

const IDS = [
  "b12fa62d-253d-47f3-8d4c-dc68560f0d70", "848cfbeb-062a-40a7-b9c8-eff0b1625220",
  "29ad07e1-d3d5-42de-a7a7-554de1805f59", "177b0c9c-1be9-404a-8376-6e977c35204f",
  "fd692e6a-42c1-464a-a0db-bddf8b7a5207", "45ab4971-4262-462d-9b7e-0f70418f4d23",
  "2406110b-0784-4ce2-b499-ceb3883b1c23", "d1aad3cc-d4d1-495a-9ee2-508e00bbcaff",
  "d4d9ba9d-b813-4a7a-8043-5623c9c7a5b2", "23362827-310a-4693-a4bd-0e1bf556bcdf",
  "71615f1c-9a05-4698-8900-c9cd00a1fb1e", "f3f86fb4-e658-43e7-802d-188787b79349",
  "9919eaf9-6a4c-4a81-ba86-8da59539d0e3", "cc0e15b0-db57-474a-a75d-91c22146eec1",
  "1a614265-abff-4030-a872-a4b6871a24b3", "8b10df08-16a6-4c09-813d-fc7ffb202fdd",
  "3b11a44a-e242-4dd9-ac8d-da87292dfd26", "f6e20ca9-950c-4bb0-ac3a-47645b4b7e5d",
  "206fda12-06b7-4670-afc2-5acc88d3f03f", "6628cc5a-e6d4-4908-bb1e-5c8ecc8453bd",
  "60bc1eb3-179f-43e3-a899-eb468f6f4ea3", "025d1b83-db68-4b5c-987e-4897f781e69a",
  "6eba4d6e-2351-484d-bde6-f93ee77913ac", "b987d9bd-6ebf-4066-96cc-e8ee3a101d97",
  "91763838-fdad-4a80-990f-53973921897c", "f509ca68-dd07-4df8-8543-c1e4ae7428da",
  "a689c3b0-fa9c-4f69-8cbc-3fa23dc2762d", "af95a728-5e68-4ca7-a156-aa5e372b85fe",
  "985eefbd-7933-42d9-9c3c-31a4c99bd728", "66f22bba-65bd-4353-ba27-cdda56ef20fd",
  "f5a68859-01b3-4fd0-b704-ec646e92bd35", "dd4103bd-64c1-461f-a5b3-2752a095fafc",
  "82e20ebd-6027-41d7-ba07-fde9fde63996", "05da6392-b24e-4b95-8dd8-c5377b5efbd3",
]

async function main() {
  const sql = postgres(RAILWAY_URL, { ssl: "prefer" })
  try {
    const result = await sql`
      UPDATE forecast_core
      SET has_orders = true,
          obs = 'Dates from Orders > To Do',
          lastupdate_datetimez = NOW()
      WHERE id = ANY(${IDS})
    `
    console.log(`Atualizadas: ${result.count} linhas`)

    const check = await sql`SELECT count(*)::int FROM forecast_core WHERE id = ANY(${IDS}) AND has_orders = true`
    console.log(`Confirmado has_orders=true em: ${check[0].count}/${IDS.length}`)
  } finally {
    await sql.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
