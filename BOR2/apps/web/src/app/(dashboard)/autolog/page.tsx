"use client"

import { useRef, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Download, FolderOpen, Loader2, Upload } from "lucide-react"

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
  weekdayIndex: number
  weekdayLabel: string
  isWeekend: boolean
  policy: { expectedStartMinutes: number; expectedEndMinutes: number; toleranceEarlyMinutes: number; toleranceLateMinutes: number }
  rows: EmployeeResultRow[]
  imageDataUrl?: string
}

type WeekendEmployeeRow = {
  dayLabel: string
  name: string
  entryMinutes: number
  exitMinutes: number
  early: boolean
  late: boolean
}

type WeekendResult = {
  type: "weekend"
  dates: [string, string]
  label: string
  policy: { expectedStartMinutes: number; expectedEndMinutes: number; toleranceEarlyMinutes: number; toleranceLateMinutes: number }
  rows: WeekendEmployeeRow[]
  imageDataUrl?: string
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clampNumber(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, v))
}

async function yieldToUi() {
  await new Promise<void>((r) => setTimeout(r, 0))
}

function normalizeHeaderKey(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_")
}

function normalizeHeaderKeyLoose(raw: string) {
  return normalizeHeaderKey(raw).replace(/_/g, "")
}

function guessDelimiter(text: string): "," | ";" | "\t" {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 5)
  const sample = lines.join("\n")
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let inQuotes = false
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]
    if (ch === '"') { if (inQuotes && sample[i + 1] === '"') { i++; continue } inQuotes = !inQuotes; continue }
    if (!inQuotes && ch in counts) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return (best?.[0] as "," | ";" | "\t") || ","
}

function parseCsv(text: string) {
  const delimiter = guessDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const pushField = () => { row.push(field); field = "" }
  const pushRow = () => { rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false } }
      else { field += ch }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === delimiter) { pushField(); continue }
    if (ch === "\n") { pushField(); pushRow(); continue }
    if (ch === "\r") { if (text[i + 1] === "\n") continue; pushField(); pushRow(); continue }
    field += ch
  }
  pushField()
  if (row.length > 1 || row[0]?.trim() !== "") pushRow()
  const headers = (rows[0] || []).map((h) => h.trim())
  const data = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""))
  return { headers, rows: data }
}

function parseLocalDateToIso(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const s = v.split("T")[0].split(" ")[0].trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) { const [, y, m, d] = iso; return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (slash) { const [, m, d, y] = slash; return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` }
  const dash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
  if (dash) { const [, m, d, y] = dash; return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` }
  return null
}

function getWeekdayIndex(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`)
  const day = d.getDay()
  return Number.isFinite(day) ? day : null
}

function weekdayLabel(idx: number) {
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][idx] || ""
}

function parseTimeToMinutes(raw: string): number | null {
  let v = raw.trim()
  if (!v) return null
  const matches = Array.from(v.matchAll(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/gi))
  const last = matches[matches.length - 1]
  if (last) v = last[0].trim()
  const ampm = /\s*(am|pm)\s*$/i.exec(v)
  if (ampm) {
    const mer = ampm[1].toLowerCase()
    const base = v.replace(/\s*(am|pm)\s*$/i, "").trim()
    const parts = base.split(":").map((p) => p.trim())
    if (parts.length < 2) return null
    const h0 = Number(parts[0]); const m0 = Number(parts[1])
    if (!Number.isFinite(h0) || !Number.isFinite(m0)) return null
    if (h0 < 1 || h0 > 12 || m0 < 0 || m0 > 59) return null
    let h = h0
    if (mer === "am") { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
    return h * 60 + m0
  }
  const parts = v.split(":").map((p) => p.trim())
  if (parts.length < 2) return null
  const h = Number(parts[0]); const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function formatMinutesToTime(minutes: number) {
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const mer = h24 >= 12 ? "PM" : "AM"
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2,"0")}:${String(m).padStart(2,"0")} ${mer}`
}

