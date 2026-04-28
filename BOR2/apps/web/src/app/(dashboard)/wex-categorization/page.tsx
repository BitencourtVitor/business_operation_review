"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Settings, Plus, Pencil, Trash2, X,
  Upload, CheckCircle2, Play, AlertTriangle,
  FileSpreadsheet, FileText, FolderOpen,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import {
  wexCategorizationService,
  type WexNormEntry,
  type WexReport,
  type WexReportMeta,
} from "@/services/wex-categorization.service"

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

type ParsedCsv = { headers: string[]; rows: string[][] }

function guessDelimiter(text: string): "," | ";" | "\t" {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5)
  const sample = lines.join("\n")
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let inQ = false
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]
    if (ch === '"') { if (inQ && sample[i + 1] === '"') { i++; continue } inQ = !inQ; continue }
    if (!inQ && (ch === "," || ch === ";" || ch === "\t")) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return (best?.[0] as "," | ";" | "\t") || ","
}

function parseCsvCore(text: string, delim: "," | ";" | "\t"): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = [], field = "", inQ = false
  const pushF = () => { row.push(field); field = "" }
  const pushR = () => { rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { inQ = false } }
      else { field += ch }
      continue
    }
    if (ch === '"') { inQ = true; continue }
    if (ch === delim) { pushF(); continue }
    if (ch === "\n") { pushF(); pushR(); continue }
    if (ch === "\r") { if (text[i + 1] === "\n") continue; pushF(); pushR(); continue }
    field += ch
  }
  pushF()
  if (row.length > 1 || row[0]?.trim()) pushR()
  const headers = (rows[0] || []).map(h => h.trim())
  return { headers, rows: rows.slice(1).filter(r => r.some(c => c.trim())) }
}

function parseCsv(text: string): ParsedCsv {
  return parseCsvCore(text, guessDelimiter(text))
}

function ci(headers: string[], name: string) {
  return headers.findIndex(h => h.trim() === name)
}

// ─── Date utils ───────────────────────────────────────────────────────────────

