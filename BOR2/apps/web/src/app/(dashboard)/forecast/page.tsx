"use client"

import { ForecastCard } from "@/components/features/forecast/forecast-card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useForecast } from "@/hooks/use-forecast"
import type { ForecastDisplayStatus, ForecastProject } from "@bor2/shared"
import { getForecastDisplayStatus } from "@bor2/shared"
import { ArrowDown, ArrowUp, Building2, Calendar, CalendarDays, FileText, Flag, MapPin, Package, SlidersHorizontal, Truck, X } from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type DateMode   = "start" | "beams"
type StatusMode = "only" | "on" | "off"
type IntegMode  = "all" | "done" | "pendent"

interface StatusToggles {
  overdue:   StatusMode
  planned:   StatusMode
  active:    StatusMode
  completed: StatusMode
}

interface IntegFilters {
  fieldwire:    IntegMode
  buildertrend: IntegMode
  qbTime:       IntegMode
  machines:     IntegMode
  storage:      IntegMode
  contract:     IntegMode
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const MONTHS = [
  { value: 0, label: "January"  }, { value: 1, label: "February" },
  { value: 2, label: "March"    }, { value: 3, label: "April"    },
  { value: 4, label: "May"      }, { value: 5, label: "June"     },
  { value: 6, label: "July"     }, { value: 7, label: "August"   },
  { value: 8, label: "September"}, { value: 9, label: "October"  },
  { value: 10,label: "November" }, { value: 11,label: "December" },
]

const STATUS_ROWS: { key: keyof StatusToggles; label: string; color: string }[] = [
  { key: "overdue",   label: "Overdue",     color: "#ef4444" },
  { key: "planned",   label: "Not Started", color: "#3b82f6" },
  { key: "active",    label: "Open",        color: "#22c55e" },
  { key: "completed", label: "Closed",      color: "#6b7280" },
]

const DEFAULT_STATUS: StatusToggles = { overdue: "on", planned: "on", active: "off", completed: "off" }
const DEFAULT_INTEG: IntegFilters   = { fieldwire: "all", buildertrend: "all", qbTime: "all", machines: "all", storage: "all", contract: "all" }

const STATUS_METRIC_COLORS: Record<ForecastDisplayStatus, string> = {
  active:    "text-green-600 dark:text-green-400",
  planned:   "text-blue-500 dark:text-blue-400",
  overdue:   "text-red-600 dark:text-red-400",
  completed: "text-slate-500 dark:text-slate-400",
  cancelled: "text-zinc-400",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLocalDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, day)
}

function getProjectMonth(p: ForecastProject, mode: DateMode) {
  const raw = mode === "beams" && p.previousBeamsDate ? p.previousBeamsDate : p.startDate
  const d = parseLocalDate(typeof raw === "string" ? raw : new Date(raw).toISOString())
  return { year: d.getFullYear(), month: d.getMonth() }
}

function isTruthy(v?: string | boolean | null): boolean {
  if (typeof v === "boolean") return v
  if (!v) return false
  return ["yes","sim","true","1","y","scheduled","dispensed","done","complete"].includes(v.toLowerCase().trim())
}

function isFieldwireDone(p: ForecastProject)   { return !!p.fieldwire?.length && p.fieldwire.every(f => isTruthy(f.status)) }
function isMachinesDone(p: ForecastProject)    { return !!p.machines?.length  && p.machines.every(m => isTruthy(m.status))  }
function isContractDone(p: ForecastProject)    { return !!p.contractSteps?.length && p.contractSteps.every(c => isTruthy(c.status)) }

function applyInteg(mode: IntegMode, done: boolean) {
  if (mode === "all") return true
  return mode === "done" ? done : !done
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}

