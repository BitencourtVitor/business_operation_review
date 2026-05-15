"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ArrowDown, ArrowUp, ChevronsUpDown, FileText, Filter, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { weeklyReportService, type WeeklyReport } from "@/services/qbtime-weekly-report.service"

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
]

type HourFormat = "number" | "time"
type SortKey = "name" | "hoursMonWed" | "surplus" | "thursFriAvailable"
type SortDir = "asc" | "desc"
type ViewMode = "employee" | "job_costing"

type EmployeeResult = {
  name: string
  hoursMonWed: number
  surplus: number
  thursFriAvailable: number
}

type JobCodeResult = {
  jobCode: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

const LS_FORMAT_KEY = "whc_hour_format"
const LS_SORT_KEY = "whc_sort"
const MON_WED = new Set(["Monday", "Tuesday", "Wednesday"])

function loadSavedFormat(): HourFormat {
  try { return (localStorage.getItem(LS_FORMAT_KEY) as HourFormat) || "number" } catch { return "number" }
}

function loadSavedSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(LS_SORT_KEY)
    if (raw) { const p = JSON.parse(raw); if (p.key && p.dir) return p }
  } catch { /* */ }
  return { key: "name", dir: "asc" }
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

function buildResultsCanvas(results: EmployeeResult[], hoursPerDay: number, weekStart: string, isDark: boolean): HTMLCanvasElement {
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

  const cols = [
    { label: "Employee", x: padX, w: 300, align: "left" as const },
    { label: "Hours Mon–Wed", x: padX + 300, w: 150, align: "center" as const },
    { label: "Surplus", x: padX + 450, w: 130, align: "center" as const },
    { label: "Thu–Fri Available", x: padX + 580, w: 200, align: "center" as const },
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

  const sy = padY + titleH, sw = (W - padX * 2) / 3 - 8
  const statData = [
    { label: "Employees", value: `${results.length}`, color: ACCENT },
    { label: "Expected Mon–Wed", value: `${hoursPerDay * 3}h`, color: T1 },
    { label: "Max Thu–Fri", value: `${hoursPerDay * 2}h`, color: GREEN },
  ]
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
    ctx.fillText(`${r.hoursMonWed}h`, cols[1].x + cols[1].w / 2, cy)
    ctx.fillStyle = r.surplus > 0 ? RED : r.surplus < 0 ? GREEN : T2
    ctx.font = `700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.fillText(`${r.surplus > 0 ? "+" : ""}${r.surplus}h`, cols[2].x + cols[2].w / 2, cy)
    ctx.fillStyle = r.thursFriAvailable === 0 ? RED : T1; ctx.font = `700 14px monospace`
    ctx.fillText(`${r.thursFriAvailable}h`, cols[3].x + cols[3].w / 2, cy)
    ctx.textAlign = "left"
  })

  ctx.fillStyle = T2; ctx.font = `11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText("Premium Group · Business Operations Review", padX, H - 10)

  return canvas
}

function exportResultsAsImage(results: EmployeeResult[], hoursPerDay: number, weekStart: string, isDark: boolean) {
  const canvas = buildResultsCanvas(results, hoursPerDay, weekStart, isDark)
  const link = document.createElement("a")
  link.download = `weekly-hours-${new Date().toISOString().split("T")[0]}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
}

function exportResultsAsPdf(results: EmployeeResult[], hoursPerDay: number, weekStart: string, isDark: boolean) {
  const canvas = buildResultsCanvas(results, hoursPerDay, weekStart, isDark)
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
  const [results, setResults] = useState<EmployeeResult[]>([])
  const [jobCodeResults, setJobCodeResults] = useState<JobCodeResult[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>("employee")
  const [onlyExceeding, setOnlyExceeding] = useState(false)
  const [hourFormat, setHourFormat] = useState<HourFormat>(() => loadSavedFormat())
  const [sortKey, setSortKey] = useState<SortKey>(() => loadSavedSort().key)
  const [sortDir, setSortDir] = useState<SortDir>(() => loadSavedSort().dir)

  useEffect(() => {
    try { localStorage.setItem(LS_FORMAT_KEY, hourFormat) } catch { /* */ }
  }, [hourFormat])

  useEffect(() => {
    try { localStorage.setItem(LS_SORT_KEY, JSON.stringify({ key: sortKey, dir: sortDir })) } catch { /* */ }
  }, [sortKey, sortDir])

  useEffect(() => {
    async function fetchWeeklyData() {
      setLoading(true)
      setError("")
      try {
        const today = new Date().toISOString().split("T")[0]
        const apiData = await weeklyReportService.get(company, today)
        setData(apiData)

        const hoursPerDay = apiData.hoursPerDay || 8
        const expectedMonWed = hoursPerDay * 3
        const fullWeek = hoursPerDay * 5

        const employeeMap = new Map<string, { name: string; hoursMonWed: number }>()
        const jobCodeMap = new Map<string, { regularHours: number; overtimeHours: number; totalHours: number }>()

        for (const emp of apiData.employees) {
          let monWedHours = 0
          for (const day of emp.days) {
            if (MON_WED.has(day.day)) {
              monWedHours += day.totalHours
            }
          }

          const hoursMonWed = Math.round(monWedHours * 10) / 10
          employeeMap.set(emp.name, { name: emp.name, hoursMonWed })

          for (const day of emp.days) {
            for (const addr of day.addresses) {
              if (!jobCodeMap.has(addr.address)) {
                jobCodeMap.set(addr.address, { regularHours: 0, overtimeHours: 0, totalHours: 0 })
              }
              const jc = jobCodeMap.get(addr.address)!
              jc.totalHours += addr.hours
              jc.regularHours += addr.hours
            }
          }
        }

        setResults(
          [...employeeMap.values()].map(({ name, hoursMonWed }) => ({
            name,
            hoursMonWed,
            surplus: Math.round((hoursMonWed - expectedMonWed) * 10) / 10,
            thursFriAvailable: Math.max(0, Math.round((fullWeek - hoursMonWed) * 10) / 10),
          })).sort((a, b) => b.surplus - a.surplus),
        )

        setJobCodeResults(
          [...jobCodeMap.entries()].map(([jobCode, { regularHours, overtimeHours, totalHours }]) => ({
            jobCode,
            regularHours: Math.round(regularHours * 10) / 10,
            overtimeHours: Math.round(overtimeHours * 10) / 10,
            totalHours: Math.round(totalHours * 10) / 10,
          })).sort((a, b) => b.totalHours - a.totalHours),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch weekly data")
        setResults([])
        setJobCodeResults([])
      } finally {
        setLoading(false)
      }
    }

    fetchWeeklyData()
  }, [company])

  function handleSort(key: SortKey) {
    if (key === sortKey) { setSortDir(d => d === "asc" ? "desc" : "asc") }
    else { setSortKey(key); setSortDir("asc") }
  }

  function currentIsDark() {
    return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  }

  const displayResults = useMemo(() => {
    const base = onlyExceeding ? results.filter(r => r.surplus > 0) : results
    return [...base].sort((a, b) => {
      const v = sortKey === "name"
        ? a.name.localeCompare(b.name)
        : a[sortKey] - b[sortKey]
      return sortDir === "asc" ? v : -v
    })
  }, [results, onlyExceeding, sortKey, sortDir])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Weekly Hours Control</h1>
            <p className="text-sm text-muted-foreground">Mon–Wed summary · Thu–Fri availability</p>
          </div>

          <div className="flex shrink-0 items-end gap-3">
            <div className="flex flex-col items-start gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Company</p>
              <div className="flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5">
                {COMPANIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCompany(c.value)}
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

            {!loading && results.length > 0 && (
              <div className="flex flex-col items-start gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">View</p>
                <div className="flex h-8 w-auto items-center rounded-lg border border-border bg-muted/40 p-0.5">
                  {([
                    { mode: "employee" as ViewMode, label: "Agregação Semanal" },
                    { mode: "job_costing" as ViewMode, label: "Job Costing" },
                  ]).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        "flex h-7 items-center rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap",
                        viewMode === mode
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loading && results.length > 0 && viewMode === "employee" && (
              <div className="flex flex-col items-start gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Filter</p>
                <Button
                  variant={onlyExceeding ? "destructive" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setOnlyExceeding(v => !v)}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Only exceeding
                </Button>
              </div>
            )}

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

            {!loading && results.length > 0 && (
              <div className="self-stretch w-px bg-border" />
            )}

            {!loading && results.length > 0 && (
              <div className="flex flex-col items-start gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Export as</p>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => data && exportResultsAsImage(displayResults, data.hoursPerDay, data.weekStart, currentIsDark())}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Image
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => data && exportResultsAsPdf(displayResults, data.hoursPerDay, data.weekStart, currentIsDark())}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
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

        {!loading && results.length === 0 && !error && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card/60">
            <p className="text-muted-foreground">No data available for this week</p>
          </div>
        )}

        {!loading && viewMode === "employee" && results.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card/60">
              <div className="flex items-center border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium">
                  {displayResults.length} employee{displayResults.length !== 1 ? "s" : ""}
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{data?.hoursPerDay || 8}h/day</span>
                </span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                    {([
                      { key: "name" as SortKey, label: "Employee", align: "left" },
                      { key: "hoursMonWed" as SortKey, label: "Hours Mon–Wed", align: "center" },
                      { key: "surplus" as SortKey, label: "Surplus", align: "center" },
                      { key: "thursFriAvailable" as SortKey, label: "Thu–Fri Available", align: "center" },
                    ]).map(({ key, label, align }) => (
                      <TableHead
                        key={key}
                        className={cn(
                          "whitespace-nowrap text-[11px] font-bold uppercase tracking-wide",
                          align === "center" && "text-center",
                        )}
                      >
                        <button
                          onClick={() => handleSort(key)}
                          className={cn(
                            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                            align === "center" && "justify-center w-full",
                            sortKey === key ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {label}
                          {sortKey === key
                            ? sortDir === "asc"
                              ? <ArrowUp className="h-3 w-3" />
                              : <ArrowDown className="h-3 w-3" />
                            : <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          }
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayResults.map((r) => (
                    <TableRow key={r.name} className="border-border/50">
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-center font-mono font-bold tabular-nums">
                        {fmtH(r.hoursMonWed, hourFormat)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                          r.surplus > 0 ? "bg-destructive/10 text-destructive"
                            : r.surplus < 0 ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground",
                        )}>
                          {r.surplus > 0 && <ArrowUp className="h-3 w-3" />}
                          {r.surplus < 0 && <ArrowDown className="h-3 w-3" />}
                          {r.surplus > 0 ? "+" : ""}{fmtH(Math.abs(r.surplus), hourFormat)}
                        </span>
                      </TableCell>
                      <TableCell className={cn(
                        "text-center font-mono font-bold tabular-nums",
                        r.thursFriAvailable === 0 && "text-destructive",
                      )}>
                        {fmtH(r.thursFriAvailable, hourFormat)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {!loading && viewMode === "job_costing" && jobCodeResults.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card/60">
              <div className="flex items-center border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium">
                  {jobCodeResults.length} job code{jobCodeResults.length !== 1 ? "s" : ""}
                </span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-left">
                      Job Code
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-center">
                      Regular Hours
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-center">
                      Overtime Hours
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-center">
                      Total Hours
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobCodeResults.map((r) => (
                    <TableRow key={r.jobCode} className="border-border/50">
                      <TableCell className="font-medium text-sm">{r.jobCode || "—"}</TableCell>
                      <TableCell className="text-center font-mono font-bold tabular-nums">
                        {fmtH(r.regularHours, hourFormat)}
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold tabular-nums text-amber-600">
                        {fmtH(r.overtimeHours, hourFormat)}
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold tabular-nums">
                        {fmtH(r.totalHours, hourFormat)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
