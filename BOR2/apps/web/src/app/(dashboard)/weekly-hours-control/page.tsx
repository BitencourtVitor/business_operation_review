"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  FileUp,
  ImageIcon,
  RotateCcw,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

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

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const delim = guessDelimiter(text)
  const rowsRaw: string[][] = []
  let row: string[] = [], field = "", inQ = false
  const pushF = () => { row.push(field.trim()); field = "" }
  const pushR = () => { if (row.length) { rowsRaw.push(row); row = [] } }
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
  const headers = (rowsRaw[0] || []).map(h => h.trim())
  return { headers, rows: rowsRaw.slice(1).filter(r => r.some(c => c.trim())) }
}

function parseHours(raw: string): number {
  if (!raw) return 0
  const t = raw.trim()
  if (t.includes(":")) {
    const [h, m] = t.split(":").map(Number)
    return (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m) / 60
  }
  return parseFloat(t) || 0
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MON_WED = new Set(["Mon", "Tue", "Wed"])
const LS_EXCLUDED_KEY = "whc_excluded_categories"

const KNOWN_EXCLUDED_PREFIXES = [
  "Lunch break", "Lunch Break", "Lunch Break Paid", "Lunch Break Office",
  "Lunck Break Paid", "Holiday Paid", "Holiday", "Sick", "Admin", "Office",
]

function isKnownExcluded(key: string) {
  return KNOWN_EXCLUDED_PREFIXES.some(p => key === p || key.startsWith(p + " ›"))
}

function buildJobcodeKey(row: string[], headers: string[]): string {
  return ["jobcode_1", "jobcode_2", "jobcode_3", "jobcode_4"]
    .map(col => row[headers.findIndex(h => h === col)]?.trim() || "")
    .filter(Boolean)
    .join(" › ")
}

function loadSavedExcluded(): Set<string> | null {
  try {
    const raw = localStorage.getItem(LS_EXCLUDED_KEY)
    if (!raw) return null
    return new Set(JSON.parse(raw) as string[])
  } catch { return null }
}

function saveExcluded(excluded: Set<string>) {
  try { localStorage.setItem(LS_EXCLUDED_KEY, JSON.stringify([...excluded])) } catch { /* */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EmployeeResult = {
  name: string
  hoursMonWed: number
  surplus: number
  thursFriAvailable: number
}

// ─── Canvas Export ────────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function exportResultsAsImage(results: EmployeeResult[], hoursPerDay: number, fileName: string, isDark: boolean) {
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
    { label: "Employee",          x: padX,       w: 300, align: "left"   as const },
    { label: "Hours Mon–Wed",     x: padX + 300, w: 150, align: "center" as const },
    { label: "Surplus",           x: padX + 450, w: 130, align: "center" as const },
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
  ctx.fillText(`${fileName}  ·  ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}`, padX, padY + 44)

  const sy = padY + titleH, sw = (W - padX * 2) / 3 - 8
  const statData = [
    { label: "Employees",        value: `${results.length}`,   color: ACCENT },
    { label: "Expected Mon–Wed", value: `${hoursPerDay * 3}h`, color: T1    },
    { label: "Max Thu–Fri",      value: `${hoursPerDay * 2}h`, color: GREEN },
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

  const link = document.createElement("a")
  link.download = `weekly-hours-${new Date().toISOString().split("T")[0]}.png`
  link.href = canvas.toDataURL("image/png"); link.click()
}

// ─── Category Dropdown ────────────────────────────────────────────────────────

function CategoryDropdown({ allCategories, excluded, onChange, disabled }: {
  allCategories: string[]
  excluded: Set<string>
  onChange: (next: Set<string>) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = allCategories.filter(c => c.toLowerCase().includes(search.toLowerCase()))
  const includedCount = allCategories.length - excluded.size

  function toggle(cat: string) {
    const next = new Set(excluded)
    if (next.has(cat)) next.delete(cat); else next.add(cat)
    onChange(next)
  }

  return (
    <Popover open={open && !disabled} onOpenChange={v => { if (!disabled) setOpen(v) }}>
      <PopoverTrigger render={
        <Button variant="outline" size="sm" disabled={disabled} className="w-full justify-between font-normal text-xs" />
      }>
        <span className="truncate">
          {disabled ? "Upload a file first" : `${includedCount} of ${allCategories.length} included`}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 gap-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex gap-2 border-b p-2">
          <Button variant="outline" size="sm"
            className="h-7 flex-1 border-destructive/30 text-xs text-destructive hover:text-destructive"
            onClick={() => onChange(new Set(allCategories))}>Exclude all</Button>
          <Button variant="outline" size="sm"
            className="h-7 flex-1 border-emerald-600/30 text-xs text-emerald-600 hover:text-emerald-600"
            onClick={() => onChange(new Set())}>Include all</Button>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No matches</p>}
          {filtered.map(cat => {
            const isExcluded = excluded.has(cat)
            return (
              <label key={cat} className={cn(
                "flex cursor-pointer items-center gap-2.5 border-l-2 px-3 py-1.5 transition-colors",
                isExcluded ? "border-destructive bg-destructive/5" : "border-transparent hover:bg-muted/50",
              )}>
                <Checkbox checked={isExcluded} onCheckedChange={() => toggle(cat)}
                  className={cn("h-3.5 w-3.5 shrink-0",
                    isExcluded && "border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                  )}
                />
                <span title={cat} className={cn(
                  "flex-1 text-xs leading-tight",
                  isExcluded ? "font-medium text-destructive" : "text-foreground",
                )}>{cat}</span>
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyHoursControlPage() {
  const [step, setStep]               = useState<"upload" | "results">("upload")
  const [fileName, setFileName]       = useState("")
  const [headers, setHeaders]         = useState<string[]>([])
  const [rows, setRows]               = useState<string[][]>([])
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [excluded, setExcluded]       = useState<Set<string>>(() => loadSavedExcluded() ?? new Set())
  const [results, setResults]         = useState<EmployeeResult[]>([])
  const [onlyExceeding, setOnlyExceeding] = useState(false)
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [error, setError]             = useState("")
  const [isDragging, setIsDragging]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function currentIsDark() {
    return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  }

  useEffect(() => { saveExcluded(excluded) }, [excluded])

  useEffect(() => {
    if (!rows.length) return
    const dayIdx      = headers.findIndex(h => h === "local_day")
    const hoursIdx    = headers.findIndex(h => h === "hours")
    const fnameIdx    = headers.findIndex(h => h === "fname")
    const lnameIdx    = headers.findIndex(h => h === "lname")
    const usernameIdx = headers.findIndex(h => h === "username")

    const expectedMonWed = hoursPerDay * 3
    const fullWeek       = hoursPerDay * 5
    const map = new Map<string, { name: string; hours: number }>()

    for (const row of rows) {
      const day = row[dayIdx]?.trim()
      if (!MON_WED.has(day)) continue
      const cat = buildJobcodeKey(row, headers)
      if (excluded.has(cat)) continue
      const fname    = row[fnameIdx]?.trim() || ""
      const lname    = row[lnameIdx]?.trim() || ""
      const username = row[usernameIdx]?.trim() || ""
      const key      = username || `${fname} ${lname}`.trim()
      const name     = `${fname} ${lname}`.trim() || username
      if (!map.has(key)) map.set(key, { name, hours: 0 })
      map.get(key)!.hours += parseHours(row[hoursIdx] || "0")
    }

    setResults(
      [...map.values()].map(({ name, hours }) => {
        const h = Math.round(hours * 100) / 100
        return {
          name,
          hoursMonWed: h,
          surplus: Math.round((h - expectedMonWed) * 100) / 100,
          thursFriAvailable: Math.max(0, Math.round((fullWeek - h) * 100) / 100),
        }
      }).sort((a, b) => b.surplus - a.surplus),
    )
  }, [rows, headers, excluded, hoursPerDay])

  function processFile(file: File) {
    setError("")
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const { headers: h, rows: r } = parseCsvText(text)

        const dayIdx   = h.findIndex(x => x === "local_day")
        const hoursIdx = h.findIndex(x => x === "hours")
        const jc1Idx   = h.findIndex(x => x === "jobcode_1")

        if (jc1Idx === -1 || dayIdx === -1 || hoursIdx === -1) {
          setError("Required columns not found. Make sure this is a QB Time CSV export.")
          return
        }

        const cats = new Set<string>()
        for (const row of r) {
          const key = buildJobcodeKey(row, h)
          if (key) cats.add(key)
        }

        setHeaders(h); setRows(r); setFileName(file.name)
        setAllCategories([...cats].sort((a, b) => a.localeCompare(b)))

        const saved = loadSavedExcluded()
        if (saved) {
          const merged = new Set(saved)
          for (const cat of cats) { if (isKnownExcluded(cat)) merged.add(cat) }
          setExcluded(merged)
        } else {
          setExcluded(new Set([...cats].filter(isKnownExcluded)))
        }

        setStep("results")
      } catch {
        setError("Failed to parse the file. Make sure it is a valid QB Time CSV export.")
      }
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleReset() {
    setStep("upload"); setRows([]); setHeaders([])
    setAllCategories([]); setFileName(""); setResults([]); setError("")
  }

  const displayResults = onlyExceeding ? results.filter(r => r.surplus > 0) : results

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">

      {/* ── Settings sidebar ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">

        {/* Sidebar header */}
        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
            Weekly Hours
          </p>
        </div>

        {/* Settings content */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

          {/* Hours per day */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Expected Hours / Day
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number" min={1} max={24} value={hoursPerDay}
                onChange={e => setHoursPerDay(Math.max(1, Math.min(24, parseInt(e.target.value) || 8)))}
                className="w-16 text-center font-bold"
              />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <div>Mon–Wed: <span className="font-semibold text-foreground">{hoursPerDay * 3}h</span></div>
                <div>Thu–Fri: <span className="font-semibold text-foreground">{hoursPerDay * 2}h</span></div>
              </div>
            </div>
          </div>

          <div className="h-px bg-sidebar-border" />

          {/* Job code categories */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Job Code Categories
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Checked items are{" "}
              <span className="font-semibold text-destructive">excluded</span>{" "}
              from hours. Saved automatically.
            </p>
            <CategoryDropdown
              allCategories={allCategories}
              excluded={excluded}
              onChange={setExcluded}
              disabled={allCategories.length === 0}
            />
            {allCategories.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {excluded.size} excluded · {allCategories.length - excluded.size} counted
              </p>
            )}
          </div>

          {/* Export — only when results are loaded */}
          {step === "results" && results.length > 0 && (
            <>
              <div className="h-px bg-sidebar-border" />
              <div className="flex flex-col gap-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  Export
                </p>
                <label className="flex cursor-pointer select-none items-center gap-2">
                  <Checkbox
                    checked={onlyExceeding}
                    onCheckedChange={v => setOnlyExceeding(v === true)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs text-muted-foreground">
                    Only <span className="font-semibold text-destructive">exceeding</span> employees
                  </span>
                </label>
                <Button variant="outline" size="sm" className="w-full gap-1.5"
                  onClick={() => exportResultsAsImage(displayResults, hoursPerDay, fileName, currentIsDark())}>
                  <ImageIcon className="h-3.5 w-3.5" />
                  Export as Image
                </Button>
              </div>
            </>
          )}

          {/* New file — only when in results */}
          {step === "results" && (
            <>
              <div className="mt-auto h-px bg-sidebar-border" />
              <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" />
                New file
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">

          {/* Page title */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Weekly Hours Control</h1>
              <p className="text-sm text-muted-foreground">Mon–Wed summary · Thu–Fri availability</p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span className="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          )}

          {/* ══════ UPLOAD ══════ */}
          {step === "upload" && (
            <div className="mx-auto max-w-lg">
              <div className="rounded-xl border border-border bg-card/60">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="font-semibold">Upload QB Time Report</h2>
                  <p className="text-sm text-muted-foreground">
                    Export the weekly timesheet from QB Time and drop it here.
                  </p>
                </div>
                <div className="p-5">
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex cursor-pointer select-none flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-10 text-center transition-colors",
                      isDragging
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <FileUp className={cn("h-5 w-5", isDragging ? "text-primary" : "text-muted-foreground/40")} />
                    <p className="text-xs font-medium text-muted-foreground">Drop the CSV here</p>
                    <p className="text-[11px] text-muted-foreground/60">Drag & drop or click to select</p>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv"
                      className="hidden" onChange={handleFileInput} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════ RESULTS ══════ */}
          {step === "results" && (
            <div className="flex flex-col gap-4">

              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Employees",        value: `${results.length}`,   className: "text-primary" },
                  { label: "Expected Mon–Wed",  value: `${hoursPerDay * 3}h`, className: ""            },
                  { label: "Max Thu–Fri",       value: `${hoursPerDay * 2}h`, className: "text-emerald-600" },
                ].map(s => (
                  <div key={s.label} className="overflow-hidden rounded-xl border border-border bg-card/60">
                    <div className="flex flex-col gap-0.5 px-4 py-3.5">
                      <span className={cn("text-2xl font-bold tabular-nums", s.className)}>{s.value}</span>
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Results table */}
              <div className="overflow-hidden rounded-xl border border-border bg-card/60">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-sm font-medium">
                    {results.length} employee{results.length !== 1 ? "s" : ""}
                    <span className="mx-1.5 text-border">·</span>
                    <span className="text-muted-foreground">{fileName}</span>
                    <span className="mx-1.5 text-border">·</span>
                    <span className="text-muted-foreground">{hoursPerDay}h/day</span>
                  </span>
                  {onlyExceeding && (
                    <Badge variant="destructive" className="text-xs">Exceeding only</Badge>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                      <TableHead className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide">Employee</TableHead>
                      <TableHead className="whitespace-nowrap text-center text-[11px] font-bold uppercase tracking-wide">Hours Mon–Wed</TableHead>
                      <TableHead className="whitespace-nowrap text-center text-[11px] font-bold uppercase tracking-wide">Surplus</TableHead>
                      <TableHead className="whitespace-nowrap text-center text-[11px] font-bold uppercase tracking-wide">Thu–Fri Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                          No Mon–Wed entries found with the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                    {displayResults.map((r) => (
                      <TableRow key={r.name} className="border-border/50">
                        <TableCell className="font-medium">{r.name}</TableCell>

                        <TableCell className="text-center font-mono font-bold tabular-nums">
                          {r.hoursMonWed}h
                        </TableCell>

                        {/* Positive surplus = over hours = red (bad); negative = under = green (capacity available) */}
                        <TableCell className="text-center">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                            r.surplus > 0 ? "bg-destructive/10 text-destructive"
                            : r.surplus < 0 ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground",
                          )}>
                            {r.surplus > 0 && <ArrowUp className="h-3 w-3" />}
                            {r.surplus < 0 && <ArrowDown className="h-3 w-3" />}
                            {r.surplus > 0 ? "+" : ""}{r.surplus}h
                          </span>
                        </TableCell>

                        <TableCell className={cn(
                          "text-center font-mono font-bold tabular-nums",
                          r.thursFriAvailable === 0 && "text-destructive",
                        )}>
                          {r.thursFriAvailable}h
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
    </div>
  )
}
