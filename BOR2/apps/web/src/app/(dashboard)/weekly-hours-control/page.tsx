"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ChevronDown, ChevronRight, ChevronsUpDown, ChevronsDownUp, FileText, ImageIcon, Download, X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { weeklyReportService, type WeeklyReport } from "@/services/qbtime-weekly-report.service"
import { qbtimeTeamService } from "@/services/qbtime.service"

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
]

type HourFormat = "number" | "time"

type EmployeeResult = {
  name: string
  hoursLogged: number
  surplus: number
  available: number
}

type QBTeam = { id: string; name: string; members: string[] }

type JCAddress = { path: string[]; hours: number }
type JCDay = { date: string; day: string; totalHours: number; addresses: JCAddress[] }
type JCEmployee = {
  name: string
  weekTotal: number     // total net hours (after exclusions) for the full week
  hoursLogged: number   // total net hours for past days only
  surplus: number       // hoursLogged - (hoursPerDay × pastDays)
  available: number     // max(0, fullWeek − hoursLogged)
  days: JCDay[]
}
type JCTeamGroup = { teamName: string; employees: JCEmployee[] }

const DEFAULT_EXCLUDED = ["Lunch break", "Lunch break office"]
const LS_EXCLUDED_KEY = "whc_excluded_addresses"
const LS_SELECTED_DAYS_KEY = "whc_selected_days"