function addDaysIso(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function getThemeColors() {
  const isDark = document.documentElement.classList.contains("dark")
  return {
    bg:          isDark ? "#0a0a0a" : "#ffffff",
    cardBg:      isDark ? "#141414" : "#f8f8f8",
    textPrimary: isDark ? "#fafafa" : "#111827",
    textSecondary: isDark ? "#9ca3af" : "#6b7280",
    border:      isDark ? "#262626" : "#e5e7eb",
    stripe:      isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    negative:    "#DC3545",
  }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function renderDayToPngDataUrl(day: DayResult): string {
  const { bg, cardBg, textPrimary, textSecondary, border, stripe, negative } = getThemeColors()
  const width = 1200, padding = 54, headerHeight = 110, tableTopGap = 18
  const tableHeaderHeight = 52, rowHeight = 56, bottomGap = 28
  const rows = day.rows.length
  const height = padding * 2 + headerHeight + tableTopGap + tableHeaderHeight + Math.max(1, rows) * rowHeight + bottomGap
  const canvas = document.createElement("canvas")
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height)
  const [cX, cY, cW, cH] = [padding, padding, width - padding * 2, height - padding * 2]
  drawRoundedRect(ctx, cX, cY, cW, cH, 16); ctx.fillStyle = cardBg; ctx.fill()
  ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke()
  const titleY = cY + 66
  ctx.fillStyle = textPrimary; ctx.font = "800 34px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("Auto-Log", cX + 28, titleY)
  ctx.fillStyle = textSecondary; ctx.font = "700 16px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
  ctx.textAlign = "right"; ctx.fillText(`${day.localDate} • ${day.weekdayLabel}`, cX + cW - 28, titleY)
  const dividerY = cY + headerHeight
  ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.beginPath()
  ctx.moveTo(cX + 22, dividerY); ctx.lineTo(cX + cW - 22, dividerY); ctx.stroke()
  const tX = cX + 22, tY = dividerY + tableTopGap, tW = cW - 44
  drawRoundedRect(ctx, tX, tY, tW, tableHeaderHeight + Math.max(1, rows) * rowHeight, 12)
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke()
  const nameFrac = 0.58, inFrac = 0.14, outFrac = 0.14
  const colNameX = tX + 18, inLeftX = tX + Math.floor(tW * nameFrac)
  const outLeftX = tX + Math.floor(tW * (nameFrac + inFrac))
  const statusLeftX = tX + Math.floor(tW * (nameFrac + inFrac + outFrac))
  const inRightX = inLeftX - 18, outRightX = outLeftX - 18, statusRightX = tX + tW - 18
  const statusWidth = statusRightX - statusLeftX
  ctx.fillStyle = textSecondary; ctx.font = "800 13px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
  ctx.textAlign = "left";  ctx.fillText("EMPLOYEE", colNameX, tY + 32)
  ctx.textAlign = "right"; ctx.fillText("IN", inRightX, tY + 32)
  ctx.textAlign = "right"; ctx.fillText("OUT", outRightX, tY + 32)
  ctx.textAlign = "left";  ctx.fillText("STATUS", statusLeftX + Math.floor(statusWidth / 2) - Math.floor(ctx.measureText("STATUS").width / 2), tY + 32)
  ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.beginPath()
  ctx.moveTo(tX + 10, tY + tableHeaderHeight); ctx.lineTo(tX + tW - 10, tY + tableHeaderHeight); ctx.stroke()
  if (rows === 0) {
    ctx.fillStyle = textSecondary; ctx.font = "700 16px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
    ctx.textAlign = "left"; ctx.fillText("No employees out of range", tX + 18, tY + tableHeaderHeight + 36)
  } else {
    for (let i = 0; i < rows; i++) {
      const r = day.rows[i]; const y = tY + tableHeaderHeight + i * rowHeight
      if (i % 2 === 1) { ctx.fillStyle = stripe; ctx.fillRect(tX + 1, y, tW - 2, rowHeight) }
      ctx.fillStyle = r.early || r.late ? negative : textPrimary
      ctx.font = "700 18px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
      ctx.textAlign = "left"; ctx.fillText(r.name, colNameX, y + 36)
      ctx.fillStyle = r.early ? negative : textPrimary; ctx.font = "800 16px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
      ctx.textAlign = "right"; ctx.fillText(formatMinutesToTime(r.entryMinutes), inRightX, y + 36)
      ctx.fillStyle = r.late ? negative : textPrimary; ctx.fillText(formatMinutesToTime(r.exitMinutes), outRightX, y + 36)
      const badge = r.early && r.late ? "EARLY + LATE" : r.early ? "EARLY" : r.late ? "LATE" : ""
      if (badge) {
        const badgeH = 28; ctx.font = "900 12px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
        const badgeW = Math.min(statusWidth - 12, Math.max(78, ctx.measureText(badge).width + 20))
        const badgeX = statusLeftX + Math.floor((statusWidth - badgeW) / 2)
        const badgeY = y + Math.floor((rowHeight - badgeH) / 2)
        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14)
        ctx.fillStyle = "rgba(220,53,69,0.14)"; ctx.fill()
        ctx.strokeStyle = negative; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = negative; ctx.textAlign = "center"
        ctx.fillText(badge, badgeX + Math.floor(badgeW / 2), badgeY + 19)
      }
    }
  }
  return canvas.toDataURL("image/png")
}