function toIso(raw: string): string | null {
  const s = raw.trim().split("T")[0]
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
  const i = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (i) return `${i[1]}-${i[2].padStart(2, "0")}-${i[3].padStart(2, "0")}`
  return null
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
function weekdayOf(iso: string): string {
  return WEEKDAY_NAMES[new Date(`${iso}T12:00:00`).getDay()] ?? ""
}

function fmtDate(raw: string): string {
  const iso = toIso(raw)
  if (!iso) return raw
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ─── Name normalization ───────────────────────────────────────────────────────

function normalizeName(raw: string): string {
  if (!raw) return ""
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
}

// ─── QB Time filters ──────────────────────────────────────────────────────────

const EXCLUDE_JOBS = new Set([
  "Lunch break", "Holiday Paid", "Sick", "Admin", "Office",
  "Lunck Break Paid", "Lunch Break Paid", "Lunch Break Office", "Holiday",
])
const IGNORE_PARTS = new Set(["Admin", "Office", "TRANSPORT"])

// ─── Domain types ─────────────────────────────────────────────────────────────

type Company = "framing" | "hvac" | "pcg"
type CompanyFilter = Company | "all"
const COMPANIES: Company[] = ["framing", "hvac", "pcg"]

const COMPANY_LOGO: Record<Company, string> = {
  framing: "/images/sublogo_framing.png",
  hvac:    "/images/sublogo_hvac.png",
  pcg:     "/images/sublogo_pcg.png",
}
const COMPANY_LABEL: Record<Company, string> = {
  framing: "Framing",
  hvac:    "HVAC",
  pcg:     "PCG",
}

type QbRow = {
  date: string
  fullNameNorm: string
  displayName: string
  address: string
}

type ResultRow = {
  txDate: string
  weekday: string
  txTime: string
  cardNumber: string
  units: number
  unitOfMeasure: string
  unitCost: number
  totalFuelCost: number
  merchantCity: string
  driverId: string
  driverWexName: string
  driverQbName: string
  obrasTrabalhadas: string
  qtyObras: number
  costPerJobcode: number
  isOffice: boolean
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function buildQbIndex(qbRows: QbRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const r of qbRows) {
    const key = `${r.date}|${r.fullNameNorm}`
    const existing = map.get(key) ?? []
    if (!existing.includes(r.address)) existing.push(r.address)
    map.set(key, existing)
  }
  return map
}

function runAllocation(
  wexText: string,
  qbRows: QbRow[],
  normMap: Map<string, WexNormEntry>,
  fromDate: string,
  toDate: string,
  overrides: Record<string, string> = {}
): ResultRow[] {
  const { headers, rows } = parseCsv(wexText)
  const qbIdx = buildQbIndex(qbRows)
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

function parseQbTime(text: string): QbRow[] {
  const { headers, rows } = parseCsv(text)
  const fI = ci(headers, "fname"), lI = ci(headers, "lname")
  const dI = ci(headers, "local_date"), j1 = ci(headers, "jobcode_1")
  const j2 = ci(headers, "jobcode_2"), j3 = ci(headers, "jobcode_3"), j4 = ci(headers, "jobcode_4")
  if (fI < 0 || lI < 0 || dI < 0 || j1 < 0) return []
  const result: QbRow[] = []
  for (const row of rows) {
    const jc1 = (row[j1] ?? "").trim()
    if (EXCLUDE_JOBS.has(jc1)) continue
    const date = (row[dI] ?? "").trim().split("T")[0]
    if (!date) continue
    const fname = (row[fI] ?? "").trim(), lname = (row[lI] ?? "").trim()
    const jcols = [j1, j2, j3, j4].map(i => (i >= 0 ? (row[i] ?? "").trim() : "")).filter(v => v && !IGNORE_PARTS.has(v))
    if (!jcols.length) continue
    result.push({ date, fullNameNorm: normalizeName(`${fname} ${lname}`), displayName: `${fname} ${lname}`.trim(), address: jcols.join(", ") })
  }
  return result
}

// ─── Excel export ─────────────────────────────────────────────────────────────

function exportToExcel(rows: ResultRow[], company: Company) {
  const data = [
    ["Transaction Date","Weekday","Transaction Time","Card Number","Units","Unit of Measure","Unit Cost","Total Fuel Cost","Merchant City","Driver Full Name (Padrão do Wex)","full_name (Padrão do Quickbooks)","Obras Trabalhadas","Qty_Obras","Cost_Per_Jobcode"],
    ...rows.map(r => [r.txDate,r.weekday,r.txTime,r.cardNumber,r.units,r.unitOfMeasure,r.unitCost,r.totalFuelCost,r.merchantCity,r.driverWexName,r.driverQbName,r.obrasTrabalhadas,r.qtyObras,r.costPerJobcode]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, company.toUpperCase())
  XLSX.writeFile(wb, `wex_${company}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportToPdf(report: WexReport, results: ResultRow[]) {
  const label  = COMPANY_LABEL[report.company as Company] ?? report.company
  const period = formatPeriod(report)
  const genAt  = new Date(report.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  const total  = results.reduce((s, r) => s + r.totalFuelCost, 0)

  const obraMap = new Map<string, number>()
  for (const r of results)
    for (const o of r.obrasTrabalhadas.split(" | "))
      if (o.trim() && o.trim() !== "Office") obraMap.set(o.trim(), (obraMap.get(o.trim()) ?? 0) + r.costPerJobcode)
  const obraList = [...obraMap.entries()].sort((a, b) => b[1] - a[1])

  const rowsHtml = results.map(r => `
    <tr class="${r.isOffice ? "office" : ""}">
      <td>${r.txDate}</td><td>${r.weekday.slice(0,3)}</td>
      <td>${r.driverWexName}</td><td>${r.driverQbName}</td>
      <td class="num">$${r.totalFuelCost.toFixed(2)}</td>
      <td class="${r.isOffice ? "amber" : ""}">${r.obrasTrabalhadas}</td>
      <td class="num">${r.qtyObras || "—"}</td>
      <td class="num">${r.qtyObras > 0 ? `$${r.costPerJobcode.toFixed(2)}` : "—"}</td>
      <td>${r.merchantCity}</td>
    </tr>`).join("")

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>WEX Report – ${label} – ${period}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;font-size:11px;color:#111;padding:24px}
h1{font-size:20px;font-weight:700;margin-bottom:3px}
.sub{color:#666;font-size:11px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.card .lbl{font-size:9px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.5px;margin-bottom:8px}
.card .row{display:flex;gap:20px;flex-wrap:wrap}
.card .stat .v{font-size:17px;font-weight:700}
.card .stat .l{font-size:9px;color:#888}
.summary{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap}
.summary span{font-size:11px}.summary b{font-size:14px;font-weight:700}
.obras{margin-bottom:16px}
.obras h2{font-size:12px;font-weight:700;margin-bottom:8px;color:#333}
.orow{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.orow .oname{width:260px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.orow .obar-wrap{flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden}
.orow .obar{height:100%;background:#6366f1;border-radius:3px}
.orow .opct{width:36px;text-align:right;font-size:9px;color:#888}
.orow .oval{width:60px;text-align:right;font-size:10px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:9.5px}
thead tr{background:#f3f4f6}
th{padding:6px 8px;text-align:left;font-weight:700;border:1px solid #e5e7eb;color:#555;font-size:9px;text-transform:uppercase}
td{padding:5px 8px;border:1px solid #e5e7eb}
.num{text-align:right;font-weight:600}
.amber{color:#b45309}
tr.office td{background:#fffbeb}
@media print{body{padding:0}@page{margin:1cm}}
</style></head><body>
<h1>WEX Fuel Cost Report — ${label}</h1>
<div class="sub">Period: ${period} &nbsp;·&nbsp; Generated: ${genAt}</div>

<div class="grid">
  <div class="card">
    <div class="lbl">WEX Report</div>
    <div class="row">
      <div class="stat"><div class="v">${report.meta.wexTxCount}</div><div class="l">Transactions</div></div>
      <div class="stat"><div class="v">$${report.meta.wexTotal.toFixed(2)}</div><div class="l">Total Cost</div></div>
      <div class="stat"><div class="v">${report.meta.wexDrivers}</div><div class="l">Drivers</div></div>
    </div>
  </div>
  <div class="card">
    <div class="lbl">QuickBooks Time</div>
    <div class="row">
      <div class="stat"><div class="v">${report.meta.qbEntries}</div><div class="l">Entries</div></div>
      <div class="stat"><div class="v">${report.meta.qbEmployees}</div><div class="l">Employees</div></div>
    </div>
  </div>
</div>

<div class="summary">
  <span><b>${report.meta.matched}</b> matched</span>
  ${report.meta.officeCount > 0 ? `<span><b style="color:#b45309">${report.meta.officeCount}</b> → Office</span>` : ""}
  <span><b>${report.meta.uniqueObras}</b> unique obras</span>
  <span><b>$${total.toFixed(2)}</b> total</span>
</div>

${obraList.length > 0 ? `
<div class="obras">
  <h2>Cost by Obra (top ${Math.min(obraList.length, 15)})</h2>
  ${obraList.slice(0, 15).map(([obra, cost]) => {
    const pct = total > 0 ? (cost / total * 100) : 0
    return `<div class="orow">
      <div class="oname" title="${obra}">${obra}</div>
      <div class="obar-wrap"><div class="obar" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="opct">${pct.toFixed(1)}%</div>
      <div class="oval">$${cost.toFixed(2)}</div>
    </div>`
  }).join("")}
</div>` : ""}

<table>
  <thead><tr>
    <th>Date</th><th>Day</th><th>Driver (WEX)</th><th>QB Time Name</th>
    <th>Total Cost</th><th>Obras Trabalhadas</th><th>Qty</th><th>Cost/Obra</th><th>City</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body></html>`

  const win = window.open("", "_blank", "width=1000,height=800")
  if (!win) { toast.error("Popup blocked — allow popups to export PDF."); return }
  win.document.write(html)
  win.document.close()
  win.onload = () => win.print()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(report: WexReport): string {
  const from = report.filterFrom
  const to   = report.filterTo
  if (!from && !to) return "All dates"
  const f = fmtDate(from), t = fmtDate(to)
  return from === to || !to ? f : `${f} – ${t}`
}

// ─── File Drop Zone ───────────────────────────────────────────────────────────

function FileDropZone({ label, accept, fileName, loaded, onFile }: {
  label: string; accept: string; fileName: string; loaded: boolean; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-5 text-center transition-colors select-none",
        drag   ? "border-primary/60 bg-primary/5"
        : loaded ? "border-emerald-500/40 bg-emerald-500/5"
        :          "border-border/60 hover:border-border hover:bg-muted/30",
      )}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }} />
      {loaded
        ? <><CheckCircle2 className="h-5 w-5 text-emerald-500" /><p className="text-xs font-medium">{fileName}</p><p className="text-[11px] text-muted-foreground">Click or drop to replace</p></>
        : <><Upload className="h-5 w-5 text-muted-foreground/40" /><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="text-[11px] text-muted-foreground/60">Drag & drop or click to select</p></>
      }
    </div>
  )
}

// ─── Company Logo ─────────────────────────────────────────────────────────────

function CompanyLogo({ company, className }: { company: Company; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={COMPANY_LOGO[company]} alt={COMPANY_LABEL[company]}
      className={cn("h-4 w-auto object-contain", className)} />
  )
}

// ─── Report Card ─────────────────────────────────────────────────────────────

function ReportCard({ report, onDelete, onExportExcel, onExportPdf }: {
  report: WexReport
  onDelete: () => void
  onExportExcel: () => void
  onExportPdf: () => void
}) {
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""
  const period  = formatPeriod(report)
  const genAt   = new Date(report.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <CompanyLogo company={report.company as Company} />
        <span className="font-semibold">{COMPANY_LABEL[report.company as Company] ?? report.company}</span>
        <span className="h-4 w-px shrink-0 bg-border/60" />
        <span className="text-sm text-muted-foreground">{period}</span>
        <span className="ml-auto text-xs text-muted-foreground">{genAt}</span>
      </div>

      {/* Metadata two-col */}
      <div className="grid grid-cols-2 divide-x divide-border/50 border-b border-border">
        <div className="flex flex-col gap-2 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">WEX Report</span>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.wexTxCount}</span> <span className="text-xs text-muted-foreground">transactions</span></span>
            <span className="text-sm"><span className={`font-semibold tabular-nums ${blur}`}>${report.meta.wexTotal.toFixed(2)}</span> <span className="text-xs text-muted-foreground">total</span></span>
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.wexDrivers}</span> <span className="text-xs text-muted-foreground">drivers</span></span>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">QB Time</span>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.qbEntries}</span> <span className="text-xs text-muted-foreground">entries</span></span>
            <span className="text-sm"><span className="font-semibold tabular-nums">{report.meta.qbEmployees}</span> <span className="text-xs text-muted-foreground">employees</span></span>
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-2.5">
        <span className="text-sm">
          <span className="font-semibold tabular-nums text-emerald-500">{report.meta.matched}</span>
          <span className="ml-1 text-xs text-muted-foreground">matched</span>
        </span>
        {report.meta.officeCount > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="font-semibold tabular-nums text-amber-500">{report.meta.officeCount}</span>
            <span className="ml-0.5 text-xs text-muted-foreground">→ Office</span>
          </span>
        )}
        <span className="text-sm">
          <span className="font-semibold tabular-nums">{report.meta.uniqueObras}</span>
          <span className="ml-1 text-xs text-muted-foreground">unique obras</span>
        </span>
        <span className="text-sm">
          <span className={`font-semibold tabular-nums ${blur}`}>${report.meta.totalCost?.toFixed(2) ?? "—"}</span>
          <span className="ml-1 text-xs text-muted-foreground">total cost</span>
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onExportExcel}>
          <FileSpreadsheet className="h-3.5 w-3.5" />Export Excel
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onExportPdf}>
          <FileText className="h-3.5 w-3.5" />Export PDF
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />Delete
        </Button>
      </div>
    </div>
  )
}