function loadExcluded(): string[] {
  try {
    const raw = localStorage.getItem(LS_EXCLUDED_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return DEFAULT_EXCLUDED
}

function loadSelectedDays(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_SELECTED_DAYS_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* */ }
  return new Set(WORKDAYS)
}

const LS_FORMAT_KEY = "whc_hour_format"
const WORKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

function getWeekdaySplit(now: Date): { pastDays: string[]; remainingDays: string[] } {
  const dow = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  if (dow === 0) return { pastDays: [], remainingDays: WORKDAYS }
  if (dow === 6) return { pastDays: WORKDAYS, remainingDays: [] }
  const idx = dow - 1
  return { pastDays: WORKDAYS.slice(0, idx), remainingDays: WORKDAYS.slice(idx) }
}

function abbreviateDay(d: string): string {
  return d.slice(0, 3)
}

function rangeLabel(days: string[]): string {
  if (days.length === 0) return "—"
  if (days.length === 1) return abbreviateDay(days[0])
  return `${abbreviateDay(days[0])}–${abbreviateDay(days[days.length - 1])}`
}

function loadSavedFormat(): HourFormat {
  try { return (localStorage.getItem(LS_FORMAT_KEY) as HourFormat) || "number" } catch { return "number" }
}


function fmtH(h: number, format: HourFormat): string {
  if (format === "time") {
    const totalMin = Math.round(Math.abs(h) * 60)
    const hrs = Math.floor(totalMin / 60)
    const min = totalMin % 60
    return `${hrs}:${String(min).padStart(2, "0")}`
  }
  return `${h.toFixed(1)}h`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// dayLabel: when provided → day mode (2 cols: name + hours for that day). Undefined → week mode (4 cols).
function buildResultsCanvas(results: EmployeeResult[], hoursPerDay: number, weekStart: string, isDark: boolean, pastDays: string[], remainingDays: string[], dayLabel?: string): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = 860, padX = 40, padY = 36, rowH = 42, thH = 40, titleH = 72, statsH = 72, footerH = 32
  const H = padY + titleH + statsH + thH + results.length * rowH + padY + footerH

  const canvas = document.createElement("canvas")
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext("2d")!
  ctx.scale(dpr, dpr)

  const BG = isDark ? "#0d0d1a" : "#f1f4f9", CARD = isDark ? "#1a1a2e" : "#ffffff"
  const T1 = isDark ? "#e2e8f0" : "#1a202c", T2 = isDark ? "#718096" : "#718096"
  const BORDER = isDark ? "#2d3748" : "#e2e8f0", ACCENT = "#2e6be6"
  const RED = "#ef4444", GREEN = "#10B981", ROWODD = isDark ? "#131325" : "#f8fafc"

  const pastLabel = rangeLabel(pastDays)
  const remainingLabel = rangeLabel(remainingDays)
  const isDayMode = !!dayLabel

  const cols = isDayMode
    ? [
        { label: "Employee",            x: padX,       w: 560, align: "left"   as const },
        { label: `Hours ${dayLabel}`,   x: padX + 560, w: 200, align: "center" as const },
      ]
    : [
        { label: "Employee",                  x: padX,       w: 300, align: "left"   as const },
        { label: `Hours ${pastLabel}`,        x: padX + 300, w: 150, align: "center" as const },
        { label: "Surplus",                   x: padX + 450, w: 130, align: "center" as const },
        { label: `${remainingLabel} Available`, x: padX + 580, w: 200, align: "center" as const },
      ]

  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = CARD
  roundRect(ctx, padX - 16, padY - 16, W - (padX - 16) * 2, H - padY + 16 - footerH, 14); ctx.fill()

  ctx.fillStyle = ACCENT
  ctx.font = `600 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText("Weekly Hours Control", padX, padY + 22)
  ctx.fillStyle = T2
  ctx.font = `12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText(`Week of ${weekStart}  ·  ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}`, padX, padY + 44)

  const sy = padY + titleH
  const totalHours = results.reduce((s, r) => s + r.hoursLogged, 0)
  const statData = isDayMode
    ? [
        { label: "Employees",          value: `${results.length}`,           color: ACCENT },
        { label: `Total ${dayLabel}`,  value: `${totalHours.toFixed(1)}h`,   color: T1 },
      ]
    : [
        { label: "Employees",            value: `${results.length}`,                     color: ACCENT },
        { label: `Expected ${pastLabel}`, value: `${hoursPerDay * pastDays.length}h`,    color: T1 },
        { label: `Max ${remainingLabel}`, value: `${hoursPerDay * remainingDays.length}h`, color: GREEN },
      ]
  const sw = (W - padX * 2) / statData.length - 8
  statData.forEach((s, i) => {
    const sx = padX + i * (sw + 8)
    ctx.fillStyle = isDark ? "#111122" : "#f0f4ff"
    roundRect(ctx, sx, sy, sw, statsH - 8, 8); ctx.fill()
    ctx.fillStyle = s.color; ctx.font = `700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.textAlign = "center"; ctx.fillText(s.value, sx + sw / 2, sy + 28)
    ctx.fillStyle = T2; ctx.font = `11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.fillText(s.label, sx + sw / 2, sy + 48); ctx.textAlign = "left"
  })

  const ty = sy + statsH
  ctx.fillStyle = isDark ? "#111122" : "#f0f4ff"
  ctx.fillRect(padX - 16, ty, W - (padX - 16) * 2, thH)
  ctx.fillStyle = T2; ctx.font = `700 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  cols.forEach(col => {
    if (col.align === "center") { ctx.textAlign = "center"; ctx.fillText(col.label.toUpperCase(), col.x + col.w / 2, ty + 24) }
    else { ctx.textAlign = "left"; ctx.fillText(col.label.toUpperCase(), col.x, ty + 24) }
  })
  ctx.textAlign = "left"
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(padX - 16, ty + thH); ctx.lineTo(W - padX + 16, ty + thH); ctx.stroke()

  results.forEach((r, i) => {
    const ry = ty + thH + i * rowH
    if (i % 2 === 1) { ctx.fillStyle = ROWODD; ctx.fillRect(padX - 16, ry, W - (padX - 16) * 2, rowH) }
    ctx.strokeStyle = BORDER; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(padX - 16, ry + rowH); ctx.lineTo(W - padX + 16, ry + rowH); ctx.stroke()
    const cy = ry + rowH / 2 + 5
    ctx.fillStyle = T1; ctx.font = `500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.textAlign = "left"; ctx.fillText(r.name, cols[0].x, cy)
    ctx.fillStyle = T1; ctx.font = `700 14px monospace`; ctx.textAlign = "center"
    ctx.fillText(`${r.hoursLogged}h`, cols[1].x + cols[1].w / 2, cy)
    if (!isDayMode) {
      ctx.fillStyle = r.surplus > 0 ? RED : r.surplus < 0 ? GREEN : T2
      ctx.font = `700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
      ctx.fillText(`${r.surplus > 0 ? "+" : ""}${r.surplus}h`, cols[2].x + cols[2].w / 2, cy)
      ctx.fillStyle = r.available === 0 ? RED : T1; ctx.font = `700 14px monospace`
      ctx.fillText(`${r.available}h`, cols[3].x + cols[3].w / 2, cy)
    }
    ctx.textAlign = "left"
  })

  ctx.fillStyle = T2; ctx.font = `11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText("Premium Group · Business Operations Review", padX, H - 10)

  return canvas
}

function exportResultsAsImage(results: EmployeeResult[], hoursPerDay: number, weekStart: string, isDark: boolean, pastDays: string[], remainingDays: string[], dayLabel?: string) {
  const canvas = buildResultsCanvas(results, hoursPerDay, weekStart, isDark, pastDays, remainingDays, dayLabel)
  const link = document.createElement("a")
  link.download = `weekly-hours-${new Date().toISOString().split("T")[0]}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
}

function exportResultsAsPdf(results: EmployeeResult[], hoursPerDay: number, weekStart: string, isDark: boolean, pastDays: string[], remainingDays: string[], dayLabel?: string) {
  const canvas = buildResultsCanvas(results, hoursPerDay, weekStart, isDark, pastDays, remainingDays, dayLabel)
  const dataUrl = canvas.toDataURL("image/png")
  const win = window.open("", "_blank")
  if (!win) return
  win.document.write(`<!DOCTYPE html>
<html><head><title>Weekly Hours Control</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fff; display: flex; justify-content: center; align-items: flex-start; }
  img { width: 100%; height: auto; display: block; }
  @page { margin: 0; size: auto; }
  @media print { html, body { width: 100%; } }
</style></head>
<body><img src="${dataUrl}" /><script>
  window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }
</script></body></html>`)
  win.document.close()
}

export default function WeeklyHoursControlPage() {
  const [company, setCompany] = useState("framing")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<WeeklyReport | null>(null)
  const [teams, setTeams] = useState<QBTeam[]>([])
  const [excludedAddresses, setExcludedAddresses] = useState<string[]>(() => loadExcluded())
  const [excludeInput, setExcludeInput] = useState("")
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())
  const [selectedDays, setSelectedDays] = useState<Set<string>>(() => loadSelectedDays())
  const [hourFormat, setHourFormat] = useState<HourFormat>(() => loadSavedFormat())

  useEffect(() => {
    try { localStorage.setItem(LS_FORMAT_KEY, hourFormat) } catch { /* */ }
  }, [hourFormat])

  useEffect(() => {
    try { localStorage.setItem(LS_SELECTED_DAYS_KEY, JSON.stringify([...selectedDays])) } catch { /* */ }
  }, [selectedDays])

  const { pastDays, remainingDays } = useMemo(() => getWeekdaySplit(new Date()), [])
  const isWeekMode = useMemo(() => WORKDAYS.every(d => selectedDays.has(d)), [selectedDays])
  const selectedDaysLabel = useMemo(() => rangeLabel(WORKDAYS.filter(d => selectedDays.has(d))), [selectedDays])

  useEffect(() => {
    async function fetchWeeklyData() {
      setLoading(true)
      setError("")
      try {
        const today = new Date().toISOString().split("T")[0]
        const apiData = await weeklyReportService.get(company, today)
        setData(apiData)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch weekly data")
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    fetchWeeklyData()
  }, [company])

  useEffect(() => {
    qbtimeTeamService.list(company).then(setTeams).catch(() => setTeams([]))
  }, [company])

  useEffect(() => {
    try { localStorage.setItem(LS_EXCLUDED_KEY, JSON.stringify(excludedAddresses)) } catch { /* */ }
  }, [excludedAddresses])

  const jobCostingTeams = useMemo((): JCTeamGroup[] => {
    if (!data) return []
    const excludedSet = new Set(excludedAddresses.map(a => a.toLowerCase().trim()))
    const hoursPerDay = data.hoursPerDay || 8
    const expectedFromPast = hoursPerDay * pastDays.length
    const fullWeek = hoursPerDay * WORKDAYS.length
    const pastDaysSet = new Set(pastDays)

    const employeeMap = new Map<string, JCEmployee>()
    for (const emp of (data.employees ?? [])) {
      const days: JCDay[] = emp.days.map(day => {
        const addresses = day.addresses
          .map(a => {
            // compat: old API returns { address, jobCode?, hours }, new returns { path, hours }
            let path: string[]
            if (Array.isArray(a.path) && a.path.length > 0) {
              path = a.path
            } else {
              const old = a as unknown as { address?: string; jobCode?: string }
              const addr = old.address ?? "—"
              path = old.jobCode ? [addr, old.jobCode] : [addr]
            }
            return { path, hours: Math.round(a.hours * 10) / 10 }
          })
          .filter(a => !a.path.some(p => excludedSet.has(p.toLowerCase().trim())))
        return {
          date: day.date,
          day: day.day,
          totalHours: Math.round(addresses.reduce((s, a) => s + a.hours, 0) * 10) / 10,
          addresses,
        }
      }).filter(d => d.addresses.length > 0)

      const weekTotal = Math.round(days.reduce((s, d) => s + d.totalHours, 0) * 10) / 10
      const hoursLogged = Math.round(days.filter(d => pastDaysSet.has(d.day)).reduce((s, d) => s + d.totalHours, 0) * 10) / 10
      const surplus = Math.round((hoursLogged - expectedFromPast) * 10) / 10
      const available = Math.max(0, Math.round((fullWeek - hoursLogged) * 10) / 10)

      employeeMap.set(emp.name, { name: emp.name, weekTotal, hoursLogged, surplus, available, days })
    }

    const result: JCTeamGroup[] = []
    const assigned = new Set<string>()
    for (const team of teams) {
      const members = team.members.map(n => employeeMap.get(n)).filter(Boolean) as JCEmployee[]
      if (members.length > 0) {
        result.push({ teamName: team.name, employees: members.sort((a, b) => a.name.localeCompare(b.name)) })
        members.forEach(e => assigned.add(e.name))
      }
    }
    const unassigned = [...employeeMap.values()].filter(e => !assigned.has(e.name)).sort((a, b) => a.name.localeCompare(b.name))
    if (unassigned.length > 0) result.push({ teamName: "Unassigned", employees: unassigned })
    return result
  }, [data, teams, excludedAddresses, pastDays])

  function addExclusion() {
    const v = excludeInput.trim()
    if (!v || excludedAddresses.includes(v)) { setExcludeInput(""); return }
    setExcludedAddresses(prev => [...prev, v])
    setExcludeInput("")
  }

  function removeExclusion(addr: string) {
    setExcludedAddresses(prev => prev.filter(a => a !== addr))
  }

  function toggleEmployee(name: string) {
    setExpandedEmployees(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function toggleDay(day: string) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      next.has(day) ? next.delete(day) : next.add(day)
      return next
    })
  }

  function selectAllDays() {
    setSelectedDays(new Set(WORKDAYS))
  }

  function clearAllDays() {
    setSelectedDays(new Set())
  }

  function expandTeam(names: string[]) {
    setExpandedEmployees(prev => {
      const next = new Set(prev)
      names.forEach(n => next.add(n))
      return next
    })
  }

  function collapseTeam(names: string[]) {
    setExpandedEmployees(prev => {
      const next = new Set(prev)
      names.forEach(n => next.delete(n))
      return next
    })
  }

  function currentIsDark() {
    return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  }

  // Flat results for export — adapts to current mode
  const exportRows = useMemo(() => {
    return jobCostingTeams.flatMap(g => g.employees.map(e => {
      if (isWeekMode) {
        return { name: e.name, hoursLogged: e.hoursLogged, surplus: e.surplus, available: e.available }
      }
      const filtered = Math.round(e.days.filter(d => selectedDays.has(d.day)).reduce((s, d) => s + d.totalHours, 0) * 10) / 10
      return { name: e.name, hoursLogged: filtered, surplus: 0, available: 0 }
    }))
  }, [jobCostingTeams, isWeekMode, selectedDays])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Weekly Hours Control</h1>
            <p className="text-sm text-muted-foreground">
              {isWeekMode
                ? <>{rangeLabel(pastDays)} summary · {rangeLabel(remainingDays)} availability</>
                : selectedDays.size === 0 ? "No days selected" : <>{selectedDaysLabel} view</>
              }
            </p>
          </div>

          <div className="flex shrink-0 items-end gap-3">
            <div className="flex flex-col items-start gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Company</p>
              <div className="flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
                {COMPANIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCompany(c.value)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                      company === c.value
                        ? "bg-background shadow-sm"
                        : "hover:bg-muted",
                    )}
                    title={c.label}
                  >
                    <Image src={c.logo} alt={c.label} width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-start gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Metric Mode</p>
              <div className="flex h-8 w-36 items-center rounded-lg border border-border bg-muted/40 p-0.5">
                {([
                  { fmt: "number", label: "Number" },
                  { fmt: "time", label: "Hour" },
                ] as { fmt: HourFormat; label: string }[]).map(({ fmt, label }) => (
                  <button
                    key={fmt}
                    onClick={() => setHourFormat(fmt)}
                    className={cn(
                      "flex h-7 flex-1 items-center justify-center rounded-md px-4 text-xs font-medium transition-colors",
                      hourFormat === fmt
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!loading && exportRows.length > 0 && (
              <div className="self-stretch w-px bg-border" />
            )}

            {!loading && exportRows.length > 0 && (
              <Popover>
                <PopoverTrigger render={
                  <Button size="sm" className="h-8 gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                } />
                <PopoverContent className="w-fit p-2" align="end">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start gap-2"
                      onClick={() => data && exportResultsAsImage(exportRows, data.hoursPerDay, data.weekStart, currentIsDark(), pastDays, remainingDays, isWeekMode ? undefined : selectedDaysLabel)}
                    >
                      <ImageIcon className="h-4 w-4" />
                      Image (PNG)
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start gap-2"
                      onClick={() => data && exportResultsAsPdf(exportRows, data.hoursPerDay, data.weekStart, currentIsDark(), pastDays, remainingDays, isWeekMode ? undefined : selectedDaysLabel)}
                    >
                      <FileText className="h-4 w-4" />
                      PDF
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card/60">
            <p className="text-muted-foreground">Loading weekly data...</p>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span className="mt-0.5 shrink-0">⚠</span>
            {error}
          </div>
        )}

        {!loading && !error && jobCostingTeams.length === 0 && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card/60">
            <p className="text-muted-foreground">No data available for this week</p>
          </div>
        )}

        {!loading && jobCostingTeams.length > 0 && (
          <div className="flex flex-col gap-4">
            {/* Filters: Exclude addresses + Days */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
              {/* Exclude addresses */}
              <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Exclude addresses</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {excludedAddresses.map(addr => (
                    <Badge key={addr} variant="secondary" className="gap-1 pr-1 text-[11px]">
                      {addr}
                      <button onClick={() => removeExclusion(addr)} className="ml-0.5 rounded hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      value={excludeInput}
                      onChange={e => setExcludeInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addExclusion()}
                      placeholder="Add address…"
                      className="h-6 rounded-md border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
                    />
                    <button onClick={addExclusion} disabled={!excludeInput.trim()} className="flex h-6 w-6 items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground hover:bg-muted disabled:opacity-40">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Days filter */}
              <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Days</p>
                  <div className="flex items-center gap-2">
                    <button onClick={selectAllDays} className="text-[10px] font-medium text-muted-foreground hover:text-foreground">All</button>
                    <span className="text-[10px] text-muted-foreground/40">·</span>
                    <button onClick={clearAllDays} className="text-[10px] font-medium text-muted-foreground hover:text-foreground">None</button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {WORKDAYS.map(day => {
                    const isOn = selectedDays.has(day)
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          isOn
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {abbreviateDay(day)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Team groups */}
            {jobCostingTeams.map(group => (
              <div key={group.teamName} className="overflow-hidden rounded-xl border border-border bg-card/60">
                {/* Team header */}
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{group.teamName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{group.employees.length} member{group.employees.length !== 1 ? "s" : ""}</span>
                  <TooltipProvider>
                    <div className="ml-2 flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => expandTeam(group.employees.map(e => e.name))}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <ChevronsUpDown className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>Expand all</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => collapseTeam(group.employees.map(e => e.name))}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <ChevronsDownUp className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>Collapse all</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => {
                            if (!data) return
                            const rows = group.employees.map(e => {
                              if (isWeekMode) return { name: e.name, hoursLogged: e.hoursLogged, surplus: e.surplus, available: e.available }
                              const filtered = Math.round(e.days.filter(d => selectedDays.has(d.day)).reduce((s, d) => s + d.totalHours, 0) * 10) / 10
                              return { name: e.name, hoursLogged: filtered, surplus: 0, available: 0 }
                            })
                            exportResultsAsImage(rows, data.hoursPerDay, data.weekStart, currentIsDark(), pastDays, remainingDays, isWeekMode ? undefined : selectedDaysLabel)
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>Export team PNG</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>

                <div className="divide-y divide-border/50">
                  {group.employees.map(emp => {
                    const isExpanded = expandedEmployees.has(emp.name)
                    const visibleDays = emp.days.filter(d => selectedDays.has(d.day))
                    const filteredHours = Math.round(visibleDays.reduce((s, d) => s + d.totalHours, 0) * 10) / 10
                    return (
                      <div key={emp.name}>
                        {/* Employee row — clickable to expand */}
                        <button
                          onClick={() => toggleEmployee(emp.name)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          }
                          <span className="flex-1 truncate text-sm font-medium">{emp.name}</span>

                          {/* Stats: week mode shows logged/surplus/available; day mode shows filtered hours only */}
                          <div className="hidden items-center sm:flex" style={{ gap: "2.5rem" }}>
                            {isWeekMode ? (
                              <>
                                <div className="flex min-w-[56px] flex-col items-end">
                                  <span className="font-mono text-sm font-bold tabular-nums">{fmtH(emp.hoursLogged, hourFormat)}</span>
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{rangeLabel(pastDays)}</span>
                                </div>
                                <div className="flex min-w-[56px] flex-col items-end">
                                  <span className={cn(
                                    "font-mono text-sm font-bold tabular-nums",
                                    emp.surplus > 0 ? "text-destructive"
                                      : emp.surplus < 0 ? "text-emerald-600"
                                      : "text-muted-foreground",
                                  )}>
                                    {emp.surplus > 0 ? "+" : ""}{fmtH(Math.abs(emp.surplus), hourFormat)}
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                    {emp.surplus > 0 ? "Over" : emp.surplus < 0 ? "Under" : "On track"}
                                  </span>
                                </div>
                                <div className="flex min-w-[56px] flex-col items-end">
                                  <span className={cn(
                                    "font-mono text-sm font-bold tabular-nums",
                                    emp.available === 0 && "text-destructive",
                                  )}>{fmtH(emp.available, hourFormat)}</span>
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{rangeLabel(remainingDays)} avail</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex min-w-[56px] flex-col items-end">
                                <span className="font-mono text-sm font-bold tabular-nums">{fmtH(filteredHours, hourFormat)}</span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{selectedDaysLabel || "—"}</span>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Expanded: days → addresses */}
                        {isExpanded && (
                          <div className="border-t border-border/30 bg-muted/10 px-4 pb-3 pt-2">
                            {visibleDays.length === 0 ? (
                              <p className="py-2 text-xs italic text-muted-foreground">No data for the selected days</p>
                            ) : (
                              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                                {visibleDays.map(day => (
                                  <div key={day.date} className="overflow-hidden rounded-md border border-border/40 bg-card/40">
                                    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-1.5">
                                      <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/80">{day.day}</span>
                                      <span className="text-[11px] text-muted-foreground/60">{day.date}</span>
                                      <span className="ml-auto font-mono text-[11px] font-bold text-foreground">{fmtH(day.totalHours, hourFormat)}</span>
                                    </div>
                                    <div className="divide-y divide-border/40">
                                      {day.addresses.map((addr, i) => (
                                        <div key={i} className="flex items-start gap-2 px-3 py-2 text-[12px]">
                                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <span className="font-medium text-foreground/90">{addr.path[0]}</span>
                                            {addr.path.length > 1 && (
                                              <span className="text-[11px] text-muted-foreground">
                                                {addr.path.slice(1).join(" › ")}
                                              </span>
                                            )}
                                          </div>
                                          <span className="shrink-0 font-mono tabular-nums text-foreground/80">{fmtH(addr.hours, hourFormat)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