function IntegRow({ label, value, onChange, icon }: {
  label: string; value: IntegMode; onChange: (v: IntegMode) => void; icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-5 items-center justify-center">{icon}</div>
      <span className="flex-1 text-xs font-medium">{label}</span>
      <div className="flex items-center rounded-md border text-[10px] font-semibold overflow-hidden">
        {(["all","done","pendent"] as IntegMode[]).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "px-2 py-1 capitalize transition-colors",
              value === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt === "pendent" ? "Pending" : opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

function StatusRow({ label, color, value, hasOnly, onChange }: {
  label: string; color: string; value: StatusMode; hasOnly: boolean; onChange: (v: StatusMode) => void
}) {
  const dimmed = hasOnly && value !== "only"
  return (
    <div className={cn("flex items-center gap-2 transition-opacity", dimmed && "opacity-40")}>
      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 text-xs font-medium">{label}</span>
      <div className="flex items-center rounded-md border text-[10px] font-semibold overflow-hidden">
        {(["only","on","off"] as StatusMode[]).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(value === opt && opt !== "on" ? "on" : opt)}
            className={cn(
              "px-2 py-1 uppercase transition-colors",
              value === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Filters Popover ──────────────────────────────────────────────────────────

interface FiltersPopoverProps {
  status:       StatusToggles
  integ:        IntegFilters
  client:       string
  location:     string
  type:         "all" | "building" | "lot"
  activeCount:  number
  clientOpts:   string[]
  locationOpts: string[]
  onStatus:     (k: keyof StatusToggles, v: StatusMode) => void
  onInteg:      (k: keyof IntegFilters, v: IntegMode) => void
  onClient:     (v: string) => void
  onLocation:   (v: string) => void
  onType:       (v: "all" | "building" | "lot") => void
  onClear:      () => void
}

function FiltersPopover(props: FiltersPopoverProps) {
  const { status, integ, client, location, type, activeCount, clientOpts, locationOpts,
          onStatus, onInteg, onClient, onLocation, onType, onClear } = props

  const hasOnly = Object.values(status).some(v => v === "only")

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button className="flex h-8 w-[80px] items-center justify-between rounded-lg border border-input bg-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30" />
        }
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="tabular-nums">{activeCount}</span>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={6} className="w-[580px] max-w-[95vw] gap-0 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
          {activeCount > 0 && (
            <button onClick={onClear} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-2 divide-x">

          {/* ── Left: Status + Project + Type ── */}
          <div className="flex flex-col gap-4 p-4">

            <div className="flex flex-col gap-2">
              <SectionLabel>Status Filters</SectionLabel>
              {STATUS_ROWS.map(({ key, label, color }) => (
                <StatusRow
                  key={key}
                  label={label}
                  color={color}
                  value={status[key]}
                  hasOnly={hasOnly}
                  onChange={(v) => onStatus(key, v)}
                />
              ))}
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2">
              <SectionLabel>Project</SectionLabel>
              <div className="flex gap-2">
                {/* Client */}
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Client</span>
                  <Select value={client} onValueChange={(v) => onClient(v ?? "all")}>
                    <SelectTrigger className="h-7 w-full gap-1.5 text-xs">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{client === "all" ? "All" : client}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {clientOpts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Location */}
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Location</span>
                  <Select value={location} onValueChange={(v) => onLocation(v ?? "all")}>
                    <SelectTrigger className="h-7 w-full gap-1.5 text-xs">
                      <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{location === "all" ? "All" : location}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {locationOpts.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Type</SectionLabel>
                <div className="flex items-center overflow-hidden rounded-md border text-[10px] font-semibold">
                  {([
                    { value: "all",      label: "All"      },
                    { value: "building", label: "Building" },
                    { value: "lot",      label: "Lot"      },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => onType(value)}
                      className={cn(
                        "px-2 py-1 capitalize transition-colors",
                        type === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* ── Right: External Integrations + Internal Resources ── */}
          <div className="flex flex-col gap-4 p-4">

            <div className="flex flex-col gap-2">
              <SectionLabel>External Integrations</SectionLabel>
              <IntegRow label="Fieldwire"    value={integ.fieldwire}    onChange={v => onInteg("fieldwire", v)}
                icon={<img src="/images/icon_fieldwire.png" alt="" className="h-4 w-4 object-contain" />} />
              <IntegRow label="Buildertrend" value={integ.buildertrend} onChange={v => onInteg("buildertrend", v)}
                icon={<><img src="/images/icon_buildertrend.png" alt="" className="h-4 w-4 object-contain dark:hidden" /><img src="/images/icon_buildertrend_dark.png" alt="" className="hidden h-4 w-4 object-contain dark:block" /></>} />
              <IntegRow label="QBTime"       value={integ.qbTime}       onChange={v => onInteg("qbTime", v)}
                icon={<><img src="/images/icon_qbtime.png" alt="" className="h-4 w-4 object-contain dark:hidden" /><img src="/images/icon_qbtime_dark.png" alt="" className="hidden h-4 w-4 object-contain dark:block" /></>} />
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2">
              <SectionLabel>Internal Resources</SectionLabel>
              <IntegRow label="Machines" value={integ.machines} onChange={v => onInteg("machines", v)}
                icon={<Truck    className="h-4 w-4 text-muted-foreground" />} />
              <IntegRow label="Storage"  value={integ.storage}  onChange={v => onInteg("storage", v)}
                icon={<Package  className="h-4 w-4 text-muted-foreground" />} />
              <IntegRow label="Contract" value={integ.contract} onChange={v => onInteg("contract", v)}
                icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
            </div>

          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const [year, setYear]         = useState<number | "all">(CURRENT_YEAR)
  const [month, setMonth]       = useState<number | "all">(new Date().getMonth())
  const [dateMode, setDateMode] = useState<DateMode>("start")
  const [status, setStatus]     = useState<StatusToggles>(DEFAULT_STATUS)
  const [integ, setInteg]       = useState<IntegFilters>(DEFAULT_INTEG)
  const [client, setClient]     = useState("all")
  const [location, setLocation] = useState("all")
  const [type, setType]         = useState<"all" | "building" | "lot">("all")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  const { data: projects } = useForecast({ year: year === "all" ? undefined : year })
  const yearOptions = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - 1 + i)

  // Derived option lists from raw data
  const clientOpts   = useMemo(() => [...new Set(projects?.map(p => p.cliente).filter(Boolean))].sort() as string[], [projects])
  const locationOpts = useMemo(() => [...new Set(projects?.map(p => p.jobSite).filter(Boolean))].sort() as string[], [projects])

  // Active filter count
  const activeCount = useMemo(() => {
    let n = 0
    ;(Object.keys(DEFAULT_STATUS) as (keyof StatusToggles)[]).forEach(k => { if (status[k] !== DEFAULT_STATUS[k]) n++ })
    Object.values(integ).forEach(v => { if (v !== "all") n++ })
    if (client !== "all") n++
    if (location !== "all") n++
    if (type !== "all") n++
    return n
  }, [status, integ, client, location, type])

  function clearFilters() {
    setStatus(DEFAULT_STATUS)
    setInteg(DEFAULT_INTEG)
    setClient("all")
    setLocation("all")
    setType("all")
  }

  function handleStatus(k: keyof StatusToggles, v: StatusMode) {
    if (v === "only") {
      // clicking Only → this one becomes "only", all others become "off"
      const next = {} as StatusToggles
      for (const key of Object.keys(DEFAULT_STATUS) as (keyof StatusToggles)[]) {
        next[key] = key === k ? "only" : "off"
      }
      setStatus(next)
    } else {
      setStatus(prev => ({ ...prev, [k]: v }))
    }
  }
  function handleInteg(k: keyof IntegFilters, v: IntegMode) {
    setInteg(prev => ({ ...prev, [k]: v }))
  }

  const { grouped, metrics } = useMemo(() => {
    if (!projects) return { grouped: [], metrics: { total: 0, active: 0, overdue: 0, completed: 0, planned: 0, cancelled: 0 } }
    const m = { total: 0, active: 0, overdue: 0, completed: 0, planned: 0, cancelled: 0 }

    const hasOnly = Object.entries(status).find(([, v]) => v === "only")?.[0] as ForecastDisplayStatus | undefined

    const filtered = projects.filter((p) => {
      const pm = getProjectMonth(p, dateMode)
      if (year !== "all" && pm.year !== year) return false
      if (month !== "all" && pm.month !== month) return false

      const ds = getForecastDisplayStatus(p)

      // Status filter
      if (hasOnly) { if (ds !== hasOnly) return false }
      else { if ((status as unknown as Record<string, StatusMode>)[ds] === "off") return false }

      // Project filters
      if (client !== "all" && p.cliente !== client) return false
      if (location !== "all" && p.jobSite !== location) return false

      // Type filter
      if (type !== "all") {
        const t = (p.type || "").toLowerCase()
        if (type === "lot" && !t.includes("lot")) return false
        if (type === "building" && t.includes("lot")) return false
      }

      // Integration filters
      if (!applyInteg(integ.fieldwire,    isFieldwireDone(p)))  return false
      if (!applyInteg(integ.buildertrend, p.buildertrend))      return false
      if (!applyInteg(integ.qbTime,       p.qbTime))            return false
      if (!applyInteg(integ.machines,     isMachinesDone(p)))   return false
      if (!applyInteg(integ.storage,      p.storage))           return false
      if (!applyInteg(integ.contract,     isContractDone(p)))   return false

      m.total++
      m[ds]++
      return true
    })

    const map = new Map<string, ForecastProject[]>()
    for (const p of filtered) {
      const pm = getProjectMonth(p, dateMode)
      const key = `${pm.year}-${String(pm.month + 1).padStart(2, "0")}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }

    const grouped = Array.from(map.entries())
      .sort(([a], [b]) => sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a))
      .map(([key, items]) => {
        const [y, mo] = key.split("-").map(Number)
        const statusCounts = items.reduce((acc, p) => {
          const ds = getForecastDisplayStatus(p)
          acc[ds] = (acc[ds] ?? 0) + 1
          return acc
        }, {} as Partial<Record<ForecastDisplayStatus, number>>)
        return { key, label: `${MONTHS[mo - 1].label} ${y}`, items, statusCounts }
      })

    return { grouped, metrics: m }
  }, [projects, year, month, dateMode, status, integ, client, location, type, sortOrder])

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Framing Forecast</h1>
          <p className="text-sm text-muted-foreground">Project pipeline and execution schedule</p>
        </div>

        <div className="flex items-end gap-2">
          {/* Period */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Select value={String(year)} onValueChange={(v) => { setYear(v === "all" ? "all" : Number(v)); setMonth("all") }}>
                <SelectTrigger className="h-8 w-[72px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">
                    {year === "all" ? "All" : year}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border" />
              <Select value={String(month)} onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}>
                <SelectTrigger className="h-8 w-[100px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">
                    {month === "all" ? "All" : MONTHS.find(m => m.value === month)?.label ?? "All"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Group by */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Group by</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
              {(["start","beams"] as DateMode[]).map((m) => (
                <button key={m} onClick={() => setDateMode(m)}
                  className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                    dateMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "start" ? <CalendarDays className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
                  {m === "start" ? "Start" : "Beams"}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Order */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sort Order</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
              {([
                { value: "asc",  label: "Asc",  Icon: ArrowUp   },
                { value: "desc", label: "Desc", Icon: ArrowDown  },
              ] as const).map(({ value, label, Icon }) => (
                <button key={value} onClick={() => setSortOrder(value)}
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                    sortOrder === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Filters</span>
            <FiltersPopover
              status={status} integ={integ} client={client} location={location} type={type}
              activeCount={activeCount} clientOpts={clientOpts} locationOpts={locationOpts}
              onStatus={handleStatus} onInteg={handleInteg}
              onClient={setClient} onLocation={setLocation} onType={setType}
              onClear={clearFilters}
            />
          </div>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tabular-nums">{metrics.total}</span>
          <span className="text-xs text-muted-foreground">projects</span>
        </div>
        <div className="mx-1 h-4 w-px bg-border" />
        {(["active","planned","overdue","completed","cancelled"] as ForecastDisplayStatus[]).map(s =>
          metrics[s] > 0 ? (
            <div key={s} className="flex items-baseline gap-1">
              <span className={cn("text-sm font-semibold tabular-nums", STATUS_METRIC_COLORS[s])}>{metrics[s]}</span>
              <span className="text-xs text-muted-foreground">
                {s === "planned" ? "not started" : s === "completed" ? "closed" : s}
              </span>
            </div>
          ) : null
        )}
      </div>

      {/* ── Monthly groups ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-muted-foreground">
            <p className="text-sm font-medium">No projects match the selected filters</p>
            <p className="text-xs">Try adjusting the filters</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pb-4">
            {grouped.map(({ key, label, items, statusCounts }) => (
              <section key={key} className="overflow-hidden rounded-xl border bg-muted/30">
                <div className="flex items-center justify-between border-b bg-card px-4 py-2.5">
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <div className="flex items-center gap-3">
                    {statusCounts.overdue   ? <span className="text-[11px] font-medium text-red-500 dark:text-red-400">{statusCounts.overdue} overdue</span>   : null}
                    {statusCounts.planned   ? <span className="text-[11px] font-medium text-blue-500 dark:text-blue-400">{statusCounts.planned} not started</span> : null}
                    {statusCounts.active    ? <span className="text-[11px] font-medium text-green-500 dark:text-green-400">{statusCounts.active} open</span>      : null}
                    {statusCounts.completed ? <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{statusCounts.completed} closed</span>   : null}
                    <span className="h-3 w-px bg-border" />
                    <span className="text-[11px] text-muted-foreground">{items.length} total</span>
                  </div>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(p => <ForecastCard key={p.id} project={p} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
