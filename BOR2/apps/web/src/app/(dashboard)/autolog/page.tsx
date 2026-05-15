"use client"

import { useEffect, useState, useMemo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Download, Loader2, RefreshCw } from "lucide-react"
import { weeklyReportService, type WeeklyReport } from "@/services/qbtime-weekly-report.service"
import { cn } from "@/lib/utils"

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
]

type TimePolicy = {
  expectedStart: string
  expectedEnd: string
  toleranceEarlyMinutes: number
  toleranceLateMinutes: number
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

function clampNumber(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, v))
}

async function yieldToUi() {
  await new Promise<void>((r) => setTimeout(r, 0))
}

function parseTimeToMinutes(raw: string): number | null {
  const v = raw.trim()
  if (!v) return null
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

function isoToLocalDate(iso: string): string {
  // "2026-05-13T07:00:00-04:00" -> Date object respecting timezone offset
  return iso.split("T")[0]
}

function isoToMinutes(iso: string): number | null {
  // Parse ISO 8601 timestamp, returning local time as minutes from midnight
  const match = /T(\d{2}):(\d{2}):(\d{2})/.exec(iso)
  if (!match) return null
  const h = Number(match[1]); const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function getWeekdayIndex(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`)
  const day = d.getDay()
  return Number.isFinite(day) ? day : null
}

function weekdayLabel(idx: number) {
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][idx] || ""
}

function addDaysIso(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

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

const inputCls = "h-8 w-full rounded-lg border border-input bg-transparent px-3 py-0 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type EmployeeDayAggregate = {
  name: string
  entryMinutes: number
  exitMinutes: number
}

export default function AutoLogPage() {
  const [company, setCompany] = useState("framing")
  const [data, setData] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")

  const [dayResults, setDayResults] = useState<(DayResult | WeekendResult)[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStage, setProcessingStage] = useState("")
  const [parseError, setParseError] = useState("")

  const [weekdayPolicy, setWeekdayPolicy] = useState<TimePolicy>({
    expectedStart: "07:00 AM", expectedEnd: "05:00 PM",
    toleranceEarlyMinutes: 0, toleranceLateMinutes: 0,
  })
  const [weekendPolicy, setWeekendPolicy] = useState<TimePolicy>({
    expectedStart: "08:00 AM", expectedEnd: "05:00 PM",
    toleranceEarlyMinutes: 0, toleranceLateMinutes: 0,
  })

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setFetchError("")
      setDayResults([])
      try {
        const today = new Date().toISOString().split("T")[0]
        const apiData = await weeklyReportService.get(company, today)
        setData(apiData)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to fetch QB Time data")
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [company])

  const canProcess = useMemo(() => !!data && data.employees.length > 0 && !isProcessing && !loading, [data, isProcessing, loading])

  async function process() {
    if (!data) return
    setIsProcessing(true); setProcessingStage("Aggregating per employee/day...")
    try {
      setParseError(""); setDayResults([]); await yieldToUi()

      // Build byDate map from API data: aggregate shifts per employee/date
      const byDate = new Map<string, EmployeeDayAggregate[]>()
      for (const emp of data.employees) {
        for (const day of emp.days) {
          if (!day.shifts || day.shifts.length === 0) continue

          let minStart: number | null = null
          let maxEnd: number | null = null
          for (const sh of day.shifts) {
            const s = isoToMinutes(sh.start)
            const e = sh.end ? isoToMinutes(sh.end) : null
            if (s != null) minStart = minStart == null ? s : Math.min(minStart, s)
            if (e != null) maxEnd = maxEnd == null ? e : Math.max(maxEnd, e)
          }
          if (minStart == null || maxEnd == null) continue

          const dateIso = day.date
          const list = byDate.get(dateIso) || []
          list.push({ name: emp.name, entryMinutes: minStart, exitMinutes: maxEnd })
          byDate.set(dateIso, list)
        }
      }

      if (byDate.size === 0) {
        setParseError("No timesheet data found for the current week.")
        return
      }

      const wdStart = parseTimeToMinutes(weekdayPolicy.expectedStart)
      const wdEnd   = parseTimeToMinutes(weekdayPolicy.expectedEnd)
      const weStart = parseTimeToMinutes(weekendPolicy.expectedStart)
      const weEnd   = parseTimeToMinutes(weekendPolicy.expectedEnd)
      if (wdStart == null || wdEnd == null || weStart == null || weEnd == null) {
        setParseError("Invalid time parameters")
        return
      }

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
            .map(e => ({ name: e.name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < wdStart - tolE, late: e.exitMinutes > wdEnd + tolL }))
            .filter(r => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: dateIso, weekdayIndex: idx, weekdayLabel: weekdayLabel(idx), isWeekend: false, policy: { expectedStartMinutes: wdStart, expectedEndMinutes: wdEnd, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
          day.imageDataUrl = renderDayToPngDataUrl(day); results.push(day); continue
        }

        if (idx === 6) {
          const sundayIso = addDaysIso(dateIso, 1)
          const hasSunday = getWeekdayIndex(sundayIso) === 0 && byDate.has(sundayIso)
          const tolE = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
          const tolL = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
          if (hasSunday) {
            const mapRow = (dayLabel: string) => (e: EmployeeDayAggregate): WeekendEmployeeRow => ({ dayLabel, name: e.name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolE, late: e.exitMinutes > weEnd + tolL })
            const rows = [...(byDate.get(dateIso) || []).map(mapRow("Saturday")).filter(r => r.early || r.late), ...(byDate.get(sundayIso) || []).map(mapRow("Sunday")).filter(r => r.early || r.late)].sort((a, b) => a.dayLabel === b.dayLabel ? a.name.localeCompare(b.name) : a.dayLabel.localeCompare(b.dayLabel))
            const weekend: WeekendResult = { type: "weekend", dates: [dateIso, sundayIso], label: "Saturday & Sunday", policy: { expectedStartMinutes: weStart, expectedEndMinutes: weEnd, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
            weekend.imageDataUrl = renderWeekendToPngDataUrl(weekend); results.push(weekend); consumed.add(dateIso); consumed.add(sundayIso); continue
          }
          const rows = (byDate.get(dateIso) || []).map(e => ({ name: e.name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolE, late: e.exitMinutes > weEnd + tolL })).filter(r => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: dateIso, weekdayIndex: idx, weekdayLabel: "Saturday", isWeekend: true, policy: { expectedStartMinutes: weStart, expectedEndMinutes: weEnd, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
          day.imageDataUrl = renderDayToPngDataUrl(day); results.push(day); continue
        }

        if (idx === 0 && !consumed.has(dateIso)) {
          const tolE = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
          const tolL = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
          const rows = (byDate.get(dateIso) || []).map(e => ({ name: e.name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early: e.entryMinutes < weStart - tolE, late: e.exitMinutes > weEnd + tolL })).filter(r => r.early || r.late).sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = { type: "weekday", localDate: dateIso, weekdayIndex: idx, weekdayLabel: "Sunday", isWeekend: true, policy: { expectedStartMinutes: weStart, expectedEndMinutes: weEnd, toleranceEarlyMinutes: tolE, toleranceLateMinutes: tolL }, rows }
          day.imageDataUrl = renderDayToPngDataUrl(day); results.push(day)
        }
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

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Quickbooks Time Auto Log</h1>
          <p className="text-sm text-muted-foreground">QB Time API → policy check → per-day PNG image</p>
        </div>

        <div className="flex flex-col items-start gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Company</p>
          <div className="flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5">
            {COMPANIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCompany(c.value)}
                disabled={loading || isProcessing}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap",
                  company === c.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Image src={c.logo} alt={c.label} width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start gap-4">
        <div className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          {/* Data status */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">QB Time Data</p>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {loading && <p className="text-sm text-muted-foreground">Fetching weekly data...</p>}
            {!loading && data && (
              <div className="text-xs space-y-1">
                <p><span className="text-muted-foreground">Week:</span> {data.weekStart} → {data.weekEnd}</p>
                <p><span className="text-muted-foreground">Employees:</span> {data.employees.length}</p>
              </div>
            )}
            {fetchError && (
              <p className="text-xs text-destructive">{fetchError}</p>
            )}
          </div>

          {/* Weekday policy */}
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

          {/* Weekend policy */}
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

          <div className="flex flex-col gap-2">
            <Button disabled={!canProcess} onClick={() => void process()} className="h-10 w-full gap-2">
              {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : <><RefreshCw className="h-4 w-4" />Run Auto-Log</>}
            </Button>
            {isProcessing && <p className="text-center text-xs text-muted-foreground">{processingStage}</p>}
          </div>

          {parseError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              {parseError}
            </div>
          )}
        </div>

        <div className="flex h-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {dayResults.length === 0 && !parseError && !isProcessing && !loading && (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-muted/20">
              <p className="text-sm text-muted-foreground">Configure policies and click "Run Auto-Log".</p>
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
                  <div className="overflow-hidden rounded-lg border">
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
