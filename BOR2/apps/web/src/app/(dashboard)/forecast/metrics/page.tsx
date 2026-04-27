"use client"

import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useForecast } from "@/hooks/use-forecast"
import type { ForecastProject } from "@bor2/shared"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react"
import Link from "next/link"

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const ASPECTS = [
  { key: "fieldwire",    label: "Fieldwire",    short: "FW" },
  { key: "machines",     label: "Machines",     short: "MC" },
  { key: "contract",     label: "Contract",     short: "CT" },
  { key: "buildertrend", label: "Buildertrend", short: "BT" },
  { key: "storage",      label: "Storage",      short: "ST" },
  { key: "qbTime",       label: "QBTime",       short: "QB" },
] as const

type AspectKey = (typeof ASPECTS)[number]["key"]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isTruthy(v: boolean | string | null | undefined): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "boolean") return v
  return ["yes", "sim", "true", "1", "y"].includes(String(v).toLowerCase())
}

function isMachineOk(status: string | null | undefined): boolean {
  if (!status) return false
  return ["scheduled", "dispensed", "allocated", "true", "yes", "1"].includes(
    status.toLowerCase()
  )
}

function projectAspects(p: ForecastProject): Record<AspectKey, boolean> {
  return {
    fieldwire:    p.fieldwire?.length    ? p.fieldwire.every(d => isTruthy(d.status))     : false,
    machines:     p.machines?.length     ? p.machines.every(m => isMachineOk(m.status))   : false,
    contract:     p.contractSteps?.length ? p.contractSteps.every(s => isTruthy(s.status)) : false,
    buildertrend: !!p.buildertrend,
    storage:      !!p.storage,
    qbTime:       !!p.qbTime,
  }
}

function barColor(pct: number) {
  if (pct >= 100) return "bg-primary"
  if (pct >= 50)  return "bg-amber-500"
  return "bg-red-500"
}

