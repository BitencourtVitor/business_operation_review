#!/usr/bin/env bun
/**
 * atlas-import — coloca um PDF dentro do Atlas sem passar pela API.
 *
 * Existe porque o Atlas ainda não está em produção: o arquivo precisa entrar
 * agora, e o caminho normal (URL assinada emitida pela API) só existe depois do
 * deploy. Aqui o script faz o mesmo que os endpoints fariam, na mesma ordem e
 * com a mesma convenção de chave — sobe para o R2, grava a versão como
 * publicada e cria uma folha por página.
 *
 * A leitura do carimbo (número, disciplina, revisão da folha) continua fora:
 * isso é o AT-12 e depende do padrão de corte que ainda vai ser discutido.
 *
 *   bun scripts/atlas-import.ts "<caminho do pdf>" --jobsite "East Point" \
 *       --document "Building 2 — Permit Set" --revision 2
 */

import { S3Client } from "bun"
import { readFileSync } from "node:fs"
import postgres from "postgres"

const DB_URL = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

function env(file: string, key: string): string {
  const line = readFileSync(file, "utf8").split(/\r?\n/).find(l => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} não está em ${file}`)
  return line.slice(key.length + 1).replace(/^"|"$/g, "").trim()
}

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function safeName(name: string): string {
  return name.split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9.\-_]/g, "-").replace(/^[-.]+|[-.]+$/g, "")
}

const path = process.argv[2]
if (!path) {
  console.error("uso: bun scripts/atlas-import.ts <pdf> --jobsite <nome> --document <nome> --revision <rev>")
  process.exit(1)
}

const envFile = "../api/.env"
const s3 = new S3Client({
  endpoint: env(envFile, "R2_ENDPOINT"),
  bucket: env(envFile, "R2_BUCKET_NAME"),
  accessKeyId: env(envFile, "R2_ACCESS_KEY_ID"),
  secretAccessKey: env(envFile, "R2_SECRET_ACCESS_KEY"),
  region: "auto",
})

const file = Bun.file(path)
const bytes = await file.arrayBuffer()
console.log(`arquivo: ${path} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`)

// Estrutura lida do próprio PDF: quantas páginas e o tamanho da prancha.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
// Cópia para o pdf.js: ele transfere o buffer para o worker e o original fica
// detached — o upload depois receberia zero byte.
const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), useSystemFonts: true }).promise
const first = await pdf.getPage(1)
const viewport = first.getViewport({ scale: 1 })
console.log(`páginas: ${pdf.numPages} · folha: ${viewport.width.toFixed(0)}×${viewport.height.toFixed(0)} pt`)

const sql = postgres(DB_URL, { ssl: "prefer" })

const [owner] = await sql`
  SELECT id, name FROM users WHERE role = 'dev' ORDER BY created_at LIMIT 1`
if (!owner) throw new Error("nenhum usuário dev para assinar a importação")

const jobsiteName = arg("jobsite", "East Point")
const documentName = arg("document", safeName(path).replace(/\.pdf$/i, ""))
const revision = arg("revision", "1")

const [jobsite] = await sql`
  SELECT id FROM atlas_jobsite WHERE lower(name) = lower(${jobsiteName}) LIMIT 1`
const jobsiteId = jobsite?.id ?? crypto.randomUUID()
if (!jobsite) {
  await sql`
    INSERT INTO atlas_jobsite (id, name, created_by)
    VALUES (${jobsiteId}, ${jobsiteName}, ${owner.id})`
  console.log(`obra criada: ${jobsiteName}`)
} else {
  console.log(`obra existente: ${jobsiteName}`)
}

const documentId = crypto.randomUUID()
await sql`
  INSERT INTO atlas_document (id, jobsite_id, name, discipline, kind, created_by)
  VALUES (${documentId}, ${jobsiteId}, ${documentName}, 'Architectural', 'drawing', ${owner.id})`

const versionId = crypto.randomUUID()
const key = `jobsites/${jobsiteId}/documents/${documentId}/versions/${versionId}/${safeName(path)}`

console.log("subindo para o R2…")
await s3.write(key, new Uint8Array(bytes), { type: "application/pdf" })
const stat = await s3.stat(key)
if (stat.size !== bytes.byteLength) {
  throw new Error(`tamanho no bucket (${stat.size}) diferente do arquivo (${bytes.byteLength})`)
}
console.log(`no bucket: ${key} (${stat.size} bytes)`)

await sql`
  INSERT INTO atlas_document_version
    (id, document_id, revision, r2_key, byte_size, page_count, content_type,
     status, uploaded_by, published_at)
  VALUES (${versionId}, ${documentId}, ${revision}, ${key}, ${bytes.byteLength},
          ${pdf.numPages}, 'application/pdf', 'published', ${owner.id}, now())`

// Uma folha por página, sem metadado de carimbo — o esqueleto sobre o qual a
// regra de leitura vai escrever quando existir.
for (let i = 0; i < pdf.numPages; i++) {
  await sql`
    INSERT INTO atlas_sheet (id, version_id, page_index, width_pt, height_pt, needs_review)
    VALUES (${crypto.randomUUID()}, ${versionId}, ${i},
            ${viewport.width.toFixed(2)}, ${viewport.height.toFixed(2)}, true)`
}

console.log(`\nimportado: ${pdf.numPages} folhas`)
console.log(`/atlas/${jobsiteId}/documents/${documentId}`)
await sql.end()