function renderWeekendToPngDataUrl(weekend: WeekendResult): string {
  const { bg, cardBg, textPrimary, textSecondary, border, stripe, negative } = getThemeColors()
  const width = 1200, padding = 54, headerHeight = 110, tableTopGap = 18
  const tableHeaderHeight = 52, rowHeight = 56, bottomGap = 28
  const rows = weekend.rows.length
  const height = padding * 2 + headerHeight + tableTopGap + tableHeaderHeight + Math.max(1, rows) * rowHeight + bottomGap
  const canvas = document.createElement("canvas")
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height)
  const [cX, cY, cW, cH] = [padding, padding, width - padding * 2, height - padding * 2]
  drawRoundedRect(ctx, cX, cY, cW, cH, 16); ctx.fillStyle = cardBg; ctx.fill()
  ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke()
  const titleY = cY + 66
  ctx.fillStyle = textPrimary; ctx.font = "800 34px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("Auto-Log", cX + 28, titleY)
  ctx.fillStyle = textSecondary; ctx.font = "700 16px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
  ctx.textAlign = "right"; ctx.fillText(`${weekend.dates[0]} & ${weekend.dates[1]} • Saturday & Sunday`, cX + cW - 28, titleY)
  const dividerY = cY + headerHeight
  ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.beginPath()
  ctx.moveTo(cX + 22, dividerY); ctx.lineTo(cX + cW - 22, dividerY); ctx.stroke()
  const tX = cX + 22, tY = dividerY + tableTopGap, tW = cW - 44
  drawRoundedRect(ctx, tX, tY, tW, tableHeaderHeight + Math.max(1, rows) * rowHeight, 12)
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke()
  const dayFrac = 0.16, nameFrac = 0.42, inFrac = 0.14, outFrac = 0.14
  const colDayX = tX + 18, nameLeftX = tX + Math.floor(tW * dayFrac)
  const inLeftX = tX + Math.floor(tW * (dayFrac + nameFrac))
  const outLeftX = tX + Math.floor(tW * (dayFrac + nameFrac + inFrac))
  const statusLeftX = tX + Math.floor(tW * (dayFrac + nameFrac + inFrac + outFrac))
  const inRightX = inLeftX - 18, outRightX = outLeftX - 18, statusRightX = tX + tW - 18
  const statusWidth = statusRightX - statusLeftX
  ctx.fillStyle = textSecondary; ctx.font = "800 13px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
  ctx.textAlign = "left";  ctx.fillText("DAY", colDayX, tY + 32)
  ctx.textAlign = "left";  ctx.fillText("EMPLOYEE", nameLeftX, tY + 32)
  ctx.textAlign = "right"; ctx.fillText("IN", inRightX, tY + 32)
  ctx.textAlign = "right"; ctx.fillText("OUT", outRightX, tY + 32)
  ctx.textAlign = "left";  ctx.fillText("STATUS", statusLeftX + Math.floor(statusWidth / 2) - Math.floor(ctx.measureText("STATUS").width / 2), tY + 32)
  ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.beginPath()
  ctx.moveTo(tX + 10, tY + tableHeaderHeight); ctx.lineTo(tX + tW - 10, tY + tableHeaderHeight); ctx.stroke()
  if (rows === 0) {
    ctx.fillStyle = textSecondary; ctx.font = "700 16px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
    ctx.textAlign = "left"; ctx.fillText("No employees out of range", tX + 18, tY + tableHeaderHeight + 36)
  } else {
    for (let i = 0; i < rows; i++) {
      const r = weekend.rows[i]; const y = tY + tableHeaderHeight + i * rowHeight
      if (i % 2 === 1) { ctx.fillStyle = stripe; ctx.fillRect(tX + 1, y, tW - 2, rowHeight) }
      ctx.fillStyle = textSecondary; ctx.font = "800 13px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
      ctx.textAlign = "left"; ctx.fillText(r.dayLabel, colDayX, y + 36)
      ctx.fillStyle = r.early || r.late ? negative : textPrimary
      ctx.font = "700 18px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
      ctx.fillText(r.name, nameLeftX, y + 36)
      ctx.fillStyle = r.early ? negative : textPrimary; ctx.font = "800 16px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
      ctx.textAlign = "right"; ctx.fillText(formatMinutesToTime(r.entryMinutes), inRightX, y + 36)
      ctx.fillStyle = r.late ? negative : textPrimary; ctx.fillText(formatMinutesToTime(r.exitMinutes), outRightX, y + 36)
      const badge = r.early && r.late ? "EARLY + LATE" : r.early ? "EARLY" : r.late ? "LATE" : ""
      if (badge) {
        const badgeH = 28; ctx.font = "900 12px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial"
        const badgeW = Math.min(statusWidth - 12, Math.max(78, ctx.measureText(badge).width + 20))
        const badgeX = statusLeftX + Math.floor((statusWidth - badgeW) / 2)
        const badgeY = y + Math.floor((rowHeight - badgeH) / 2)
        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14)
        ctx.fillStyle = "rgba(220,53,69,0.14)"; ctx.fill()
        ctx.strokeStyle = negative; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = negative; ctx.textAlign = "center"
        ctx.fillText(badge, badgeX + Math.floor(badgeW / 2), badgeY + 19)
      }
    }
  }
  return canvas.toDataURL("image/png")
}