// ─── Settings Sheet (Driver Mapping CRUD) ─────────────────────────────────────

function SettingsSheet({ open, onClose, initialCompany }: {
  open: boolean; onClose: () => void; initialCompany: CompanyFilter
}) {
  const [company,  setCompany]  = useState<Company>(initialCompany === "all" ? "framing" : initialCompany)
  const [entries, setEntries]  = useState<WexNormEntry[]>([])
  const [loading, setLoading]  = useState(false)
  const [newId,    setNewId]   = useState("")
  const [newWex,   setNewWex]  = useState("")
  const [newQb,    setNewQb]   = useState("")
  const [editId,   setEditId]  = useState<number | null>(null)
  const [editWex,  setEditWex] = useState("")
  const [editQb,   setEditQb]  = useState("")

  // Sync company when sheet opens with a new initialCompany
  useEffect(() => {
    if (open && initialCompany !== "all") setCompany(initialCompany)
  }, [open, initialCompany])

  useEffect(() => {
    if (!open) return
    setEntries([])
    setLoading(true)
    wexCategorizationService.listNorm(company)
      .then(data => setEntries(data ?? []))
      .catch(() => toast.error("Failed to load driver mappings."))
      .finally(() => setLoading(false))
  }, [open, company])

  async function handleAdd() {
    if (!newId.trim() || !newQb.trim()) { toast.error("Driver ID and QB Name are required."); return }
    const driverId = newId.trim().padStart(4, "0")
    try {
      const entry = await wexCategorizationService.upsertNorm({ company, driverId, wexName: newWex.trim(), qbName: newQb.trim(), isActive: true })
      setEntries(prev => {
        const filtered = prev.filter(e => e.driverId !== driverId)
        return [...filtered, entry].sort((a, b) => a.driverId.localeCompare(b.driverId))
      })
      setNewId(""); setNewWex(""); setNewQb("")
      toast.success("Entry saved.")
    } catch { toast.error("Failed to save entry.") }
  }

  async function handleDelete(id: number) {
    try {
      await wexCategorizationService.deleteNorm(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      toast.success("Deleted.")
    } catch { toast.error("Failed to delete entry.") }
  }

  function startEdit(e: WexNormEntry) {
    setEditId(e.id); setEditWex(e.wexName ?? ""); setEditQb(e.qbName)
  }

  async function handleSaveEdit() {
    if (editId === null) return
    const entry = entries.find(e => e.id === editId)
    if (!entry) return
    try {
      const updated = await wexCategorizationService.updateNorm(editId, {
        company: entry.company, driverId: entry.driverId,
        wexName: editWex.trim(), qbName: editQb.trim(), isActive: entry.isActive,
      })
      setEntries(prev => prev.map(e => e.id === editId ? updated : e))
      setEditId(null)
      toast.success("Saved.")
    } catch { toast.error("Failed to update entry.") }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[85vh] flex-col gap-0 p-0" style={{ width: "fit-content", maxWidth: "92vw", minWidth: "32rem" }}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Driver Mapping</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 no-scrollbar">
          {/* Company segmented control */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {COMPANIES.map(c => (
              <button key={c} onClick={() => { setCompany(c); setEditId(null) }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  company === c
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                <CompanyLogo company={c} />
                {COMPANY_LABEL[c]}
              </button>
            ))}
          </div>
          {/* Add form */}
          <div className="rounded-xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Add Entry</span>
              <span className="ml-2 text-xs text-muted-foreground">— map Driver ID → QB Time name</span>
            </div>
            <div className="flex items-end gap-3 p-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Driver ID</span>
                <Input value={newId} onChange={e => setNewId(e.target.value)} placeholder="e.g. 6712"
                  className="h-8 w-24 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">WEX Name</span>
                <Input value={newWex} onChange={e => setNewWex(e.target.value)} placeholder="e.g. Jose Honorio"
                  className="h-8 w-36 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">QB Time Name</span>
                <Input value={newQb} onChange={e => setNewQb(e.target.value)} placeholder='e.g. JOSE NETO'
                  className="h-8 w-36 text-sm" onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <Button onClick={handleAdd} size="sm" className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" />Add
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card/60">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-24 text-[11px] uppercase tracking-wide">Driver ID</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">WEX Name</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">QB Time Name</TableHead>
                  <TableHead className="w-20 text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && entries.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No entries yet for {COMPANY_LABEL[company]}.
                  </TableCell></TableRow>
                )}
                {entries.map(e => editId === e.id ? (
                  <TableRow key={e.id} className="bg-primary/5">
                    <TableCell><span className="font-mono font-bold text-primary">{e.driverId}</span></TableCell>
                    <TableCell><Input value={editWex} onChange={ev => setEditWex(ev.target.value)} className="h-7 text-xs" /></TableCell>
                    <TableCell><Input value={editQb}  onChange={ev => setEditQb(ev.target.value)}  className="h-7 text-xs" /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}>Save</Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={e.id} className="border-border/50">
                    <TableCell className="font-mono font-bold text-primary">{e.driverId}</TableCell>
                    <TableCell className="text-sm">{e.wexName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className={cn("text-sm", (e.qbName === "Sem QB Time" || e.qbName === "-") ? "text-destructive" : "font-medium")}>
                      {e.qbName}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── New Report Sheet ─────────────────────────────────────────────────────────

function NewReportSheet({ open, onClose, company, onSave }: {
  open: boolean; onClose: () => void; company: Company
  onSave: (r: WexReport) => void
}) {
  const [normMap,     setNormMap]     = useState<Map<string, WexNormEntry>>(new Map())
  const [wexText,     setWexText]     = useState("")
  const [wexFileName, setWexFileName] = useState("")
  const [wexPreview,  setWexPreview]  = useState<{ txCount: number; drivers: number; total: number } | null>(null)
  const [qbRows,      setQbRows]      = useState<QbRow[]>([])
  const [qbFileName,  setQbFileName]  = useState("")
  const [qbPreview,   setQbPreview]   = useState<{ entries: number; employees: number } | null>(null)
  const [filterFrom,  setFilterFrom]  = useState("")
  const [filterTo,    setFilterTo]    = useState("")
  const [results,     setResults]     = useState<ResultRow[]>([])
  const [isRunning,   setIsRunning]   = useState(false)
  const [isSaving,    setIsSaving]    = useState(false)
  const [overrides,   setOverrides]   = useState<Record<string, string>>({})

  // Load norm from API on open
  useEffect(() => {
    if (!open) {
      setWexText(""); setWexFileName(""); setWexPreview(null)
      setQbRows([]); setQbFileName(""); setQbPreview(null)
      setFilterFrom(""); setFilterTo("")
      setResults([]); setIsRunning(false); setOverrides({})
      setNormMap(new Map())
      return
    }
    wexCategorizationService.listNorm(company)
      .then(entries => {
        const map = new Map<string, WexNormEntry>()
        for (const e of entries ?? []) map.set(e.driverId, e)
        setNormMap(map)
      })
      .catch(() => { /* proceed without normalization */ })
  }, [open, company])

  async function handleWexFile(file: File) {
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const missing = ["Transaction Date", "Driver Prompt ID", "Total Fuel Cost"].filter(c => ci(headers, c) < 0)
      if (missing.length) { toast.error(`Missing WEX columns: ${missing.join(", ")}`); return }
      setWexText(text); setWexFileName(file.name)
      let total = 0; const drivers = new Set<string>()
      for (const row of rows) {
        const emboss = (row[ci(headers, "Emboss Line 2")] ?? "").trim()
        const fn = (row[ci(headers, "Driver First Name")] ?? "").trim()
        const ln = (row[ci(headers, "Driver Last Name")] ?? "").trim()
        drivers.add(emboss || `${fn} ${ln}`.trim())
        total += parseFloat((row[ci(headers, "Total Fuel Cost")] ?? "").replace(/[^0-9.-]/g, "")) || 0
      }
      setWexPreview({ txCount: rows.length, drivers: drivers.size, total })
    } catch { toast.error("Failed to parse WEX file.") }
  }

  async function handleQbFile(file: File) {
    try {
      const text = await file.text()
      const { headers } = parseCsv(text)
      const missing = ["fname", "lname", "local_date", "jobcode_1"].filter(c => ci(headers, c) < 0)
      if (missing.length) { toast.error(`Missing QB Time columns: ${missing.join(", ")}`); return }
      const parsed = parseQbTime(text)
      setQbRows(parsed); setQbFileName(file.name)
      setQbPreview({ entries: parsed.length, employees: new Set(parsed.map(r => r.fullNameNorm)).size })
    } catch { toast.error("Failed to parse QB Time file.") }
  }

  function handleRun(overridesArg?: Record<string, string>) {
    if (!wexText)       { toast.error("Upload the WEX file first."); return }
    if (!qbRows.length) { toast.error("Upload the QB Time file first."); return }
    setIsRunning(true)
    setTimeout(() => {
      try {
        const ov   = overridesArg ?? overrides
        const rows = runAllocation(wexText, qbRows, normMap, filterFrom, filterTo, ov)
        setResults(rows)
        const n = rows.filter(r => r.isOffice).length
        if (n > 0) toast.warning(`${rows.length} transactions — ${n} unmatched (→ Office)`)
        else       toast.success(`${rows.length} transactions processed.`)
      } catch (e) { toast.error("Error: " + String(e)) }
      setIsRunning(false)
    }, 0)
  }

  function handleOverride(driverId: string, qbName: string) {
    const newOv = { ...overrides, [driverId]: qbName }
    setOverrides(newOv); handleRun(newOv)
  }

  async function handleSave() {
    if (!results.length) { toast.error("No results to save. Run the allocation first."); return }
    const obraMap = new Map<string, number>()
    for (const r of results)
      for (const o of r.obrasTrabalhadas.split(" | "))
        if (o.trim() && o.trim() !== "Office") obraMap.set(o.trim(), (obraMap.get(o.trim()) ?? 0) + r.costPerJobcode)

    const totalCostVal = results.reduce((s, r) => s + r.totalFuelCost, 0)
    const meta: WexReportMeta = {
      wexTxCount:  wexPreview?.txCount  ?? results.length,
      wexTotal:    wexPreview?.total    ?? totalCostVal,
      wexDrivers:  wexPreview?.drivers  ?? 0,
      qbEntries:   qbPreview?.entries   ?? 0,
      qbEmployees: qbPreview?.employees ?? 0,
      matched:     results.filter(r => !r.isOffice).length,
      officeCount: results.filter(r => r.isOffice).length,
      uniqueObras: obraMap.size,
      totalCost:   totalCostVal,
    }

    setIsSaving(true)
    try {
      const saved = await wexCategorizationService.createReport({
        company, filterFrom, filterTo, meta, results,
      })
      onSave(saved)
      onClose()
      toast.success("Report saved.")
    } catch { toast.error("Failed to save report.") }
    finally { setIsSaving(false) }
  }

  // Derived
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const qbEmpOptions = [...new Map(qbRows.map(r => [r.fullNameNorm, r.displayName])).values()].sort()
  const unresolved = (() => {
    const seen = new Map<string, { driverId: string; wexName: string }>()
    for (const r of results)
      if (r.isOffice && overrides[r.driverId] !== "__office__" && !seen.has(r.driverId))
        seen.set(r.driverId, { driverId: r.driverId, wexName: r.driverWexName })
    return [...seen.values()]
  })()
  const totalCost   = results.reduce((s, r) => s + r.totalFuelCost, 0)
  const officeCount = results.filter(r => r.isOffice).length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent showCloseButton className="flex max-h-[90vh] flex-col gap-0 p-0" style={{ width: "min(92vw, 72rem)", maxWidth: "none" }}>
        <DialogHeader className="flex-row items-center gap-3 border-b px-6 py-4">
          <CompanyLogo company={company} />
          <DialogTitle>New Report — {COMPANY_LABEL[company]}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 no-scrollbar">

          {/* Upload panel */}
          <div className="rounded-xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Upload Files</span>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-4 p-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">WEX Report</span>
                <FileDropZone label="Drop WEX CSV here" accept=".csv,text/csv" fileName={wexFileName} loaded={!!wexText} onFile={handleWexFile} />
                {wexPreview && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground">{wexPreview.txCount}</span> transactions</span>
                    <span><span className="font-semibold text-foreground">{wexPreview.drivers}</span> drivers</span>
                    <span><span className={`font-semibold text-foreground ${blur}`}>${wexPreview.total.toFixed(2)}</span></span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">QuickBooks Time</span>
                <FileDropZone label="Drop QB Time CSV here" accept=".csv,text/csv" fileName={qbFileName} loaded={qbRows.length > 0} onFile={handleQbFile} />
                {qbPreview && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground">{qbPreview.entries}</span> entries</span>
                    <span><span className="font-semibold text-foreground">{qbPreview.employees}</span> employees</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date Filter</span>
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 w-36 text-xs" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   className="h-8 w-36 text-xs" />
                  </div>
                </div>
                <Button onClick={() => handleRun()} disabled={isRunning || !wexText || !qbRows.length}
                  className="gap-2 self-end">
                  <Play className="h-3.5 w-3.5" />
                  {isRunning ? "Processing…" : "Process"}
                </Button>
              </div>
            </div>
          </div>

          {/* Unresolved drivers */}
          {unresolved.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {unresolved.length} driver{unresolved.length > 1 ? "s" : ""} not found in QB Time — assign manually
                </span>
              </div>
              <div className="grid gap-2 p-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {unresolved.map(d => (
                  <div key={d.driverId} className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5">
                    <span className="max-w-[110px] truncate text-xs font-semibold" title={d.wexName}>{d.wexName}</span>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <Select value={overrides[d.driverId] ?? ""} onValueChange={v => { if (v) handleOverride(d.driverId, v) }}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <span className="flex-1 truncate text-left">{overrides[d.driverId] ? (overrides[d.driverId] === "__office__" ? "Office" : overrides[d.driverId]) : "— select —"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__office__">Office (no QB Time)</SelectItem>
                        {qbEmpOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results table */}
          {results.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card/60">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium">
                  {results.length} transactions
                  <span className="mx-1.5 text-border">·</span>
                  <span className={`font-semibold ${blur}`}>${totalCost.toFixed(2)}</span>
                  {officeCount > 0 && <span className="ml-1.5 text-amber-500">· {officeCount} → Office</span>}
                </span>
                <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save Report"}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                    {["Date","Day","Driver (WEX)","QB Time Name","Total Cost","Obras Trabalhadas","Qty","Cost/Obra","City"].map(h => (
                      <TableHead key={h} className="whitespace-nowrap text-[11px] uppercase tracking-wide">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i} className={cn("border-border/50", r.isOffice && "bg-amber-500/5")}>
                      <TableCell className="whitespace-nowrap text-xs">{r.txDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.weekday.slice(0, 3)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.driverWexName}</TableCell>
                      <TableCell className={cn("text-xs", !r.driverQbName && "italic text-destructive")}>{r.driverQbName || "no mapping"}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right text-xs font-semibold tabular-nums ${blur}`}>${r.totalFuelCost.toFixed(2)}</TableCell>
                      <TableCell className={cn("max-w-72 truncate text-xs", r.isOffice && "italic text-amber-500")} title={r.obrasTrabalhadas}>{r.obrasTrabalhadas}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{r.qtyObras || "—"}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right text-xs font-bold tabular-nums text-primary ${blur}`}>{r.qtyObras > 0 ? `$${r.costPerJobcode.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.merchantCity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Empty state */}
          {results.length === 0 && (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <div>
                <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">Upload both files and click Process</p>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WexCategorizationPage() {
  const [company,          setCompany]          = useState<CompanyFilter>("framing")
  const [reports,          setReports]          = useState<WexReport[]>([])
  const [loading,          setLoading]          = useState(false)
  const [settingsOpen,     setSettingsOpen]     = useState(false)
  const [newReportOpen,    setNewReportOpen]    = useState(false)
  const [newReportCompany, setNewReportCompany] = useState<Company>("framing")

  const fetchReports = useCallback((c: CompanyFilter) => {
    setLoading(true)
    const fetch = c === "all"
      ? Promise.all(COMPANIES.map(co => wexCategorizationService.listReports(co)))
          .then(results => results.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      : wexCategorizationService.listReports(c)
    fetch
      .then(data => setReports(data ?? []))
      .catch(() => toast.error("Failed to load reports."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchReports(company) }, [company, fetchReports])

  function handleSaveReport(r: WexReport) {
    setReports(prev => [r, ...prev])
  }

  async function handleDeleteReport(id: string) {
    try {
      await wexCategorizationService.deleteReport(id)
      setReports(prev => prev.filter(r => r.id !== id))
      toast.success("Report deleted.")
    } catch { toast.error("Failed to delete report.") }
  }

  function openNewReport(c: Company) {
    setNewReportCompany(c)
    setNewReportOpen(true)
  }

  async function handleExportExcel(report: WexReport) {
    try {
      const full = await wexCategorizationService.getReport(report.id)
      const results = (full.results ?? []) as ResultRow[]
      exportToExcel(results, report.company as Company)
    } catch { toast.error("Failed to load report data.") }
  }

  async function handleExportPdf(report: WexReport) {
    try {
      const full = await wexCategorizationService.getReport(report.id)
      const results = (full.results ?? []) as ResultRow[]
      exportToPdf(full, results)
    } catch { toast.error("Failed to load report data.") }
  }

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">WEX Categorization</h1>
          <p className="text-sm text-muted-foreground">Fuel cost allocation by obra</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Company dropdown */}
          <Select value={company} onValueChange={v => setCompany(v as CompanyFilter)}>
            <SelectTrigger className="h-8 gap-2 pl-2.5 pr-3">
              {company === "all"
                ? <span className="text-sm font-medium">All companies</span>
                : <><CompanyLogo company={company} /><span className="text-sm font-medium">{COMPANY_LABEL[company]}</span></>
              }
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {COMPANIES.map(c => (
                <SelectItem key={c} value={c}>
                  <CompanyLogo company={c} />
                  <span className="ml-auto">{COMPANY_LABEL[c]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Settings — always available, company picker inside the sheet */}
          <Button size="icon" variant="outline" className="h-8 w-8"
            onClick={() => setSettingsOpen(true)}>
            <Settings className="h-3.5 w-3.5" />
          </Button>

          {/* New Report — direct when a company is selected; dropdown when "all" */}
          {company !== "all" ? (
            <Button size="sm" className="h-8 gap-1.5"
              onClick={() => openNewReport(company)}>
              <Plus className="h-3.5 w-3.5" />New Report
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" className="h-8 gap-1.5" />}>
                <Plus className="h-3.5 w-3.5" />New Report
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                {COMPANIES.map(c => (
                  <DropdownMenuItem key={c} onClick={() => openNewReport(c)}>
                    <CompanyLogo company={c} />
                    {COMPANY_LABEL[c]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Reports list ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading reports…</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border">
            <FolderOpen className="h-10 w-10 text-muted-foreground/20" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">No reports yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Click "New Report" to process a WEX file</p>
            <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setNewReportOpen(true)}>
              <Plus className="h-3.5 w-3.5" />New Report
            </Button>
          </div>
        ) : (
          reports.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              onDelete={() => handleDeleteReport(r.id)}
              onExportExcel={() => handleExportExcel(r)}
              onExportPdf={() => handleExportPdf(r)}
            />
          ))
        )}
      </div>

      {/* ── Sheets ── */}
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialCompany={company}
      />
      <NewReportSheet
        open={newReportOpen}
        onClose={() => setNewReportOpen(false)}
        company={newReportCompany}
        onSave={handleSaveReport}
      />
    </div>
  )
}
