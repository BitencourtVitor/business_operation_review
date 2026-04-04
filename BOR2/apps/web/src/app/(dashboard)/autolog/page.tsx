"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { useRef, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type TimePolicy = {
  expectedStart: string
  expectedEnd: string
  toleranceEarlyMinutes: number
  toleranceLateMinutes: number
}

type EmployeeDayAggregate = {
  fname: string
  lname: string
  entryMinutes: number
  exitMinutes: number
}

type EmployeeResultRow = {
  name: string
  entryMinutes: number
  exitMinutes: number
  early: boolean
  late: boolean
}

type DayResult = {
  type: "weekday"
  localDate: string
  weekdayLabel: string
  isWeekend: boolean
  policy: { expectedStartMinutes: number; expectedEndMinutes: number; toleranceEarlyMinutes: number; toleranceLateMinutes: number }
  rows: EmployeeResultRow[]
  imageDataUrl?: string
}

type WeekendEmployeeRow = { dayLabel: string; name: string; entryMinutes: number; exitMinutes: number; early: boolean; late: boolean }

type WeekendResult = {
  type: "weekend"
  dates: [string, string]
  label: string
  policy: { expectedStartMinutes: number; expectedEndMinutes: number; toleranceEarlyMinutes: number; toleranceLateMinutes: number }
  rows: WeekendEmployeeRow[]
  imageDataUrl?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, v))
}

async function yieldToUi() {
  await new Promise<void>((r) => setTimeout(r, 0))
}

function normalizeKey(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_")
}

function normalizeKeyLoose(raw: string) {
  return normalizeKey(raw).replace(/_/g, "")
}

function guessDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/).filter(Boolean).slice(0, 5).join("\n")
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let inQ = false
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]
    if (ch === '"') { inQ = !inQ; continue }
    if (!inQ && counts[ch] !== undefined) counts[ch]++
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as "," | ";" | "\t"
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const delim = guessDelimiter(text)
  const allRows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += ch
      continue
    }
    if (ch === '"') { inQ = true; continue }
    if (ch === delim) { row.push(field); field = ""; continue }
    if (ch === "\n") { row.push(field); field = ""; allRows.push(row); row = []; continue }
    if (ch === "\r") { if (text[i + 1] === "\n") continue; row.push(field); field = ""; allRows.push(row); row = []; continue }
    field += ch
  }
  row.push(field)
  if (row.length > 1 || row[0]?.trim()) allRows.push(row)
  const headers = (allRows[0] ?? []).map((h) => h.trim())
  const rows = allRows.slice(1).filter((r) => r.some((c) => c.trim()))
  return { headers, rows }
}

function buildIndexMaps(headers: string[]) {
  const exact = new Map<string, number>()
  const loose = new Map<string, number>()
  headers.forEach((h, i) => { exact.set(normalizeKey(h), i); loose.set(normalizeKeyLoose(h), i) })
  return { exact, loose }
}

function findCol(maps: ReturnType<typeof buildIndexMaps>, candidates: string[]) {
  for (const c of candidates) {
    const e = maps.exact.get(normalizeKey(c))
    if (e !== undefined) return e
    const l = maps.loose.get(normalizeKeyLoose(c))
    if (l !== undefined) return l
  }
  return -1
}