// ─── Input class ──────────────────────────────────────────────────────────────

const inputCls = "h-8 w-full rounded-lg border border-input bg-transparent px-3 py-0 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutoLogPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileName,       setFileName]       = useState("")
  const [csvText,        setCsvText]        = useState("")
  const [parseError,     setParseError]     = useState("")
  const [dayResults,     setDayResults]     = useState<(DayResult | WeekendResult)[]>([])
  const [isProcessing,   setIsProcessing]   = useState(false)
  const [processingStage, setProcessingStage] = useState("")
  const [isDragging,     setIsDragging]     = useState(false)

  const [weekdayPolicy, setWeekdayPolicy] = useState<TimePolicy>({
    expectedStart: "07:00 AM", expectedEnd: "05:00 PM",
    toleranceEarlyMinutes: 0, toleranceLateMinutes: 0,
  })
  const [weekendPolicy, setWeekendPolicy] = useState<TimePolicy>({
    expectedStart: "08:00 AM", expectedEnd: "05:00 PM",
    toleranceEarlyMinutes: 0, toleranceLateMinutes: 0,
  })

  const canProcess = useMemo(() => csvText.trim() !== "" && !isProcessing, [csvText, isProcessing])

  async function onPickFile(file: File | null) {
    setParseError(""); setDayResults([]); setFileName(file?.name || "")
    if (!file) { setCsvText(""); return }
    setCsvText(await file.text())
  }

  function buildMaps(headers: string[]) {
    const exact = new Map<string, number>()
    const loose = new Map<string, number>()
    headers.forEach((h, i) => { exact.set(normalizeHeaderKey(h), i); loose.set(normalizeHeaderKeyLoose(h), i) })
    return { exact, loose }
  }

  function getIdx(maps: ReturnType<typeof buildMaps>, candidates: string[]) {
    for (const c of candidates) {
      const found = maps.exact.get(normalizeHeaderKey(c)) ?? maps.loose.get(normalizeHeaderKeyLoose(c))
      if (found !== undefined) return found
    }
    return -1
  }

  async function process() {
    setIsProcessing(true); setProcessingStage("Starting...")
    try {
      setParseError(""); setDayResults([]); await yieldToUi()
      setProcessingStage("Parsing CSV...")
      const parsed = parseCsv(csvText)
      const maps = buildMaps(parsed.headers)
      const idxDate  = getIdx(maps, ["local_date","local date","date"])
      const idxFName = getIdx(maps, ["fname","first_name","first name","first"])
      const idxLName = getIdx(maps, ["lname","last_name","last name","last"])
      const idxStart = getIdx(maps, ["local_start_time","local start time","start_time","start time"])
      const idxEnd   = getIdx(maps, ["local_end_time","local end time","end_time","end time"])
      const missing: string[] = []
      if (idxDate < 0) missing.push("local_date")
      if (idxFName < 0) missing.push("fname")
      if (idxLName < 0) missing.push("lname")
      if (idxStart < 0) missing.push("local_start_time")
      if (idxEnd < 0) missing.push("local_end_time")
      if (missing.length > 0) { setParseError(`Required columns not found: ${missing.join(", ")}`); return }

      await yieldToUi(); setProcessingStage("Aggregating per employee/day...")
      const aggregates = new Map<string, EmployeeDayAggregate>()
      let validDate = 0, validName = 0, validTimes = 0
      for (const r of parsed.rows) {
        const dateIso = parseLocalDateToIso(r[idxDate] || ""); if (!dateIso) continue; validDate++
        const fname = (r[idxFName] || "").trim(), lname = (r[idxLName] || "").trim()
        if (!fname && !lname) continue; validName++
        const start = parseTimeToMinutes(r[idxStart] || ""), end = parseTimeToMinutes(r[idxEnd] || "")
        if (start == null || end == null) continue; validTimes++
        const key = `${dateIso}__${fname.toLowerCase()}__${lname.toLowerCase()}`
        const prev = aggregates.get(key)
        if (!prev) aggregates.set(key, { fname, lname, entryMinutes: start, exitMinutes: end })
        else aggregates.set(key, { ...prev, entryMinutes: Math.min(prev.entryMinutes, start), exitMinutes: Math.max(prev.exitMinutes, end) })
      }

      await yieldToUi(); setProcessingStage("Grouping by date...")
      const byDate = new Map<string, EmployeeDayAggregate[]>()
      for (const [key, agg] of aggregates) {
        const d = key.split("__")[0]
        const list = byDate.get(d) || []; list.push(agg); byDate.set(d, list)
      }
      if (byDate.size === 0) {
        setParseError(`No valid rows found. Total: ${parsed.rows.length}. Valid date: ${validDate}. Valid name: ${validName}. Valid time: ${validTimes}.`)
        return
      }

      const wdStart = parseTimeToMinutes(weekdayPolicy.expectedStart)
      const wdEnd   = parseTimeToMinutes(weekdayPolicy.expectedEnd)
      const weStart = parseTimeToMinutes(weekendPolicy.expectedStart)
      const weEnd   = parseTimeToMinutes(weekendPolicy.expectedEnd)
      if (wdStart == null || wdEnd == null || weStart == null || weEnd == null) { setParseError("Invalid time parameters"); return }

      await yieldToUi(); setProcessingStage("Filtering and preparing results...")
      const results: (DayResult | WeekendResult)[] = []
      const consumed = new Set<string>()
      for (const dateIso of Array.from(byDate.keys()).sort()) {
        if (consumed.has(dateIso)) continue
        const idx = getWeekdayIndex(dateIso); if (idx == null) continue

        if (idx >= 1 && idx <= 5) {
          const tolE = clampNumber(weekdayPolicy.toleranceEarlyMinutes, 0, 600)
          const tolL = clampNumber(weekdayPolicy.toleranceLateMinutes, 0, 600)
          const rows = (byDate.get(dateIso) || [])
            .map(e => ({ name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < wdStart! - tolE, late: e.exitMinutes > wdEnd! + tolL }))
            .filter(r => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: dateIso, weekdayIndex: idx, weekdayLabel: weekdayLabel(idx), isWeekend: false, policy: { expectedStartMinutes: wdStart!, expectedEndMinutes: wdEnd!, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
          day.imageDataUrl = renderDayToPngDataUrl(day); results.push(day); continue
        }

        if (idx === 6) {
          const sundayIso = addDaysIso(dateIso, 1)
          const hasSunday = getWeekdayIndex(sundayIso) === 0 && byDate.has(sundayIso)
          const tolE = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
          const tolL = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
          if (hasSunday) {
            const mapRow = (dayLabel: string) => (e: EmployeeDayAggregate): WeekendEmployeeRow => ({ dayLabel, name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart! - tolE, late: e.exitMinutes > weEnd! + tolL })
            const rows = [...(byDate.get(dateIso) || []).map(mapRow("Saturday")).filter(r => r.early || r.late), ...(byDate.get(sundayIso) || []).map(mapRow("Sunday")).filter(r => r.early || r.late)].sort((a, b) => a.dayLabel === b.dayLabel ? a.name.localeCompare(b.name) : a.dayLabel.localeCompare(b.dayLabel))
            const weekend: WeekendResult = { type: "weekend", dates: [dateIso, sundayIso], label: "Saturday & Sunday", policy: { expectedStartMinutes: weStart!, expectedEndMinutes: weEnd!, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
            weekend.imageDataUrl = renderWeekendToPngDataUrl(weekend); results.push(weekend); consumed.add(dateIso); consumed.add(sundayIso); continue
          }
          const rows = (byDate.get(dateIso) || []).map(e => ({ name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart! - tolE, late: e.exitMinutes > weEnd! + tolL })).filter(r => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: dateIso, weekdayIndex: idx, weekdayLabel: "Saturday", isWeekend: true, policy: { expectedStartMinutes: weStart!, expectedEndMinutes: weEnd!, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
          day.imageDataUrl = renderDayToPngDataUrl(day); results.push(day); continue
        }

        if (idx === 0 && !consumed.has(dateIso)) {
          const tolE = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
          const tolL = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
          const rows = (byDate.get(dateIso) || []).map(e => ({ name: `${e.fname} ${e.lname}`.trim(), entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart! - tolE, late: e.exitMinutes > weEnd! + tolL })).filter(r => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: dateIso, weekdayIndex: idx, weekdayLabel: "Sunday", isWeekend: true, policy: { expectedStartMinutes: weStart!, expectedEndMinutes: weEnd!, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
          day.imageDataUrl = renderDayToPngDataUrl(day); results.push(day); 
        }
      }

      await yieldToUi(); setProcessingStage("Rendering PNG images...")
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        r.imageDataUrl = r.type === "weekend" ? renderWeekendToPngDataUrl(r as WeekendResult) : renderDayToPngDataUrl(r as DayResult)
        if (i % 2 === 1) await yieldToUi()
      }
      setDayResults(results)
    } catch (err) {
      setDayResults([]); setParseError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setIsProcessing(false); setProcessingStage("")
    }
  }

  function downloadPng(dataUrl: string, name: string) {
    const a = document.createElement("a"); a.href = dataUrl; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
  }

  function clear() {
    setCsvText(""); setDayResults([]); setParseError(""); setFileName("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Quickbooks Time Auto Log</h1>
        <p className="text-sm text-muted-foreground">CSV upload → local processing → per-day PNG image</p>
      </div>

      <div className="flex items-start gap-4">
        {/* ── Left panel ── */}
        <div className="flex w-80 shrink-0 flex-col gap-4">

          {/* CSV upload */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">CSV</p>
            <div
              role="button"
              tabIndex={0}
              className={`rounded-lg border-2 border-dashed p-3 transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border"} ${isProcessing ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              onDragEnter={e => { e.preventDefault(); if (!isProcessing) setIsDragging(true) }}
              onDragOver={e => { e.preventDefault(); if (!isProcessing) setIsDragging(true) }}
              onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false) }}
              onDrop={e => { e.preventDefault(); setIsDragging(false); if (!isProcessing) void onPickFile(e.dataTransfer.files?.[0] || null) }}
              onClick={() => { if (!isProcessing) fileInputRef.current?.click() }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Drag & drop your CSV here</p>
                  <p className="text-xs text-muted-foreground">{fileName ? `Selected: ${fileName}` : "No file selected"}</p>
                </div>
                <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">or click to browse</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" disabled={isProcessing} onChange={e => void onPickFile(e.target.files?.[0] || null)} />
          </div>

          {/* Monday–Friday policy */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Monday – Friday</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Clock-in</label>
                <input className={inputCls} placeholder="07:00 AM" disabled={isProcessing} value={weekdayPolicy.expectedStart} onChange={e => setWeekdayPolicy(p => ({ ...p, expectedStart: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Clock-out</label>
                <input className={inputCls} placeholder="05:00 PM" disabled={isProcessing} value={weekdayPolicy.expectedEnd} onChange={e => setWeekdayPolicy(p => ({ ...p, expectedEnd: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Early tol. (min)</label>
                <input type="number" min={0} max={600} className={inputCls} disabled={isProcessing} value={weekdayPolicy.toleranceEarlyMinutes} onChange={e => setWeekdayPolicy(p => ({ ...p, toleranceEarlyMinutes: clampNumber(Number(e.target.value), 0, 600) }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Late tol. (min)</label>
                <input type="number" min={0} max={600} className={inputCls} disabled={isProcessing} value={weekdayPolicy.toleranceLateMinutes} onChange={e => setWeekdayPolicy(p => ({ ...p, toleranceLateMinutes: clampNumber(Number(e.target.value), 0, 600) }))} />
              </div>
            </div>
          </div>

          {/* Saturday / Sunday policy */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Saturday / Sunday</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Clock-in</label>
                <input className={inputCls} placeholder="08:00 AM" disabled={isProcessing} value={weekendPolicy.expectedStart} onChange={e => setWeekendPolicy(p => ({ ...p, expectedStart: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Clock-out</label>
                <input className={inputCls} placeholder="05:00 PM" disabled={isProcessing} value={weekendPolicy.expectedEnd} onChange={e => setWeekendPolicy(p => ({ ...p, expectedEnd: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Early tol. (min)</label>
                <input type="number" min={0} max={600} className={inputCls} disabled={isProcessing} value={weekendPolicy.toleranceEarlyMinutes} onChange={e => setWeekendPolicy(p => ({ ...p, toleranceEarlyMinutes: clampNumber(Number(e.target.value), 0, 600) }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Late tol. (min)</label>
                <input type="number" min={0} max={600} className={inputCls} disabled={isProcessing} value={weekendPolicy.toleranceLateMinutes} onChange={e => setWeekendPolicy(p => ({ ...p, toleranceLateMinutes: clampNumber(Number(e.target.value), 0, 600) }))} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button disabled={!canProcess} onClick={() => void process()} className="h-10 w-full">
              {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : <><Upload className="h-4 w-4" />Process and generate images</>}
            </Button>
            {isProcessing && <p className="text-center text-xs text-muted-foreground">{processingStage}</p>}
            <Button variant="outline" size="sm" disabled={isProcessing} onClick={clear} className="w-full">Clear</Button>
          </div>

          {parseError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              {parseError}
            </div>
          )}
        </div>

        {/* ── Results ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {dayResults.length === 0 && !parseError && !isProcessing && (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-muted/20">
              <p className="text-sm text-muted-foreground">Upload a CSV and click "Process and generate images".</p>
            </div>
          )}

          {dayResults.map(d => {
            const isWeekend = d.type === "weekend"
            const key = isWeekend ? (d as WeekendResult).dates.join("&") : (d as DayResult).localDate
            const title = isWeekend ? `${(d as WeekendResult).dates[0]} & ${(d as WeekendResult).dates[1]} • Saturday & Sunday` : `${(d as DayResult).localDate} • ${(d as DayResult).weekdayLabel}`
            const meta = `Out of range: ${d.rows.length} • Window: ${formatMinutesToTime(d.policy.expectedStartMinutes)}–${formatMinutesToTime(d.policy.expectedEndMinutes)} • Tolerance: -${d.policy.toleranceEarlyMinutes}/+${d.policy.toleranceLateMinutes} min`
            const imgUrl = d.imageDataUrl
            return (
              <div key={key} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{title}</p>
                    <p className="text-xs text-muted-foreground">{meta}</p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" disabled={!imgUrl}
                    onClick={() => imgUrl && downloadPng(imgUrl, `auto-log_${key}.png`)}>
                    <Download className="h-3.5 w-3.5" />Download PNG
                  </Button>
                </div>
                {imgUrl && (
                  <div className="overflow-y-auto rounded-lg border" style={{ maxHeight: "calc(100vh - 16rem)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt={`Auto-Log ${key}`} className="w-full" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
