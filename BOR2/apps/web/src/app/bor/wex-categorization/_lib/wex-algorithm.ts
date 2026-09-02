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

// One obra's share of a transaction's cost: total allocated across every day
// it was visited within the transaction's coverage period (not a per-day row).
export type ObraAllocation = {
  obra:          string
  daysVisited:   string[]
  allocatedCost: number
}

export type ResultRow = {
  txDate:        string
  weekday:       string
  txTime:        string
  cardNumber:    string
  units:         number
  unitOfMeasure: string
  unitCost:      number
  totalFuelCost: number
  merchantCity:  string
  driverId:      string
  driverWexName: string
  driverQbName:  string
  // Coverage period this transaction was rateado across: from the transaction's
  // own date until the day before the same card's next transaction (or the
  // report's end-date boundary, for the card's last transaction in range).
  periodStart:   string
  periodEnd:     string
  isOffice:      boolean
  obras:         ObraAllocation[]
}

// Shape saved by reports created before the F-1 period-based rewrite —
// one obra list per transaction day, no period/days-visited breakdown.
export type LegacyResultRow = {
  txDate: string; weekday: string; txTime: string; cardNumber: string
  units: number; unitOfMeasure: string; unitCost: number; totalFuelCost: number
  merchantCity: string; driverId: string; driverWexName: string; driverQbName: string
  obrasTrabalhadas: string; qtyObras: number; costPerJobcode: number; isOffice: boolean
}

export type AnyResultRow = ResultRow | LegacyResultRow

// Normalizes an already-saved report row (old or new shape) into the current
// ResultRow shape, so exports keep working for reports saved before F-1.
export function normalizeResultRow(r: AnyResultRow): ResultRow {
  if ("obras" in r) return r
  const obras: ObraAllocation[] = r.obrasTrabalhadas
    ? r.obrasTrabalhadas.split(" | ").filter(Boolean).map(obra => ({
        obra, daysVisited: [], allocatedCost: r.costPerJobcode,
      }))
    : []
  return {
    txDate: r.txDate, weekday: r.weekday, txTime: r.txTime, cardNumber: r.cardNumber,
    units: r.units, unitOfMeasure: r.unitOfMeasure, unitCost: r.unitCost,
    totalFuelCost: r.totalFuelCost, merchantCity: r.merchantCity,
    driverId: r.driverId, driverWexName: r.driverWexName, driverQbName: r.driverQbName,
    periodStart: r.txDate, periodEnd: r.txDate, isOffice: r.isOffice, obras,
  }
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

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function enumerateDates(startIso: string, endIso: string): string[] {
  const out: string[] = []
  for (let d = startIso; d <= endIso; d = addDaysIso(d, 1)) out.push(d)
  return out
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

type RawTx = {
  isoDate: string; rawDate: string; cardNumber: string
  txTime: string; units: number; unitOfMeasure: string; unitCost: number
  totalFuelCost: number; merchantCity: string
  driverId: string; driverWexName: string; driverQbName: string
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

  const rawTxs: RawTx[] = []
  let maxIso = ""
  for (const row of rows) {
    const get = (name: string) => (row[ci(headers, name)] ?? "").trim()
    const rawDate = get("Transaction Date")
    const isoDate = toIso(rawDate)
    if (!isoDate) continue
    if (isoDate > maxIso) maxIso = isoDate
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

    rawTxs.push({
      isoDate, rawDate, cardNumber: get("Card Number"),
      txTime: get("Transaction Time"),
      units: parseFloat(get("Units").replace(/[^0-9.-]/g, "")) || 0,
      unitOfMeasure: get("Unit of Measure"),
      unitCost: parseFloat(get("Unit Cost").replace(/[^0-9.-]/g, "")) || 0,
      totalFuelCost: parseFloat(get("Total Fuel Cost").replace(/[^0-9.-]/g, "")) || 0,
      merchantCity: get("Merchant City"),
      driverId: normDriverId, driverWexName,
      driverQbName: forceOffice ? "" : (driverQbName || driverWexName),
    })
  }

  // Group by card (same card = same vehicle/driver combo) so each
  // transaction's coverage period runs until that card's next transaction.
  const byCard = new Map<string, RawTx[]>()
  for (const tx of rawTxs) {
    const key = tx.cardNumber || tx.driverId
    const arr = byCard.get(key) ?? []
    arr.push(tx)
    byCard.set(key, arr)
  }

  const periodEndBoundary = toDate || maxIso
  const results: ResultRow[] = []

  for (const txs of byCard.values()) {
    txs.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]
      const periodStart = tx.isoDate
      let periodEnd: string
      if (i + 1 < txs.length) {
        periodEnd = addDaysIso(txs[i + 1].isoDate, -1)
        if (periodEnd < periodStart) periodEnd = periodStart
      } else {
        periodEnd = periodEndBoundary > periodStart ? periodEndBoundary : periodStart
      }

      // Days visited per obra across the whole coverage period (not per day).
      const obraDays = new Map<string, string[]>()
      if (tx.driverQbName) {
        const nameNorm = normalizeName(tx.driverQbName)
        for (const d of enumerateDates(periodStart, periodEnd)) {
          const obras = qbIdx.get(`${d}|${nameNorm}`) ?? []
          for (const o of new Set(obras)) {
            const days = obraDays.get(o) ?? []
            days.push(d)
            obraDays.set(o, days)
          }
        }
      }

      const totalDayVisits = [...obraDays.values()].reduce((s, d) => s + d.length, 0)
      const isOffice = totalDayVisits === 0
      const obras: ObraAllocation[] = isOffice
        ? [{ obra: "Office", daysVisited: [], allocatedCost: tx.totalFuelCost }]
        : [...obraDays.entries()]
            .map(([obra, days]) => ({
              obra, daysVisited: days.sort(),
              allocatedCost: (tx.totalFuelCost / totalDayVisits) * days.length,
            }))
            .sort((a, b) => b.allocatedCost - a.allocatedCost)

      results.push({
        txDate: tx.rawDate, weekday: weekdayOf(tx.isoDate), txTime: tx.txTime,
        cardNumber: tx.cardNumber, units: tx.units, unitOfMeasure: tx.unitOfMeasure,
        unitCost: tx.unitCost, totalFuelCost: tx.totalFuelCost, merchantCity: tx.merchantCity,
        driverId: tx.driverId, driverWexName: tx.driverWexName,
        driverQbName: tx.driverQbName || tx.driverWexName,
        periodStart, periodEnd, isOffice, obras,
      })
    }
  }

  results.sort((a, b) => (toIso(a.txDate) ?? "").localeCompare(toIso(b.txDate) ?? ""))
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
