#!/usr/bin/env bun
/**
 * Migrates BOR1 users (Supabase) → BOR2 (Railway Postgres)
 * Skips users marked as "descontinuado" and emails that already exist.
 * Prints provisional credentials at the end.
 */
import postgres from "postgres"

const BOR1_URL  = "https://zsqbejfmbyuanetoxewt.supabase.co"
const BOR1_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcWJlamZtYnl1YW5ldG94ZXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NDk5MjQsImV4cCI6MjA2NjQyNTkyNH0.YB7OWzXXX7B9moO6rTmcQA2AvnJNAO_VoGEpPHC-AQ0"
const BOR2_CONN = "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway"

const sql = postgres(BOR2_CONN, { ssl: "prefer" })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$"

function genPassword(len = 10): string {
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(n => CHARSET[n % CHARSET.length]).join("")
}

// BOR1 tela key → BOR2 permission key
const TELA_MAP: Record<string, string> = {
  timesheet_analysis:        "timesheet",
  takeoff_works:             "takeoff",
  permit_control:            "permits",
  service_requests:          "service_requests",
  accounting_indicators:     "accounting",
  project_monitoring_hvac:   "project_monitoring",
  fuel_control:              "fuel",
  forecast:                  "forecast",
  operational_efficiency_index: "ofi",
  inventory_control_index:   "inventory",
}

// ─── Fetch BOR1 data ──────────────────────────────────────────────────────────

async function bor1Get<T>(path: string): Promise<T> {
  const res = await fetch(BOR1_URL + "/rest/v1/" + path, {
    headers: { apikey: BOR1_KEY, Authorization: "Bearer " + BOR1_KEY },
  })
  return res.json() as Promise<T>
}

type BOR1User = {
  id: string; nome_completo: string; email: string
  senha_hash: string; financial_pass: boolean
}
type BOR1Tela    = { id: string; titulo: string }
type BOR1UT      = { usuario_id: string; tela_id: string }

const [bor1Users, bor1Telas, bor1UT] = await Promise.all([
  bor1Get<BOR1User[]>("usuarios?select=*"),
  bor1Get<BOR1Tela[]>("telas?select=*"),
  bor1Get<BOR1UT[]>("usuarios_telas?select=*"),
])

// Build tela id → BOR2 key map
const telaKeyMap: Record<string, string> = {}
for (const t of bor1Telas) {
  const bor2Key = TELA_MAP[t.titulo]
  if (bor2Key) telaKeyMap[t.id] = bor2Key
}

// Build user_id → permissions map
const permByUser: Record<string, Record<string, string>> = {}
for (const row of bor1UT) {
  const key = telaKeyMap[row.tela_id]
  if (!key) continue
  if (!permByUser[row.usuario_id]) permByUser[row.usuario_id] = {}
  permByUser[row.usuario_id][key] = "read"
}

// ─── Migrate ─────────────────────────────────────────────────────────────────

// Skip discontinued users
const SKIP_EMAILS = new Set(["italo@premiumgrpinc.com", "victor@premiumgrpinc.com"])

// Existing emails in BOR2
const existing = await sql<{ email: string }[]>`SELECT email FROM users`
const existingEmails = new Set(existing.map(r => r.email))

const results: { name: string; email: string; role: string; pass: string; status: string }[] = []

for (const u of bor1Users) {
  if (SKIP_EMAILS.has(u.email)) continue

  const role = u.email === "vitor@premiumgrpinc.com" ? "dev" : "user"
  const pass = genPassword()
  const hash = await Bun.password.hash(pass, { algorithm: "bcrypt", cost: 12 })

  if (existingEmails.has(u.email)) {
    results.push({ name: u.nome_completo, email: u.email, role, pass: "(já existe)", status: "SKIP" })
    continue
  }

  const { randomUUID } = await import("crypto")
  const id = randomUUID()

  await sql`
    INSERT INTO users (id, email, name, role, password_hash, provisional_password, financial_pass, created_at, updated_at)
    VALUES (${id}, ${u.email}, ${u.nome_completo}, ${role}, ${hash}, true, ${u.financial_pass}, NOW(), NOW())
  `

  const perms = permByUser[u.id] ?? {}
  await sql`
    INSERT INTO user_permissions (user_id, permissions, updated_at)
    VALUES (${id}, ${JSON.stringify(perms)}::jsonb, NOW())
    ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()
  `

  results.push({ name: u.nome_completo, email: u.email, role, pass, status: "OK" })
}

await sql.end()

// ─── Print results ────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(80))
console.log("BOR1 → BOR2 User Migration")
console.log("─".repeat(80))
console.log(
  "Status".padEnd(6) + " " +
  "Name".padEnd(22) + " " +
  "Email".padEnd(38) + " " +
  "Role".padEnd(8) + " " +
  "Provisional Password"
)
console.log("─".repeat(80))
for (const r of results) {
  const status = r.status === "OK" ? "✓" : "–"
  console.log(
    status.padEnd(6) +
    r.name.padEnd(22) + " " +
    r.email.padEnd(38) + " " +
    r.role.padEnd(8) + " " +
    r.pass
  )
}
console.log("─".repeat(80))
console.log(`${results.filter(r => r.status === "OK").length} created, ${results.filter(r => r.status === "SKIP").length} skipped`)
