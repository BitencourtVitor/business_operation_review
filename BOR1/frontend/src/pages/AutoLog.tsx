import Cookies from 'js-cookie'
import { useEffect, useMemo, useRef, useState } from 'react'

type ParsedCsv = {
  headers: string[]
  rows: string[][]
}

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
  type: 'weekday'
  localDate: string
  weekdayIndex: number
  weekdayLabel: string
  isWeekend: boolean
  policy: {
    expectedStartMinutes: number
    expectedEndMinutes: number
    toleranceEarlyMinutes: number
    toleranceLateMinutes: number
  }
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
  type: 'weekend'
  dates: [string, string]
  label: string
  policy: {
    expectedStartMinutes: number
    expectedEndMinutes: number
    toleranceEarlyMinutes: number
    toleranceLateMinutes: number
  }
  rows: WeekendEmployeeRow[]
  imageDataUrl?: string
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

async function yieldToUi() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function normalizeHeaderKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
}

function normalizeHeaderKeyLoose(raw: string) {
  return normalizeHeaderKey(raw).replace(/_/g, '')
}

function guessDelimiter(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 5)
  const sample = lines.join('\n')
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]
    if (ch === '"') {
      const next = sample[i + 1]
      if (inQuotes && next === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      counts[ch]++
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return (best?.[0] as ',' | ';' | '\t') || ','
}

function parseCsvWithDelimiter(text: string, delimiter: ',' | ';' | '\t'): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === delimiter) {
      pushField()
      continue
    }

    if (ch === '\n') {
      pushField()
      pushRow()
      continue
    }

    if (ch === '\r') {
      const next = text[i + 1]
      if (next === '\n') {
        continue
      }
      pushField()
      pushRow()
      continue
    }

    field += ch
  }

  pushField()
  if (row.length > 1 || row[0]?.trim() !== '') {
    pushRow()
  }

  const headers = (rows[0] || []).map(h => h.trim())
  const data = rows.slice(1).filter(r => r.some(c => c.trim() !== ''))
  return { headers, rows: data }
}

function parseCsv(text: string): ParsedCsv {
  const delimiter = guessDelimiter(text)
  return parseCsvWithDelimiter(text, delimiter)
}