function labelColor(pct: number) {
  if (pct >= 100) return "text-primary"
  if (pct >= 50)  return "text-amber-500"
  return "text-red-500"
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthData {
  key:      string          // "YYYY-MM"
  month:    number
  year:     number
  label:    string          // "April 2026"
  projects: ForecastProject[]
  done:     Record<AspectKey, number>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastMetricsPage() {
  const currentYear = new Date().getFullYear()
  const [year,         setYear]         = useState(String(currentYear))
  const [selectedMonth, setSelectedMonth] = useState("")

  const { data: projects = [], isLoading } = useForecast(
    year ? { year: Number(year) } : undefined
  )

  // ── Group by month ────────────────────────────────────────────────────────

  const monthsData = useMemo<MonthData[]>(() => {
    const map: Record<string, MonthData> = {}
    projects.forEach(p => {
      const raw = p.previousStartDate
      if (!raw) return
      const d = new Date(raw)
      if (isNaN(d.getTime())) return
      const m = d.getUTCMonth() + 1
      const y = d.getUTCFullYear()
      const key = `${y}-${String(m).padStart(2, "0")}`
      if (!map[key]) {
        map[key] = {
          key,
          month: m,
          year: y,
          label: `${MONTH_NAMES[m - 1]} ${y}`,
          projects: [],
          done: { fieldwire: 0, machines: 0, contract: 0, buildertrend: 0, storage: 0, qbTime: 0 },
        }
      }
      map[key].projects.push(p)
      const aspects = projectAspects(p)
      for (const a of ASPECTS) {
        if (aspects[a.key]) map[key].done[a.key]++
      }
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [projects])

  const years = useMemo(() => {
    const set = new Set(monthsData.map(m => String(m.year)))
    set.add(String(currentYear))
    set.add(String(currentYear - 1))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [monthsData, currentYear])

  const detailMonth = selectedMonth
    ? (monthsData.find(m => m.key === selectedMonth) ?? null)
    : null

  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full flex-col gap-4">

        {/* ── Header ── */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/forecast"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Forecast Metrics</h1>
              <p className="text-sm text-muted-foreground">
                Preparation scores across all planned projects
              </p>
            </div>
          </div>

          {/* Year filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Year
            </span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <Select
                value={year}
                onValueChange={v => { if (v) { setYear(v); setSelectedMonth("") } }}
              >
                <SelectTrigger className="h-8 w-[80px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{year}</span>
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Monthly summary strip (horizontal scroll) ── */}
        {monthsData.length > 0 && (
          <div className="shrink-0 overflow-x-auto">
            <div className="flex gap-3 pb-1">
              {monthsData.map(m => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMonth(prev => prev === m.key ? "" : m.key)}
                  className={`flex min-w-[140px] flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                    selectedMonth === m.key
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/50 bg-card/60 hover:border-border hover:bg-card"
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                    selectedMonth === m.key ? "text-primary" : "text-muted-foreground"
                  }`}>
                    {m.label}
                  </span>
                  <span className="text-2xl font-bold tabular-nums leading-none text-foreground">
                    {m.projects.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.projects.length === 1 ? "project" : "projects"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {monthsData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No projects with a start date in {year}.
            </div>
          ) : detailMonth ? (
            /* ── Detail view ── */
            <DetailView month={detailMonth} onBack={() => setSelectedMonth("")} />
          ) : (
            /* ── Overview grid ── */
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {monthsData.map(m => (
                <MonthCard
                  key={m.key}
                  month={m}
                  onClick={() => setSelectedMonth(m.key)}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </TooltipProvider>
  )
}

// ─── MonthCard ────────────────────────────────────────────────────────────────

function MonthCard({ month, onClick }: { month: MonthData; onClick: () => void }) {
  const total = month.projects.length

  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-4 text-left transition-all hover:border-border hover:bg-card hover:shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{month.label}</span>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {total} {total === 1 ? "project" : "projects"}
        </span>
      </div>

      {/* Aspect bars */}
      <div className="flex flex-col gap-2">
        {ASPECTS.map(a => {
          const done = month.done[a.key]
          const pct  = total > 0 ? Math.round((done / total) * 100) : 0
          return (
            <div key={a.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{a.label}</span>
                <span className={`text-[10px] font-semibold tabular-nums ${labelColor(pct)}`}>
                  {done}/{total} · {pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${barColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </button>
  )
}

// ─── DetailView ───────────────────────────────────────────────────────────────

function DetailView({ month, onBack }: { month: MonthData; onBack: () => void }) {
  const total = month.projects.length

  return (
    <div className="flex flex-col gap-4">
      {/* Detail header */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div>
          <h2 className="text-base font-semibold">{month.label}</h2>
          <p className="text-xs text-muted-foreground">{total} {total === 1 ? "project" : "projects"}</p>
        </div>
      </div>

      {/* Summary bars for the selected month */}
      <div className="grid shrink-0 grid-cols-3 gap-3 sm:grid-cols-6">
        {ASPECTS.map(a => {
          const done = month.done[a.key]
          const pct  = total > 0 ? Math.round((done / total) * 100) : 0
          return (
            <div
              key={a.key}
              className="flex flex-col gap-1 rounded-xl border border-border/50 bg-card/60 px-3 py-2.5"
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {a.short}
              </span>
              <span className={`text-lg font-bold tabular-nums leading-none ${labelColor(pct)}`}>
                {pct}%
              </span>
              <span className="text-[10px] text-muted-foreground">{done}/{total}</span>
            </div>
          )
        })}
      </div>

      {/* Per-project table */}
      <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
        <Table className="[&_td]:border-b [&_td]:border-border/50 [&_th]:border-b [&_th]:border-border">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="text-xs text-muted-foreground">Project</TableHead>
              {ASPECTS.map(a => (
                <TableHead key={a.key} className="w-10 px-2 text-center text-xs text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger className="cursor-default">{a.short}</TooltipTrigger>
                    <TooltipContent side="top">{a.label}</TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {month.projects.map(p => {
              const aspects = projectAspects(p)
              const label = [p.jobSite, p.loteBld].filter(Boolean).join(" - ") || p.name || p.id
              return (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap text-[11px] font-medium">
                    {label}
                  </TableCell>
                  {ASPECTS.map(a => (
                    <TableCell key={a.key} className="w-10 px-2 text-center">
                      {aspects[a.key]
                        ? <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-primary" />
                        : <XCircle      className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                      }
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