function parseDate(raw: string): string | null {
  const v = raw.trim().split("T")[0].split(" ")[0]
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v)
  if (iso) {
    const [, y, m, d] = iso
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return null
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (slash) {
    const [, m, d, y] = slash
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return null
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  return null
}

function parseTime(raw: string): number | null {
  let v = raw.trim()
  const matches = Array.from(v.matchAll(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/gi))
  const last = matches[matches.length - 1]
  if (last) v = last[0].trim()
  const ampm = /\s*(am|pm)\s*$/i.exec(v)
  if (ampm) {
    const mer = ampm[1].toLowerCase()
    const base = v.replace(/\s*(am|pm)\s*$/i, "").trim().split(":")
    if (base.length < 2) return null
    let h = +base[0]; const m = +base[1]
    if (h < 1 || h > 12 || m < 0 || m > 59) return null
    if (mer === "am") { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
    return h * 60 + m
  }
  const parts = v.split(":").map(Number)
  if (parts.length < 2 || parts.some(Number.isNaN)) return null
  const [h, m] = parts
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function fmtTime(minutes: number) {
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const mer = h24 >= 12 ? "PM" : "AM"
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${mer}`
}

function dayOfWeek(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`).getDay()
  return Number.isFinite(d) ? d : null
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// ─── Canvas PNG rendering ─────────────────────────────────────────────────────

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function renderDayPng(day: DayResult): string {
  const bg = cssVar("--background", "#ffffff")
  const card = cssVar("--muted", "#f5f5f5")
  const textP = cssVar("--foreground", "#111827")
  const textS = cssVar("--muted-foreground", "#6b7280")
  const border = cssVar("--border", "#e5e7eb")
  const neg = "#DC3545"
  const isDark = document.documentElement.classList.contains("dark")
  const stripe = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"

  const W = 1200, pad = 54, hdrH = 110, tGap = 18, tHdrH = 52, rowH = 56, btm = 28
  const rows = day.rows.length
  const H = pad * 2 + hdrH + tGap + tHdrH + Math.max(1, rows) * rowH + btm

  const canvas = document.createElement("canvas")
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  rrect(ctx, pad, pad, W - pad * 2, H - pad * 2, 16)
  ctx.fillStyle = card; ctx.fill()
  ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke()

  const titleY = pad + 66
  ctx.fillStyle = textP; ctx.font = "800 34px Inter,system-ui,sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
  ctx.fillText("Auto-Log", pad + 28, titleY)
  ctx.fillStyle = textS; ctx.font = "700 16px Inter,system-ui,sans-serif"; ctx.textAlign = "right"
  ctx.fillText(`${day.localDate} • ${day.weekdayLabel}`, pad + W - pad * 2 - 28, titleY)

  const divY = pad + hdrH
  ctx.strokeStyle = border; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(pad + 22, divY); ctx.lineTo(W - pad - 22, divY); ctx.stroke()

  const tX = pad + 22, tY = divY + tGap, tW = W - pad * 2 - 44
  rrect(ctx, tX, tY, tW, tHdrH + Math.max(1, rows) * rowH, 12)
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke()

  const nF = 0.58, iF = 0.14, oF = 0.14
  const colN = tX + 18, colI = tX + Math.floor(tW * nF), colO = tX + Math.floor(tW * (nF + iF))
  const colS = tX + Math.floor(tW * (nF + iF + oF))
  const iR = colI - 18, oR = colO - 18, sR = tX + tW - 18
  const sW = sR - colS

  ctx.fillStyle = textS; ctx.font = "800 13px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
  ctx.fillText("EMPLOYEE", colN, tY + 32); ctx.fillText("IN", colI, tY + 32)
  ctx.fillText("OUT", colO, tY + 32); ctx.fillText("STATUS", colS, tY + 32)
  ctx.strokeStyle = border; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(tX + 10, tY + tHdrH); ctx.lineTo(tX + tW - 10, tY + tHdrH); ctx.stroke()

  if (rows === 0) {
    ctx.fillStyle = textS; ctx.font = "700 16px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
    ctx.fillText("No employees out of range", tX + 18, tY + tHdrH + 36)
  } else {
    for (let i = 0; i < rows; i++) {
      const r = day.rows[i]; const y = tY + tHdrH + i * rowH
      if (i % 2 === 1) { ctx.fillStyle = stripe; ctx.fillRect(tX + 1, y, tW - 2, rowH) }
      const alert = r.early || r.late
      ctx.fillStyle = alert ? neg : textP; ctx.font = "700 18px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
      ctx.fillText(r.name, colN, y + 36)
      ctx.fillStyle = r.early ? neg : textP; ctx.font = "800 16px Inter,system-ui,sans-serif"; ctx.textAlign = "right"
      ctx.fillText(fmtTime(r.entryMinutes), iR, y + 36)
      ctx.fillStyle = r.late ? neg : textP; ctx.textAlign = "right"
      ctx.fillText(fmtTime(r.exitMinutes), oR, y + 36)
      const badge = r.early && r.late ? "EARLY + LATE" : r.early ? "EARLY" : r.late ? "LATE" : ""
      if (badge) {
        const bH = 28; ctx.font = "900 12px Inter,system-ui,sans-serif"
        const bTW = ctx.measureText(badge).width
        const bW = Math.min(sW - 12, Math.max(78, bTW + 20))
        const bX = colS + Math.floor((sW - bW) / 2); const bY = y + Math.floor((rowH - bH) / 2)
        rrect(ctx, bX, bY, bW, bH, 14)
        ctx.fillStyle = "rgba(220,53,69,0.14)"; ctx.fill()
        ctx.strokeStyle = neg; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = neg; ctx.textAlign = "center"
        ctx.fillText(badge, bX + Math.floor(bW / 2), bY + 19)
      }
    }
  }
  return canvas.toDataURL("image/png")
}

function renderWeekendPng(wk: WeekendResult): string {
  const bg = cssVar("--background", "#ffffff")
  const card = cssVar("--muted", "#f5f5f5")
  const textP = cssVar("--foreground", "#111827")
  const textS = cssVar("--muted-foreground", "#6b7280")
  const border = cssVar("--border", "#e5e7eb")
  const neg = "#DC3545"
  const isDark = document.documentElement.classList.contains("dark")
  const stripe = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"

  const W = 1200, pad = 54, hdrH = 110, tGap = 18, tHdrH = 52, rowH = 56, btm = 28
  const rows = wk.rows.length
  const H = pad * 2 + hdrH + tGap + tHdrH + Math.max(1, rows) * rowH + btm

  const canvas = document.createElement("canvas")
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  rrect(ctx, pad, pad, W - pad * 2, H - pad * 2, 16)
  ctx.fillStyle = card; ctx.fill()
  ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke()

  const titleY = pad + 66
  ctx.fillStyle = textP; ctx.font = "800 34px Inter,system-ui,sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
  ctx.fillText("Auto-Log", pad + 28, titleY)
  ctx.fillStyle = textS; ctx.font = "700 16px Inter,system-ui,sans-serif"; ctx.textAlign = "right"
  ctx.fillText(`${wk.dates[0]} & ${wk.dates[1]} • Saturday & Sunday`, pad + W - pad * 2 - 28, titleY)

  const divY = pad + hdrH
  ctx.strokeStyle = border; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(pad + 22, divY); ctx.lineTo(W - pad - 22, divY); ctx.stroke()

  const tX = pad + 22, tY = divY + tGap, tW = W - pad * 2 - 44
  rrect(ctx, tX, tY, tW, tHdrH + Math.max(1, rows) * rowH, 12)
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke()

  const dF = 0.16, nF = 0.42, iF = 0.14, oF = 0.14
  const colD = tX + 18, colN = tX + Math.floor(tW * dF)
  const colI = tX + Math.floor(tW * (dF + nF)), colO = tX + Math.floor(tW * (dF + nF + iF))
  const colS = tX + Math.floor(tW * (dF + nF + iF + oF))
  const iR = colI - 18, oR = colO - 18, sR = tX + tW - 18, sW = sR - colS

  ctx.fillStyle = textS; ctx.font = "800 13px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
  ctx.fillText("DAY", colD, tY + 32); ctx.fillText("EMPLOYEE", colN, tY + 32)
  ctx.fillText("IN", colI, tY + 32); ctx.fillText("OUT", colO, tY + 32); ctx.fillText("STATUS", colS, tY + 32)
  ctx.strokeStyle = border; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(tX + 10, tY + tHdrH); ctx.lineTo(tX + tW - 10, tY + tHdrH); ctx.stroke()

  if (rows === 0) {
    ctx.fillStyle = textS; ctx.font = "700 16px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
    ctx.fillText("No employees out of range", tX + 18, tY + tHdrH + 36)
  } else {
    for (let i = 0; i < rows; i++) {
      const r = wk.rows[i]; const y = tY + tHdrH + i * rowH
      if (i % 2 === 1) { ctx.fillStyle = stripe; ctx.fillRect(tX + 1, y, tW - 2, rowH) }
      const alert = r.early || r.late
      ctx.fillStyle = textS; ctx.font = "800 13px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
      ctx.fillText(r.dayLabel, colD, y + 36)
      ctx.fillStyle = alert ? neg : textP; ctx.font = "700 18px Inter,system-ui,sans-serif"; ctx.textAlign = "left"
      ctx.fillText(r.name, colN, y + 36)
      ctx.fillStyle = r.early ? neg : textP; ctx.font = "800 16px Inter,system-ui,sans-serif"; ctx.textAlign = "right"
      ctx.fillText(fmtTime(r.entryMinutes), iR, y + 36)
      ctx.fillStyle = r.late ? neg : textP; ctx.textAlign = "right"
      ctx.fillText(fmtTime(r.exitMinutes), oR, y + 36)
      const badge = r.early && r.late ? "EARLY + LATE" : r.early ? "EARLY" : r.late ? "LATE" : ""
      if (badge) {
        const bH = 28; ctx.font = "900 12px Inter,system-ui,sans-serif"
        const bTW = ctx.measureText(badge).width
        const bW = Math.min(sW - 12, Math.max(78, bTW + 20))
        const bX = colS + Math.floor((sW - bW) / 2); const bY = y + Math.floor((rowH - bH) / 2)
        rrect(ctx, bX, bY, bW, bH, 14)
        ctx.fillStyle = "rgba(220,53,69,0.14)"; ctx.fill()
        ctx.strokeStyle = neg; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = neg; ctx.textAlign = "center"
        ctx.fillText(badge, bX + Math.floor(bW / 2), bY + 19)
      }
    }
  }
  return canvas.toDataURL("image/png")
}

// ─── Policy Input ─────────────────────────────────────────────────────────────

function PolicyForm({ label, policy, onChange }: { label: string; policy: TimePolicy; onChange: (p: TimePolicy) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Expected Start</Label>
          <Input
            value={policy.expectedStart}
            onChange={(e) => onChange({ ...policy, expectedStart: e.target.value })}
            placeholder="07:00 AM"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expected End</Label>
          <Input
            value={policy.expectedEnd}
            onChange={(e) => onChange({ ...policy, expectedEnd: e.target.value })}
            placeholder="05:00 PM"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Early tolerance (min)</Label>
          <Input
            type="number"
            min={0}
            value={policy.toleranceEarlyMinutes}
            onChange={(e) => onChange({ ...policy, toleranceEarlyMinutes: +e.target.value || 0 })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Late tolerance (min)</Label>
          <Input
            type="number"
            min={0}
            value={policy.toleranceLateMinutes}
            onChange={(e) => onChange({ ...policy, toleranceLateMinutes: +e.target.value || 0 })}
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutoLogPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [csvText, setCsvText] = useState("")
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [stage, setStage] = useState("")
  const [results, setResults] = useState<(DayResult | WeekendResult)[]>([])

  const [wdPolicy, setWdPolicy] = useState<TimePolicy>({
    expectedStart: "07:00 AM",
    expectedEnd: "05:00 PM",
    toleranceEarlyMinutes: 0,
    toleranceLateMinutes: 0,
  })
  const [wePolicy, setWePolicy] = useState<TimePolicy>({
    expectedStart: "08:00 AM",
    expectedEnd: "05:00 PM",
    toleranceEarlyMinutes: 0,
    toleranceLateMinutes: 0,
  })

  async function pickFile(file: File | null) {
    setError(""); setResults([])
    setFileName(file?.name ?? "")
    if (!file) { setCsvText(""); return }
    setCsvText(await file.text())
  }

  function downloadPng(dataUrl: string, name: string) {
    const a = document.createElement("a")
    a.href = dataUrl; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
  }

  async function process() {
    setProcessing(true); setStage("Starting...")
    try {
      setError(""); setResults([])
      await yieldToUi()

      setStage("Parsing CSV...")
      const { headers, rows: csvRows } = parseCsv(csvText)
      const maps = buildIndexMaps(headers)

      const iDate = findCol(maps, ["local_date", "local date", "date"])
      const iFname = findCol(maps, ["fname", "first_name", "first name", "first"])
      const iLname = findCol(maps, ["lname", "last_name", "last name", "last"])
      const iStart = findCol(maps, ["local_start_time", "local start time", "start_time", "start time"])
      const iEnd = findCol(maps, ["local_end_time", "local end time", "end_time", "end time"])

      const missing: string[] = []
      if (iDate < 0) missing.push("local_date")
      if (iFname < 0) missing.push("fname")
      if (iLname < 0) missing.push("lname")
      if (iStart < 0) missing.push("local_start_time")
      if (iEnd < 0) missing.push("local_end_time")
      if (missing.length) { setError(`Required columns not found: ${missing.join(", ")}`); return }

      setStage("Aggregating...")
      await yieldToUi()
      const agg = new Map<string, EmployeeDayAggregate>()
      let validDate = 0, validName = 0, validTime = 0, total = csvRows.length
      for (const r of csvRows) {
        const dateIso = parseDate(r[iDate] ?? "")
        if (!dateIso) continue; validDate++
        const fname = (r[iFname] ?? "").trim(), lname = (r[iLname] ?? "").trim()
        if (!fname && !lname) continue; validName++
        const start = parseTime(r[iStart] ?? ""), end = parseTime(r[iEnd] ?? "")
        if (start == null || end == null) continue; validTime++
        const key = `${dateIso}__${fname.toLowerCase()}__${lname.toLowerCase()}`
        const prev = agg.get(key)
        agg.set(key, prev
          ? { fname: prev.fname, lname: prev.lname, entryMinutes: Math.min(prev.entryMinutes, start), exitMinutes: Math.max(prev.exitMinutes, end) }
          : { fname, lname, entryMinutes: start, exitMinutes: end }
        )
      }

      if (!agg.size) {
        setError(`No valid rows found. Total: ${total} | Valid date: ${validDate} | Valid name: ${validName} | Valid time: ${validTime}`)
        return
      }

      setStage("Grouping by date...")
      await yieldToUi()
      const byDate = new Map<string, EmployeeDayAggregate[]>()
      for (const [key, a] of agg.entries()) {
        const d = key.split("__")[0]
        const list = byDate.get(d) ?? []
        list.push(a); byDate.set(d, list)
      }

      const wdStart = parseTime(wdPolicy.expectedStart)!
      const wdEnd = parseTime(wdPolicy.expectedEnd)!
      const weStart = parseTime(wePolicy.expectedStart)!
      const weEnd = parseTime(wePolicy.expectedEnd)!

      if (wdStart == null || wdEnd == null || weStart == null || weEnd == null) {
        setError("Invalid time policy values"); return
      }

      setStage("Building results...")
      await yieldToUi()
      const out: (DayResult | WeekendResult)[] = []
      const consumed = new Set<string>()
      const sorted = Array.from(byDate.keys()).sort()

      for (const iso of sorted) {
        if (consumed.has(iso)) continue
        const dow = dayOfWeek(iso)
        if (dow == null) continue

        const isWeekend = dow === 0 || dow === 6

        if (!isWeekend) {
          // weekday
          const tolEarly = clamp(wdPolicy.toleranceEarlyMinutes, 0, 600)
          const tolLate = clamp(wdPolicy.toleranceLateMinutes, 0, 600)
          const rows = (byDate.get(iso) ?? [])
            .map<EmployeeResultRow>((e) => {
              const name = `${e.fname} ${e.lname}`.trim()
              return { name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < wdStart - tolEarly, late: e.exitMinutes > wdEnd + tolLate }
            })
            .filter((r) => r.early || r.late)
            .sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: iso, weekdayLabel: WEEKDAY_LABELS[dow], isWeekend: false, policy: { expectedStartMinutes: wdStart, expectedEndMinutes: wdEnd, toleranceEarlyMinutes: tolEarly, toleranceLateMinutes: tolLate }, rows }
          day.imageDataUrl = renderDayPng(day)
          out.push(day)
          continue
        }

        if (dow === 6) {
          // Saturday — try to pair with Sunday
          const sunIso = addDays(iso, 1)
          const hasSun = dayOfWeek(sunIso) === 0 && byDate.has(sunIso)
          const tolEarly = clamp(wePolicy.toleranceEarlyMinutes, 0, 600)
          const tolLate = clamp(wePolicy.toleranceLateMinutes, 0, 600)

          if (hasSun) {
            const satRows = (byDate.get(iso) ?? []).map<WeekendEmployeeRow>((e) => ({ dayLabel: "Saturday", name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolEarly, late: e.exitMinutes > weEnd + tolLate })).filter((r) => r.early || r.late)
            const sunRows = (byDate.get(sunIso) ?? []).map<WeekendEmployeeRow>((e) => ({ dayLabel: "Sunday", name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolEarly, late: e.exitMinutes > weEnd + tolLate })).filter((r) => r.early || r.late)
            const rows = [...satRows, ...sunRows].sort((a, b) => a.dayLabel === b.dayLabel ? a.name.localeCompare(b.name) : a.dayLabel.localeCompare(b.dayLabel))
            const wknd: WeekendResult = { type: "weekend", dates: [iso, sunIso], label: "Saturday & Sunday", policy: { expectedStartMinutes: weStart, expectedEndMinutes: weEnd, toleranceEarlyMinutes: tolEarly, toleranceLateMinutes: tolLate }, rows }
            wknd.imageDataUrl = renderWeekendPng(wknd)
            out.push(wknd); consumed.add(iso); consumed.add(sunIso)
            continue
          }

          const rows = (byDate.get(iso) ?? []).map<EmployeeResultRow>((e) => ({ name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolEarly, late: e.exitMinutes > weEnd + tolLate })).filter((r) => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: iso, weekdayLabel: "Saturday", isWeekend: true, policy: { expectedStartMinutes: weStart, expectedEndMinutes: weEnd, toleranceEarlyMinutes: tolEarly, toleranceLateMinutes: tolLate }, rows }
          day.imageDataUrl = renderDayPng(day)
          out.push(day)
          continue
        }

        if (dow === 0) {
          // Sunday without paired Saturday
          const tolEarly = clamp(wePolicy.toleranceEarlyMinutes, 0, 600)
          const tolLate = clamp(wePolicy.toleranceLateMinutes, 0, 600)
          const rows = (byDate.get(iso) ?? []).map<EmployeeResultRow>((e) => ({ name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolEarly, late: e.exitMinutes > weEnd + tolLate })).filter((r) => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: iso, weekdayLabel: "Sunday", isWeekend: true, policy: { expectedStartMinutes: weStart, expectedEndMinutes: weEnd, toleranceEarlyMinutes: tolEarly, toleranceLateMinutes: tolLate }, rows }
          day.imageDataUrl = renderDayPng(day)
          out.push(day)
        }
      }

      setResults(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error")
    } finally {
      setProcessing(false); setStage("")
    }
  }

  const totalAlerts = results.reduce((acc, r) => acc + r.rows.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">AutoLog</h1>
        <p className="text-sm text-muted-foreground">CSV attendance analysis — flags early arrivals and late departures</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Left: upload + process */}
        <div className="space-y-4">
          {/* Drop zone */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Upload CSV</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                role="button"
                tabIndex={0}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition-colors cursor-pointer ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"} ${processing ? "pointer-events-none opacity-50" : ""}`}
                onDragEnter={(e) => { e.preventDefault(); if (!processing) setDragging(true) }}
                onDragOver={(e) => { e.preventDefault(); if (!processing) setDragging(true) }}
                onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (!processing) void pickFile(e.dataTransfer.files?.[0] ?? null) }}
                onClick={() => { if (!processing) fileRef.current?.click() }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click() }}
              >
                <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                {fileName ? (
                  <p className="text-sm font-medium">{fileName}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">Drag & drop your CSV here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} disabled={processing} />
              </div>
            </CardContent>
          </Card>

          {/* Process button + error */}
          <div className="flex items-center gap-3">
            <Button onClick={process} disabled={!csvText.trim() || processing}>
              {processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{stage}</> : <><FileSpreadsheet className="mr-2 h-4 w-4" />Analyze</>}
            </Button>
            {csvText && !processing && (
              <Button variant="ghost" size="sm" onClick={() => { setCsvText(""); setFileName(""); setResults([]); setError("") }}>
                Clear
              </Button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right: policy */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Policy</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <PolicyForm label="Weekdays (Mon–Fri)" policy={wdPolicy} onChange={setWdPolicy} />
              <div className="border-t" />
              <PolicyForm label="Weekends (Sat–Sun)" policy={wePolicy} onChange={setWePolicy} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Results — {results.length} day{results.length !== 1 ? "s" : ""}
              {totalAlerts > 0 && <Badge variant="destructive" className="ml-2">{totalAlerts} alert{totalAlerts !== 1 ? "s" : ""}</Badge>}
            </h2>
          </div>

          {results.map((r, i) => {
            const title = r.type === "weekend" ? `${r.dates[0]} & ${r.dates[1]} — Saturday & Sunday` : `${r.localDate} — ${r.weekdayLabel}`
            const fileName = r.type === "weekend" ? `autolog-${r.dates[0]}-weekend.png` : `autolog-${r.localDate}-${r.weekdayLabel.toLowerCase()}.png`

            return (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm font-medium">{title}</CardTitle>
                  <div className="flex items-center gap-2">
                    {r.rows.length === 0
                      ? <Badge variant="outline" className="text-green-600 border-green-300">All clear</Badge>
                      : <Badge variant="destructive">{r.rows.length} alert{r.rows.length !== 1 ? "s" : ""}</Badge>
                    }
                    {r.imageDataUrl && (
                      <Button variant="outline" size="sm" onClick={() => downloadPng(r.imageDataUrl!, fileName)}>
                        <Download className="mr-1.5 h-3.5 w-3.5" />PNG
                      </Button>
                    )}
                  </div>
                </CardHeader>
                {r.rows.length > 0 && (
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {r.type === "weekend" && <TableHead>Day</TableHead>}
                          <TableHead>Employee</TableHead>
                          <TableHead>In</TableHead>
                          <TableHead>Out</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.rows.map((row, j) => (
                          <TableRow key={j}>
                            {r.type === "weekend" && <TableCell className="text-sm text-muted-foreground">{(row as WeekendEmployeeRow).dayLabel}</TableCell>}
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className={`text-sm ${row.early ? "text-destructive font-semibold" : ""}`}>{fmtTime(row.entryMinutes)}</TableCell>
                            <TableCell className={`text-sm ${row.late ? "text-destructive font-semibold" : ""}`}>{fmtTime(row.exitMinutes)}</TableCell>
                            <TableCell>
                              {row.early && row.late
                                ? <Badge variant="destructive">Early + Late</Badge>
                                : row.early
                                  ? <Badge variant="destructive">Early</Badge>
                                  : <Badge variant="destructive">Late</Badge>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
