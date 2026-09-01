#!/usr/bin/env bun
/**
 * atlas-split-plans — recorta uma versão já no bucket em um PDF por página.
 *
 * O mesmo que a ingestão faz no navegador, para versão que entrou antes de o
 * recorte existir. Lê o original do R2, corta com pdf-lib, sobe cada página na
 * chave do plano e grava `r2_key`/`byte_size` na folha correspondente.
 *
 *   bun scripts/atlas-split-plans.ts <versionId>
 */

import { S3Client } from "bun"
import { readFileSync } from "node:fs"
import { PDFDocument } from "pdf-lib"
import postgres from "postgres"

const DB_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

function env(key: string): string {
  const line = readFileSync("../api/.env", "utf8").split(/\r?\n/).find(l => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} ausente`)
  return line.slice(key.length + 1).replace(/^"|"$/g, "").trim()
}

const s3 = new S3Client({
  endpoint: env("R2_ENDPOINT"),
  bucket: env("R2_BUCKET_NAME"),
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  region: "auto",
})

const sql = postgres(DB_URL, { ssl: "prefer" })
const versionId = process.argv[2]

const rows = await sql`
  SELECT v.id, v.r2_key, d.jobsite_id
  FROM atlas_document_version v
  JOIN atlas_document d ON d.id = v.document_id
  WHERE (${versionId ?? null}::text IS NULL OR v.id = ${versionId ?? null})
    AND EXISTS (SELECT 1 FROM atlas_sheet s WHERE s.version_id = v.id AND s.r2_key = '')`
  .then(r => r as { id: string; r2_key: string; jobsite_id: string }[])

if (!rows.length) {
  console.log("nada a recortar")
  await sql.end()
  process.exit(0)
}

for (const version of rows) {
  console.log(`versão ${version.id}`)
  const original = await s3.file(version.r2_key).arrayBuffer()
  console.log(`  original: ${(original.byteLength / 1024 / 1024).toFixed(1)} MB`)

  const source = await PDFDocument.load(new Uint8Array(original))
  const pages = source.getPageCount()
  let total = 0

  for (let i = 0; i < pages; i++) {
    const out = await PDFDocument.create()
    const [page] = await out.copyPages(source, [i])
    out.addPage(page)
    const bytes = await out.save({ useObjectStreams: true })
    const key = `jobsites/${version.jobsite_id}/versions/${version.id}/plans/${String(i).padStart(4, "0")}.pdf`

    await s3.write(key, bytes, { type: "application/pdf" })
    const { width, height } = page.getSize()
    await sql`
      UPDATE atlas_sheet
      SET r2_key = ${key}, byte_size = ${bytes.length},
          width_pt = ${width.toFixed(2)}, height_pt = ${height.toFixed(2)}
      WHERE version_id = ${version.id} AND page_index = ${i}`
    total += bytes.length
    if ((i + 1) % 10 === 0 || i === pages - 1) console.log(`  ${i + 1}/${pages}`)
  }
  console.log(`  planos: ${(total / 1024 / 1024).toFixed(1)} MB (${(total / original.byteLength).toFixed(2)}x)`)
}

await sql.end()
