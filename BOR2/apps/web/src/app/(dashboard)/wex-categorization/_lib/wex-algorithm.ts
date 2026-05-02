import { parseCsv, ci } from "./csv-parser"
import type { WexNormEntry } from "@/services/wex-categorization.service"

// ─── Domain types & constants ─────────────────────────────────────────────────

export type Company = "framing" | "hvac" | "pcg"
export type CompanyFilter = Company | "all"
export const COMPANIES: Company[] = ["framing", "hvac", "pcg"]

export const COMPANY_LOGO: Record<Company, string> = {
  framing: "/images/sublogo_framing.png",
  hvac:    "/images/sublogo_hvac.png",
  pcg:     "/images/sublogo_pcg.png",
}
export const COMPANY_LABEL: Record<Company, string> = {
  framing: "Framing",
  hvac:    "HVAC",
  pcg:     "PCG",
}

export type QbRow = {
  date:         string
  fullNameNorm: string
  displayName:  string
  address:      string
}

export type ResultRow = {
  txDate:           string
  weekday:          string
  txTime:           string
  cardNumber:       string
  units:            number
  unitOfMeasure:    string
  unitCost:         number
  totalFuelCost:    number
  merchantCity:     string
  driverId:         string
  driverWexName:    string
  driverQbName:     string
  obrasTrabalhadas: string
  qtyObras:         number
  costPerJobcode:   number
  isOffice:         boolean
}

// ─── QB Time filters ──────────────────────────────────────────────────────────

export const EXCLUDE_JOBS = new Set([
  "Lunch break", "Holiday Paid", "Sick", "Admin", "Office",
  "Lunck Break Paid", "Lunch Break Paid", "Lunch Break Office", "Holiday",
])
const IGNORE_PARTS = new Set(["Admin", "Office", "TRANSPORT"])

// ─── Date utils ───────────────────────────────────────────────────────────────

export function toIso(raw: string): string | null {
  const s = raw.trim().split("T")[0]
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
  const i = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (i) return `${i[1]}-${i[2].padStart(2, "0")}-${i[3].padStart(2, "0")}`
  return null
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export function weekdayOf(iso: string): string {
  return WEEKDAY_NAMES[new Date(`${iso}T12:00:00`).getDay()] ?? ""
}

export function fmtDate(raw: string): string {
  const iso = toIso(raw)
  if (!iso) return raw
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ─── Name normalization ───────────────────────────────────────────────────────

export function normalizeName(raw: string): string {
  if (!raw) return ""
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

export function buildQbIndex(qbRows: QbRow[], ignoredObras: Set<string> = new Set()): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const r of qbRows) {
    const key = `${r.date}|${r.fullNameNorm}`
    const existing = map.get(key) ?? []
    const addr = ignoredObras.size > 0
      ? r.address.split(", ").filter(a => a.trim() && !ignoredObras.has(a.trim())).join(", ")
      : r.address
    if (addr && !existing.includes(addr)) existing.push(addr)
    map.set(key, existing)
  }
  return map
}

export function runAllocation(
  wexText:     string,
  qbRows:      QbRow[],
  normMap:     Map<string, WexNormEntry>,
  fromDate:    string,
  toDate:      string,
  overrides:   Record<string, string> = {},
  ignoredObras: Set<string> = new Set()
): ResultRow[] {
  const { headers, rows } = parseCsv(wexText)
  const qbIdx = buildQbIndex(qbRows, ignoredObras)
  const results: ResultRow[] = []

  for (const row of rows) {
    const get = (name: string) => (row[ci(headers, name)] ?? "").trim()
    const rawDate = get("Transaction Date")
    const isoDate = toIso(rawDate)
    if (!isoDate) continue
    if (fromDate && isoDate < fromDate) continue
    if (toDate   && isoDate > toDate)   continue

    const emboss        = get("Emboss Line 2")
    const driverWexName = emboss || `${get("Driver First Name")} ${get("Driver Last Name")}`.trim()
    const driverId      = get("Driver Prompt ID").replace(/\s/g, "")
    const normDriverId  = driverId.padStart(4, "0")
    const normEntry     = normMap.get(driverId) ?? normMap.get(normDriverId)

    let driverQbName = normEntry
      ? (normEntry.qbName === "Sem QB Time" || normEntry.qbName === "-" ? "" : normEntry.qbName)
      : normalizeName(driverWexName)

    const overrideVal = overrides[normDriverId]
    if (overrideVal && overrideVal !== "__office__") driverQbName = overrideVal
    const forceOffice = overrideVal === "__office__"

    const qbKey       = `${isoDate}|${normalizeName(driverQbName)}`
    const obras       = forceOffice ? [] : (qbIdx.get(qbKey) ?? [])
    const uniqueObras = [...new Set(obras)].sort()
    const totalCost   = parseFloat(get("Total Fuel Cost").replace(/[^0-9.-]/g, "")) || 0
    const isOffice    = uniqueObras.length === 0
    const finalObras  = isOffice ? ["Office"] : uniqueObras
    const qtyObras    = finalObras.length

    results.push({
      txDate: rawDate, weekday: weekdayOf(isoDate),
      txTime: get("Transaction Time"), cardNumber: get("Card Number"),
      units: parseFloat(get("Units").replace(/[^0-9.-]/g, "")) || 0,
      unitOfMeasure: get("Unit of Measure"),
      unitCost: parseFloat(get("Unit Cost").replace(/[^0-9.-]/g, "")) || 0,
      totalFuelCost: totalCost, merchantCity: get("Merchant City"),
      driverId: normDriverId, driverWexName,
      driverQbName: driverQbName || driverWexName,
      obrasTrabalhadas: finalObras.join(" | "),
      qtyObras, costPerJobcode: totalCost / qtyObras, isOffice,
    })
  }
  return results
}

const EXCLUDE_JOBS_LOWER = new Set([...EXCLUDE_JOBS].map(s => s.toLowerCase()))

export function parseQbTime(text: string): QbRow[] {
  const { headers, rows } = parseCsv(text)
  const fI = ci(headers, "fname"), lI = ci(headers, "lname")
  const dI = ci(headers, "local_date"), j1 = ci(headers, "jobcode_1")
  if (fI < 0 || lI < 0 || dI < 0 || j1 < 0) return []

  const jCols = headers
    .map((h, i) => ({ lower: h.trim().toLowerCase(), i }))
    .filter(({ lower }) => /^jobcode_\d+$/.test(lower))
    .map(({ i }) => i)

  const result: QbRow[] = []
  for (const row of rows) {
    const jc1 = (row[j1] ?? "").trim()
    if (EXCLUDE_JOBS_LOWER.has(jc1.toLowerCase())) continue
    const date = (row[dI] ?? "").trim().split("T")[0]
    if (!date) continue
    const fname = (row[fI] ?? "").trim(), lname = (row[lI] ?? "").trim()
    const jcols = jCols
      .map(i => (row[i] ?? "").trim())
      .filter(v => v && !IGNORE_PARTS.has(v))
    if (!jcols.length) continue
    result.push({ date, fullNameNorm: normalizeName(`${fname} ${lname}`), displayName: `${fname} ${lname}`.trim(), address: jcols.join(", ") })
  }
  return result
}