function parseLocalDateToIso(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const s = v.split('T')[0].split(' ')[0].trim()

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (isoMatch) {
    const y = Number(isoMatch[1])
    const m = Number(isoMatch[2])
    const d = Number(isoMatch[3])
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const mm = String(m).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (slashMatch) {
    const m = Number(slashMatch[1])
    const d = Number(slashMatch[2])
    const y = Number(slashMatch[3])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const mm = String(m).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }

  const dashMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
  if (dashMatch) {
    const m = Number(dashMatch[1])
    const d = Number(dashMatch[2])
    const y = Number(dashMatch[3])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const mm = String(m).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }

  return null
}

function getWeekdayIndex(isoDate: string): number | null {
  const d = new Date(`${isoDate}T00:00:00`)
  const day = d.getDay()
  if (!Number.isFinite(day)) return null
  return day
}

function weekdayLabelPtBr(weekdayIndex: number) {
  const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return labels[weekdayIndex] || ''
}

function extractTimeToken(raw: string): string | null {
  const matches = Array.from(raw.matchAll(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/gi))
  const last = matches[matches.length - 1]
  if (!last) return null
  return last[0].trim()
}

function parseTimeToMinutes(raw: string): number | null {
  let v = raw.trim()
  if (!v) return null
  const extracted = extractTimeToken(v)
  if (extracted) v = extracted

  const ampm = /\s*(am|pm)\s*$/i.exec(v)
  if (ampm) {
    const meridiem = ampm[1].toLowerCase()
    const base = v.replace(/\s*(am|pm)\s*$/i, '').trim()
    const parts = base.split(':').map(p => p.trim())
    if (parts.length < 2) return null
    const h0 = Number(parts[0])
    const m0 = Number(parts[1])
    if (!Number.isFinite(h0) || !Number.isFinite(m0)) return null
    const s0 = parts.length >= 3 ? Number(parts[2]) : 0
    if (!Number.isFinite(s0)) return null

    let h = h0
    if (h < 1 || h > 12 || m0 < 0 || m0 > 59 || s0 < 0 || s0 > 59) return null
    if (meridiem === 'am') {
      if (h === 12) h = 0
    } else {
      if (h !== 12) h += 12
    }
    return h * 60 + m0
  }

  const parts = v.split(':').map(p => p.trim())
  if (parts.length < 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  const s = parts.length >= 3 ? Number(parts[2]) : 0
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null
  return h * 60 + m
}

function formatMinutesToTime(minutes: number) {
  let h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const mer = h24 >= 12 ? 'PM' : 'AM'
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mer}`
}

function getCssVar(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return v || fallback
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
  const bg = getCssVar('--color-background-primary', '#ffffff')
  const cardBg = getCssVar('--color-background-secondary', '#f5f5f5')
  const textPrimary = getCssVar('--color-text-primary', '#111827')
  const textSecondary = getCssVar('--color-text-secondary', '#6b7280')
  const border = getCssVar('--color-border-divider', '#e5e7eb')
  const negative = getCssVar('--negative-color', '#DC3545')
  const isDark = document.documentElement.classList.contains('dark')
  const stripe = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'

  const width = 1200
  const padding = 54
  const headerHeight = 110
  const tableTopGap = 18
  const tableHeaderHeight = 52
  const rowHeight = 56
  const bottomGap = 28
  const rows = day.rows.length
  const height = padding * 2 + headerHeight + tableTopGap + tableHeaderHeight + Math.max(1, rows) * rowHeight + bottomGap

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const cardX = padding
  const cardY = padding
  const cardW = width - padding * 2
  const cardH = height - padding * 2

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16)
  ctx.fillStyle = cardBg
  ctx.fill()
  ctx.strokeStyle = border
  ctx.lineWidth = 2
  ctx.stroke()

  const titleY = cardY + 66
  ctx.fillStyle = textPrimary
  ctx.font = '800 34px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Auto-Log', cardX + 28, titleY)

  ctx.fillStyle = textSecondary
  ctx.font = '700 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.textAlign = 'right'
  ctx.fillText(`${day.localDate} • ${day.weekdayLabel}`, cardX + cardW - 28, titleY)

  const dividerY = cardY + headerHeight
  ctx.strokeStyle = border
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cardX + 22, dividerY)
  ctx.lineTo(cardX + cardW - 22, dividerY)
  ctx.stroke()

  const tableX = cardX + 22
  const tableY = dividerY + tableTopGap
  const tableW = cardW - 44

  drawRoundedRect(ctx, tableX, tableY, tableW, tableHeaderHeight + Math.max(1, rows) * rowHeight, 12)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.stroke()

  const nameFrac = 0.58
  const inFrac = 0.14
  const outFrac = 0.14
  const colNameX = tableX + 18
  const inLeftX = tableX + Math.floor(tableW * nameFrac)
  const outLeftX = tableX + Math.floor(tableW * (nameFrac + inFrac))
  const statusLeftX = tableX + Math.floor(tableW * (nameFrac + inFrac + outFrac))
  const inRightX = tableX + Math.floor(tableW * (nameFrac + inFrac)) - 18
  const outRightX = tableX + Math.floor(tableW * (nameFrac + inFrac + outFrac)) - 18
  const statusRightX = tableX + tableW - 18
  const statusWidth = statusRightX - statusLeftX

  ctx.fillStyle = textSecondary
  ctx.font = '800 13px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.textAlign = 'left'
  ctx.fillText('EMPLOYEE', colNameX, tableY + 32)
  ctx.fillText('IN', inLeftX, tableY + 32)
  ctx.fillText('OUT', outLeftX, tableY + 32)
  ctx.fillText('STATUS', statusLeftX, tableY + 32)

  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(tableX + 10, tableY + tableHeaderHeight)
  ctx.lineTo(tableX + tableW - 10, tableY + tableHeaderHeight)
  ctx.stroke()

  if (rows === 0) {
    ctx.fillStyle = textSecondary
    ctx.font = '700 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.textAlign = 'left'
    ctx.fillText('No employees out of range', tableX + 18, tableY + tableHeaderHeight + 36)
  } else {
    for (let i = 0; i < rows; i++) {
      const r = day.rows[i]
      const y = tableY + tableHeaderHeight + i * rowHeight

      if (i % 2 === 1) {
        ctx.fillStyle = stripe
        ctx.fillRect(tableX + 1, y, tableW - 2, rowHeight)
      }

      const isAlert = r.early || r.late
      ctx.fillStyle = isAlert ? negative : textPrimary
      ctx.font = '700 18px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'left'
      ctx.fillText(r.name, colNameX, y + 36)

      ctx.fillStyle = r.early ? negative : textPrimary
      ctx.font = '800 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'right'
      ctx.fillText(formatMinutesToTime(r.entryMinutes), inRightX, y + 36)

      ctx.fillStyle = r.late ? negative : textPrimary
      ctx.textAlign = 'right'
      ctx.fillText(formatMinutesToTime(r.exitMinutes), outRightX, y + 36)

      const badge = r.early && r.late ? 'EARLY + LATE' : r.early ? 'EARLY' : r.late ? 'LATE' : ''
      if (badge) {
        const badgeH = 28
        ctx.font = '900 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
        const badgeTextW = ctx.measureText(badge).width
        const badgeW = Math.min(statusWidth - 12, Math.max(78, badgeTextW + 20))
        const badgeX = statusLeftX + Math.floor((statusWidth - badgeW) / 2)
        const badgeY = y + Math.floor((rowHeight - badgeH) / 2)
        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14)
        ctx.fillStyle = 'rgba(220, 53, 69, 0.14)'
        ctx.fill()
        ctx.strokeStyle = negative
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = negative
        ctx.textAlign = 'center'
        ctx.fillText(badge, badgeX + Math.floor(badgeW / 2), badgeY + 19)
      }
    }
  }

  return canvas.toDataURL('image/png')
}

function renderWeekendToPngDataUrl(weekend: WeekendResult): string {
  const bg = getCssVar('--color-background-primary', '#ffffff')
  const cardBg = getCssVar('--color-background-secondary', '#f5f5f5')
  const textPrimary = getCssVar('--color-text-primary', '#111827')
  const textSecondary = getCssVar('--color-text-secondary', '#6b7280')
  const border = getCssVar('--color-border-divider', '#e5e7eb')
  const negative = getCssVar('--negative-color', '#DC3545')
  const isDark = document.documentElement.classList.contains('dark')
  const stripe = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'

  const width = 1200
  const padding = 54
  const headerHeight = 110
  const tableTopGap = 18
  const tableHeaderHeight = 52
  const rowHeight = 56
  const bottomGap = 28
  const rows = weekend.rows.length
  const height = padding * 2 + headerHeight + tableTopGap + tableHeaderHeight + Math.max(1, rows) * rowHeight + bottomGap

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const cardX = padding
  const cardY = padding
  const cardW = width - padding * 2
  const cardH = height - padding * 2

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16)
  ctx.fillStyle = cardBg
  ctx.fill()
  ctx.strokeStyle = border
  ctx.lineWidth = 2
  ctx.stroke()

  const titleY = cardY + 66
  ctx.fillStyle = textPrimary
  ctx.font = '800 34px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Auto-Log', cardX + 28, titleY)

  ctx.fillStyle = textSecondary
  ctx.font = '700 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.textAlign = 'right'
  ctx.fillText(`${weekend.dates[0]} & ${weekend.dates[1]} • Saturday & Sunday`, cardX + cardW - 28, titleY)

  const dividerY = cardY + headerHeight
  ctx.strokeStyle = border
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cardX + 22, dividerY)
  ctx.lineTo(cardX + cardW - 22, dividerY)
  ctx.stroke()

  const tableX = cardX + 22
  const tableY = dividerY + tableTopGap
  const tableW = cardW - 44

  drawRoundedRect(ctx, tableX, tableY, tableW, tableHeaderHeight + Math.max(1, rows) * rowHeight, 12)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.stroke()

  const dayFrac = 0.16
  const nameFrac = 0.42
  const inFrac = 0.14
  const outFrac = 0.14

  const colDayX = tableX + 18
  const nameLeftX = tableX + Math.floor(tableW * dayFrac)
  const inLeftX = tableX + Math.floor(tableW * (dayFrac + nameFrac))
  const outLeftX = tableX + Math.floor(tableW * (dayFrac + nameFrac + inFrac))
  const statusLeftX = tableX + Math.floor(tableW * (dayFrac + nameFrac + inFrac + outFrac))
  const inRightX = tableX + Math.floor(tableW * (dayFrac + nameFrac + inFrac)) - 18
  const outRightX = tableX + Math.floor(tableW * (dayFrac + nameFrac + inFrac + outFrac)) - 18
  const statusRightX = tableX + tableW - 18
  const statusWidth = statusRightX - statusLeftX

  ctx.fillStyle = textSecondary
  ctx.font = '800 13px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.textAlign = 'left'
  ctx.fillText('DAY', colDayX, tableY + 32)
  ctx.fillText('EMPLOYEE', nameLeftX, tableY + 32)
  ctx.fillText('IN', inLeftX, tableY + 32)
  ctx.fillText('OUT', outLeftX, tableY + 32)
  ctx.fillText('STATUS', statusLeftX, tableY + 32)

  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(tableX + 10, tableY + tableHeaderHeight)
  ctx.lineTo(tableX + tableW - 10, tableY + tableHeaderHeight)
  ctx.stroke()

  if (rows === 0) {
    ctx.fillStyle = textSecondary
    ctx.font = '700 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.textAlign = 'left'
    ctx.fillText('No employees out of range', tableX + 18, tableY + tableHeaderHeight + 36)
  } else {
    for (let i = 0; i < rows; i++) {
      const r = weekend.rows[i]
      const y = tableY + tableHeaderHeight + i * rowHeight

      if (i % 2 === 1) {
        ctx.fillStyle = stripe
        ctx.fillRect(tableX + 1, y, tableW - 2, rowHeight)
      }

      const isAlert = r.early || r.late
      ctx.fillStyle = textSecondary
      ctx.font = '800 13px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'left'
      ctx.fillText(r.dayLabel, colDayX, y + 36)

      ctx.fillStyle = isAlert ? negative : textPrimary
      ctx.font = '700 18px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'left'
      ctx.fillText(r.name, nameLeftX, y + 36)

      ctx.fillStyle = r.early ? negative : textPrimary
      ctx.font = '800 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'right'
      ctx.fillText(formatMinutesToTime(r.entryMinutes), inRightX, y + 36)

      ctx.fillStyle = r.late ? negative : textPrimary
      ctx.textAlign = 'right'
      ctx.fillText(formatMinutesToTime(r.exitMinutes), outRightX, y + 36)

      const badge = r.early && r.late ? 'EARLY + LATE' : r.early ? 'EARLY' : r.late ? 'LATE' : ''
      if (badge) {
        const badgeH = 28
        ctx.font = '900 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial'
        const badgeTextW = ctx.measureText(badge).width
        const badgeW = Math.min(statusWidth - 12, Math.max(78, badgeTextW + 20))
        const badgeX = statusLeftX + Math.floor((statusWidth - badgeW) / 2)
        const badgeY = y + Math.floor((rowHeight - badgeH) / 2)
        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14)
        ctx.fillStyle = 'rgba(220, 53, 69, 0.14)'
        ctx.fill()
        ctx.strokeStyle = negative
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = negative
        ctx.textAlign = 'center'
        ctx.fillText(badge, badgeX + Math.floor(badgeW / 2), badgeY + 19)
      }
    }
  }

  return canvas.toDataURL('image/png')
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AutoLog() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = useState<'light' | 'dark'>(Cookies.get('theme') === 'dark' ? 'dark' : 'light')
  const [fileName, setFileName] = useState<string>('')
  const [csvText, setCsvText] = useState<string>('')
  const [parseError, setParseError] = useState<string>('')
  const [dayResults, setDayResults] = useState<(DayResult | WeekendResult)[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStage, setProcessingStage] = useState<string>('')
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  const [weekdayPolicy, setWeekdayPolicy] = useState<TimePolicy>({
    expectedStart: '07:00 AM',
    expectedEnd: '05:00 PM',
    toleranceEarlyMinutes: 0,
    toleranceLateMinutes: 0,
  })

  const [weekendPolicy, setWeekendPolicy] = useState<TimePolicy>({
    expectedStart: '08:00 AM',
    expectedEnd: '05:00 PM',
    toleranceEarlyMinutes: 0,
    toleranceLateMinutes: 0,
  })

  const canProcess = useMemo(() => csvText.trim() !== '' && !isProcessing, [csvText, isProcessing])

  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 })
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  async function onPickFile(file: File | null) {
    setParseError('')
    setDayResults([])
    setFileName(file?.name || '')
    if (!file) {
      setCsvText('')
      return
    }
    const text = await file.text()
    setCsvText(text)
  }

  function buildHeaderIndexMap(headers: string[]) {
    const exact = new Map<string, number>()
    const loose = new Map<string, number>()
    headers.forEach((h, i) => {
      exact.set(normalizeHeaderKey(h), i)
      loose.set(normalizeHeaderKeyLoose(h), i)
    })
    return { exact, loose }
  }

  function getIndexByCandidates(
    maps: { exact: Map<string, number>; loose: Map<string, number> },
    candidates: string[],
  ) {
    for (const c of candidates) {
      const k1 = normalizeHeaderKey(c)
      const k2 = normalizeHeaderKeyLoose(c)
      const foundExact = maps.exact.get(k1)
      if (foundExact !== undefined) return foundExact
      const foundLoose = maps.loose.get(k2)
      if (foundLoose !== undefined) return foundLoose
    }
    return -1
  }

  async function process() {
    setIsProcessing(true)
    setProcessingStage('Starting...')
    try {
      setParseError('')
      setDayResults([])
      await yieldToUi()

      setProcessingStage('Parsing CSV...')
      const parsed = parseCsv(csvText)
      const maps = buildHeaderIndexMap(parsed.headers)

      const idxDate = getIndexByCandidates(maps, ['local_date', 'local date', 'date'])
      const idxFName = getIndexByCandidates(maps, ['fname', 'first_name', 'first name', 'first'])
      const idxLName = getIndexByCandidates(maps, ['lname', 'last_name', 'last name', 'last'])
      const idxStart = getIndexByCandidates(maps, ['local_start_time', 'local start time', 'start_time', 'start time'])
      const idxEnd = getIndexByCandidates(maps, ['local_end_time', 'local end time', 'end_time', 'end time'])

      const missing: string[] = []
      if (idxDate < 0) missing.push('local_date')
      if (idxFName < 0) missing.push('fname')
      if (idxLName < 0) missing.push('lname')
      if (idxStart < 0) missing.push('local_start_time')
      if (idxEnd < 0) missing.push('local_end_time')
      if (missing.length > 0) {
        setParseError(`Required columns not found: ${missing.join(', ')}`)
        setDayResults([])
        return
      }

      await yieldToUi()
      setProcessingStage('Aggregating per employee/day...')
      const totalRows = parsed.rows.length
      let rowsWithValidDate = 0
      let rowsWithValidName = 0
      let rowsWithValidTimes = 0
      const aggregates = new Map<string, EmployeeDayAggregate>()
      for (const r of parsed.rows) {
        const rawDate = r[idxDate] || ''
        const dateIso = parseLocalDateToIso(rawDate)
        if (!dateIso) continue
        rowsWithValidDate++

        const fname = (r[idxFName] || '').trim()
        const lname = (r[idxLName] || '').trim()
        if (!fname && !lname) continue
        rowsWithValidName++

        const start = parseTimeToMinutes(r[idxStart] || '')
        const end = parseTimeToMinutes(r[idxEnd] || '')
        if (start == null || end == null) continue
        rowsWithValidTimes++

        const key = `${dateIso}__${fname.toLowerCase()}__${lname.toLowerCase()}`
        const prev = aggregates.get(key)
        if (!prev) {
          aggregates.set(key, { fname, lname, entryMinutes: start, exitMinutes: end })
        } else {
          aggregates.set(key, {
            fname: prev.fname,
            lname: prev.lname,
            entryMinutes: Math.min(prev.entryMinutes, start),
            exitMinutes: Math.max(prev.exitMinutes, end),
          })
        }
      }

      await yieldToUi()
      setProcessingStage('Grouping by date...')
      const byDate = new Map<string, EmployeeDayAggregate[]>()
      for (const [key, agg] of aggregates.entries()) {
        const dateIso = key.split('__')[0]
        const list = byDate.get(dateIso) || []
        list.push(agg)
        byDate.set(dateIso, list)
      }

      if (byDate.size === 0) {
        setParseError(
          `No valid rows found. Total rows: ${totalRows}. Valid date: ${rowsWithValidDate}. Valid name: ${rowsWithValidName}. Valid time: ${rowsWithValidTimes}.`,
        )
        setDayResults([])
        return
      }

      const weekdayExpectedStart = parseTimeToMinutes(weekdayPolicy.expectedStart)
      const weekdayExpectedEnd = parseTimeToMinutes(weekdayPolicy.expectedEnd)
      const weekendExpectedStart = parseTimeToMinutes(weekendPolicy.expectedStart)
      const weekendExpectedEnd = parseTimeToMinutes(weekendPolicy.expectedEnd)

      if (
        weekdayExpectedStart == null ||
        weekdayExpectedEnd == null ||
        weekendExpectedStart == null ||
        weekendExpectedEnd == null
      ) {
        setParseError('Invalid time parameters')
        setDayResults([])
        return
      }

      await yieldToUi()
      setProcessingStage('Filtering and preparing results...')
      const results: (DayResult | WeekendResult)[] = []
      const datesSorted = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b))
      const consumed = new Set<string>()
      for (const dateIso of datesSorted) {
        if (consumed.has(dateIso)) continue
        const idx = getWeekdayIndex(dateIso)
        if (idx == null) continue
        if (idx >= 1 && idx <= 5) {
          const expectedStartMinutes = weekdayExpectedStart!
          const expectedEndMinutes = weekdayExpectedEnd!
          const toleranceEarlyMinutes = clampNumber(weekdayPolicy.toleranceEarlyMinutes, 0, 600)
          const toleranceLateMinutes = clampNumber(weekdayPolicy.toleranceLateMinutes, 0, 600)
          const list = (byDate.get(dateIso) || [])
            .map<EmployeeResultRow>(e => {
              const name = `${e.fname} ${e.lname}`.trim()
              const early = e.entryMinutes < expectedStartMinutes - toleranceEarlyMinutes
              const late = e.exitMinutes > expectedEndMinutes + toleranceLateMinutes
              return { name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early, late }
            })
            .filter(r => r.early || r.late)
            .sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = {
            type: 'weekday',
            localDate: dateIso,
            weekdayIndex: idx,
            weekdayLabel: weekdayLabelPtBr(idx),
            isWeekend: false,
            policy: {
              expectedStartMinutes,
              expectedEndMinutes,
              toleranceEarlyMinutes,
              toleranceLateMinutes,
            },
            rows: list,
          }
          day.imageDataUrl = renderDayToPngDataUrl(day)
          results.push(day)
          continue
        }
        if (idx === 6) {
          const sundayIso = addDaysIso(dateIso, 1)
          const sundayIdx = getWeekdayIndex(sundayIso)
          const hasSunday = sundayIdx === 0 && byDate.has(sundayIso)
          if (hasSunday) {
            const tolEarly = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
            const tolLate = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
            const expStart = weekendExpectedStart!
            const expEnd = weekendExpectedEnd!
            const satRows: WeekendEmployeeRow[] = (byDate.get(dateIso) || [])
              .map(e => {
                const early = e.entryMinutes < expStart - tolEarly
                const late = e.exitMinutes > expEnd + tolLate
                return {
                  dayLabel: 'Saturday',
                  name: `${e.fname} ${e.lname}`.trim(),
                  entryMinutes: e.entryMinutes,
                  exitMinutes: e.exitMinutes,
                  early,
                  late,
                }
              })
              .filter(r => r.early || r.late)
            const sunRows: WeekendEmployeeRow[] = (byDate.get(sundayIso) || [])
              .map(e => {
                const early = e.entryMinutes < expStart - tolEarly
                const late = e.exitMinutes > expEnd + tolLate
                return {
                  dayLabel: 'Sunday',
                  name: `${e.fname} ${e.lname}`.trim(),
                  entryMinutes: e.entryMinutes,
                  exitMinutes: e.exitMinutes,
                  early,
                  late,
                }
              })
              .filter(r => r.early || r.late)
            const rows = [...satRows, ...sunRows].sort((a, b) => {
              if (a.dayLabel === b.dayLabel) return a.name.localeCompare(b.name)
              return a.dayLabel.localeCompare(b.dayLabel)
            })
            const weekend: WeekendResult = {
              type: 'weekend',
              dates: [dateIso, sundayIso],
              label: 'Saturday & Sunday',
              policy: {
                expectedStartMinutes: expStart,
                expectedEndMinutes: expEnd,
                toleranceEarlyMinutes: tolEarly,
                toleranceLateMinutes: tolLate,
              },
              rows,
            }
            weekend.imageDataUrl = renderWeekendToPngDataUrl(weekend)
            results.push(weekend)
            consumed.add(dateIso)
            consumed.add(sundayIso)
            continue
          }
          const expectedStartMinutes = weekendExpectedStart!
          const expectedEndMinutes = weekendExpectedEnd!
          const tolEarly = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
          const tolLate = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
          const list = (byDate.get(dateIso) || [])
            .map<EmployeeResultRow>(e => {
              const name = `${e.fname} ${e.lname}`.trim()
              const early = e.entryMinutes < expectedStartMinutes - tolEarly
              const late = e.exitMinutes > expectedEndMinutes + tolLate
              return { name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early, late }
            })
            .filter(r => r.early || r.late)
            .sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = {
            type: 'weekday',
            localDate: dateIso,
            weekdayIndex: idx,
            weekdayLabel: 'Saturday',
            isWeekend: true,
            policy: {
              expectedStartMinutes,
              expectedEndMinutes,
              toleranceEarlyMinutes: tolEarly,
              toleranceLateMinutes: tolLate,
            },
            rows: list,
          }
          day.imageDataUrl = renderDayToPngDataUrl(day)
          results.push(day)
          continue
        }
        if (idx === 0) {
          if (consumed.has(dateIso)) continue
          const expectedStartMinutes = weekendExpectedStart!
          const expectedEndMinutes = weekendExpectedEnd!
          const tolEarly = clampNumber(weekendPolicy.toleranceEarlyMinutes, 0, 600)
          const tolLate = clampNumber(weekendPolicy.toleranceLateMinutes, 0, 600)
          const list = (byDate.get(dateIso) || [])
            .map<EmployeeResultRow>(e => {
              const name = `${e.fname} ${e.lname}`.trim()
              const early = e.entryMinutes < expectedStartMinutes - tolEarly
              const late = e.exitMinutes > expectedEndMinutes + tolLate
              return { name, entryMinutes: e.entryMinutes, exitMinutes: e.exitMinutes, early, late }
            })
            .filter(r => r.early || r.late)
            .sort((a, b) => a.name.localeCompare(b.name))
          const day: DayResult = {
            type: 'weekday',
            localDate: dateIso,
            weekdayIndex: idx,
            weekdayLabel: 'Sunday',
            isWeekend: true,
            policy: {
              expectedStartMinutes,
              expectedEndMinutes,
              toleranceEarlyMinutes: tolEarly,
              toleranceLateMinutes: tolLate,
            },
            rows: list,
          }
          day.imageDataUrl = renderDayToPngDataUrl(day)
          results.push(day)
          continue
        }
      }

      await yieldToUi()
      setProcessingStage('Rendering PNG images...')
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.type === 'weekend') {
          r.imageDataUrl = renderWeekendToPngDataUrl(r)
        } else {
          r.imageDataUrl = renderDayToPngDataUrl(r)
        }
        if (i % 2 === 1) {
          await yieldToUi()
        }
      }

      setDayResults(results)
    } catch (err) {
      setDayResults([])
      setParseError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setIsProcessing(false)
      setProcessingStage('')
    }
  }

  function downloadPng(dataUrl: string, name: string) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)',
        padding: '20px 20px 60px',
      }}
    >
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--color-text-primary)', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>
            Auto-Log
          </div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500 }}>
            CSV upload → local processing → per-day PNG image
          </div>
        </div>
        <div style={{ position: 'absolute', right: 0, top: 0 }}>
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginBottom: 0, marginTop: 0 }}
            title="Toggle theme"
            disabled={isProcessing}
          >
            <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div
          className="card"
          style={{
            background: 'var(--color-background-primary)',
            border: '1.5px solid var(--color-border-divider)',
            borderRadius: 12,
            padding: 16,
            flex: '0 0 420px',
            width: '100%',
            maxWidth: 420,
          }}
        >
          <div className="d-flex flex-column" style={{ gap: 14 }}>
            <div>
              <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13, marginBottom: 10 }}>
                CSV
              </div>
              <div
                role="button"
                tabIndex={0}
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (isProcessing) return
                  setIsDraggingFile(true)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (isProcessing) return
                  setIsDraggingFile(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (isProcessing) return
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDraggingFile(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (isProcessing) return
                  setIsDraggingFile(false)
                  const file = e.dataTransfer.files?.[0] || null
                  void onPickFile(file)
                }}
                style={{
                  border: `1.5px dashed ${isDraggingFile ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                  background: 'var(--color-background-primary)',
                  borderRadius: 10,
                  padding: 12,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  userSelect: 'none',
                  outline: 'none',
                }}
              >
                <div className="d-flex align-items-center justify-content-between" style={{ gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13 }}>
                      Drag & drop your CSV here
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: 12 }}>
                      {fileName ? `Selected: ${fileName}` : 'No file selected'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary-custom"
                    style={{ width: 40, height: 34, padding: 0, fontSize: 14, marginBottom: 0, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => {
                      if (isProcessing) return
                      fileInputRef.current?.click()
                    }}
                    disabled={isProcessing}
                    title="Browse"
                  >
                    <i className="bi bi-folder2-open" />
                  </button>
                </div>
                <div style={{ marginTop: 8, color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: 11 }}>
                  You can also click the folder icon.
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
                disabled={isProcessing}
              />
            </div>

            <div
              style={{
                background: 'var(--color-background-primary)',
                border: '1.5px solid var(--color-border-divider)',
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13, marginBottom: 10 }}>
                Monday–Friday
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Expected clock-in
                  </div>
                  <input
                    type="text"
                    className="form-control"
                    value={weekdayPolicy.expectedStart}
                    onChange={(e) => setWeekdayPolicy(p => ({ ...p, expectedStart: e.target.value }))}
                    placeholder="07:00 AM"
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Expected clock-out
                  </div>
                  <input
                    type="text"
                    className="form-control"
                    value={weekdayPolicy.expectedEnd}
                    onChange={(e) => setWeekdayPolicy(p => ({ ...p, expectedEnd: e.target.value }))}
                    placeholder="05:00 PM"
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Early tolerance (min)
                  </div>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    max={600}
                    value={weekdayPolicy.toleranceEarlyMinutes}
                    onChange={(e) => setWeekdayPolicy(p => ({ ...p, toleranceEarlyMinutes: clampNumber(Number(e.target.value), 0, 600) }))}
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Late tolerance (min)
                  </div>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    max={600}
                    value={weekdayPolicy.toleranceLateMinutes}
                    onChange={(e) => setWeekdayPolicy(p => ({ ...p, toleranceLateMinutes: clampNumber(Number(e.target.value), 0, 600) }))}
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'var(--color-background-primary)',
                border: '1.5px solid var(--color-border-divider)',
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13, marginBottom: 10 }}>
                Saturday / Sunday
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Expected clock-in
                  </div>
                  <input
                    type="text"
                    className="form-control"
                    value={weekendPolicy.expectedStart}
                    onChange={(e) => setWeekendPolicy(p => ({ ...p, expectedStart: e.target.value }))}
                    placeholder="08:00 AM"
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Expected clock-out
                  </div>
                  <input
                    type="text"
                    className="form-control"
                    value={weekendPolicy.expectedEnd}
                    onChange={(e) => setWeekendPolicy(p => ({ ...p, expectedEnd: e.target.value }))}
                    placeholder="05:00 PM"
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Early tolerance (min)
                  </div>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    max={600}
                    value={weekendPolicy.toleranceEarlyMinutes}
                    onChange={(e) => setWeekendPolicy(p => ({ ...p, toleranceEarlyMinutes: clampNumber(Number(e.target.value), 0, 600) }))}
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    Late tolerance (min)
                  </div>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    max={600}
                    value={weekendPolicy.toleranceLateMinutes}
                    onChange={(e) => setWeekendPolicy(p => ({ ...p, toleranceLateMinutes: clampNumber(Number(e.target.value), 0, 600) }))}
                    disabled={isProcessing}
                    style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="btn-primary-custom"
                disabled={!canProcess}
                onClick={() => process()}
                style={{ height: 44, borderRadius: 10, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                {isProcessing && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />}
                {isProcessing ? 'Processing...' : 'Process and generate images'}
              </button>

              {isProcessing && (
                <div style={{ color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: 12 }}>
                  {processingStage}
                </div>
              )}

              <button
                type="button"
                className="btn-secondary-custom"
                onClick={() => {
                  setCsvText('')
                  setDayResults([])
                  setParseError('')
                  setFileName('')
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                style={{ height: 40, borderRadius: 10, fontSize: 13, marginBottom: 0 }}
                disabled={isProcessing}
              >
                Clear
              </button>
            </div>

            {parseError && (
              <div style={{ color: 'var(--negative-color)', fontWeight: 700, fontSize: 13 }}>
                {parseError}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: '1 1 520px', minWidth: 320 }}>
          {isProcessing && (
            <div
              className="card"
              style={{
                background: 'var(--color-background-primary)',
                border: '1.5px solid var(--color-border-divider)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13 }}>
                {processingStage || 'Processing...'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {dayResults.map((d) => (
              <div
                key={('type' in d && d.type === 'weekend') ? d.dates.join('&') : (d as DayResult).localDate}
                className="card"
                style={{
                  background: 'var(--color-background-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between" style={{ gap: 10, marginBottom: 12 }}>
                  <div>
                    {('type' in d && d.type === 'weekend') ? (
                      <>
                        <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 16 }}>
                          {(d as WeekendResult).dates[0]} & {(d as WeekendResult).dates[1]} • Saturday & Sunday
                        </div>
                        <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 12 }}>
                          Out of range: {(d as WeekendResult).rows.length} • Window: {formatMinutesToTime((d as WeekendResult).policy.expectedStartMinutes)}–{formatMinutesToTime((d as WeekendResult).policy.expectedEndMinutes)} • Tolerance: -{(d as WeekendResult).policy.toleranceEarlyMinutes}/+{(d as WeekendResult).policy.toleranceLateMinutes} min
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 16 }}>
                          {(d as DayResult).localDate} • {(d as DayResult).weekdayLabel}
                        </div>
                        <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 12 }}>
                          Out of range: {(d as DayResult).rows.length} • Window: {formatMinutesToTime((d as DayResult).policy.expectedStartMinutes)}–{formatMinutesToTime((d as DayResult).policy.expectedEndMinutes)} • Tolerance: -{(d as DayResult).policy.toleranceEarlyMinutes}/+{(d as DayResult).policy.toleranceLateMinutes} min
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary-custom d-flex align-items-center justify-content-center"
                      style={{ height: 38, padding: '0 12px', fontSize: 13, marginBottom: 0 }}
                      onClick={() => {
                        const dataUrl = ('type' in d && d.type === 'weekend')
                          ? ((d as WeekendResult).imageDataUrl || renderWeekendToPngDataUrl(d as WeekendResult))
                          : ((d as DayResult).imageDataUrl || renderDayToPngDataUrl(d as DayResult))
                        const fileTag = ('type' in d && d.type === 'weekend') ? (d as WeekendResult).dates.join('_') : (d as DayResult).localDate
                        downloadPng(dataUrl, `auto-log_${fileTag}.png`)
                      }}
                      disabled={('type' in d && d.type === 'weekend') ? !(d as WeekendResult).imageDataUrl : !(d as DayResult).imageDataUrl}
                      title={('type' in d && d.type === 'weekend') ? ((d as WeekendResult).imageDataUrl ? 'Download PNG' : 'No image') : ((d as DayResult).imageDataUrl ? 'Download PNG' : 'No image')}
                    >
                      <i className="bi bi-download" style={{ marginRight: 8 }} />
                      Download PNG
                    </button>
                  </div>
                </div>

                {('type' in d && d.type === 'weekend') ? (
                  (d as WeekendResult).imageDataUrl && (
                    <div style={{ width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--color-border-divider)' }}>
                      <img src={(d as WeekendResult).imageDataUrl} alt={`Auto-Log ${(d as WeekendResult).dates.join(' & ')}`} style={{ width: '100%', display: 'block' }} />
                    </div>
                  )
                ) : (
                (d as DayResult).imageDataUrl && (
                  <div style={{ width: '100%', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--color-border-divider)' }}>
                    <img src={(d as DayResult).imageDataUrl} alt={`Auto-Log ${(d as DayResult).localDate}`} style={{ width: '100%', display: 'block' }} />
                  </div>
                ))}
              </div>
            ))}

            {dayResults.length === 0 && !parseError && !isProcessing && (
              <div
                className="card"
                style={{
                  background: 'var(--color-background-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  borderRadius: 12,
                  padding: 16,
                  color: 'var(--color-text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Upload a CSV and click “Process and generate images”.
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          background: 'var(--color-background-primary)',
          border: '1.5px solid var(--color-border-divider)',
          borderRadius: 12,
          padding: 16,
          display: 'none',
        }}
      />
    </div>
  )
}
