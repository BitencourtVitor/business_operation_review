"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useQBChart, useQBProjects, useQBYears } from "@/hooks/use-qb-accounting"
import { ProjectDetailModal } from "./components/ProjectDetailModal"
import { useAria } from "./components/AIChatPanel"
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from "recharts"
import { Calendar, GalleryHorizontal, Search, X, TrendingUp, TrendingDown, BarChart2, FolderOpen, Info, ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01, ArrowUpRight, AlertTriangle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ProjectCard } from "@/services/qb-accounting.service"
import { useFinancialStore } from "@/store/financial.store"


const MONTHS = [
  { value: 1,  label: "January"   }, { value: 2,  label: "February"  },
  { value: 3,  label: "March"     }, { value: 4,  label: "April"     },
  { value: 5,  label: "May"       }, { value: 6,  label: "June"      },
  { value: 7,  label: "July"      }, { value: 8,  label: "August"    },
  { value: 9,  label: "September" }, { value: 10, label: "October"   },
  { value: 11, label: "November"  }, { value: 12, label: "December"  },
]

const COMPANY_LOGO: Record<string, string> = {
  hvac:    "/images/sublogo_hvac.png",
  framing: "/images/sublogo_framing.png",
  pcg:     "/images/sublogo_pcg.png",
}

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return fmt(n)
}

// ── info button ──────────────────────────────────────────────────────────────

function InfoBtn({ title, description }: { title: string; description: string }) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default" />}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity hover:opacity-100" />
        </TooltipTrigger>
        <TooltipContent className="flex flex-col gap-1 max-w-[220px]">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  const { showFinancialData } = useFinancialStore()
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-xl px-3.5 py-2.5 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className={`font-semibold tabular-nums text-foreground${!showFinancialData ? " blur-sm select-none" : ""}`}>
              {fmt(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── project card ─────────────────────────────────────────────────────────────

function ProjectCardItem({ project, onClick }: { project: ProjectCard; onClick: () => void }) {
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""
  const positive = project.profit >= 0
  const color    = positive ? "#22c55e" : "#ef4444"

  return (
    <div className="flex w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-150 hover:border-border hover:shadow-lg">

      {/* Header — status dot + label + net profit | % + details button */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {positive ? "Profit" : "Loss"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`text-xs font-semibold tabular-nums ${blur}`} style={{ color }}>
            {fmtShort(project.profit)}
          </span>
          <span className="h-3.5 w-px shrink-0 bg-border/50" />
          <span className={`text-xs font-semibold tabular-nums ${blur}`} style={{ color }}>
            {project.profit_pct.toFixed(1)}%
          </span>
          <TooltipProvider delay={300}>
            <Tooltip>
              <TooltipTrigger render={<button onClick={onClick} className="text-muted-foreground/50 transition-colors hover:text-foreground" />}>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top">See details</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col">

        {/* Project name */}
        <div className="flex items-start gap-2 px-4 py-2.5">
          <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <p className="line-clamp-2 text-sm font-semibold leading-tight">{project.name}</p>
        </div>

        {/* Progress bars */}
        <div className="flex flex-col gap-1.5 border-t border-border/40 px-4 py-2">
          {(() => {
            const bars = [
              { value: project.expenses, color: "#ef4444", label: "Expenses" },
              { value: project.invoiced, color: "#22c55e", label: "Invoiced" },
            ]
            const overBars = bars.filter(b => project.estimate > 0 && b.value > project.estimate)
            const hasAlert = overBars.length > 0
            return (
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  {bars.map(({ value, color }, i) => {
                    const pct = project.estimate > 0 ? Math.min((value / project.estimate) * 100, 100) : 0
                    return (
                      <div key={i} className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    )
                  })}
                </div>
                {hasAlert && (
                  <TooltipProvider delay={200}>
                    <Tooltip>
                      <TooltipTrigger render={<span className="flex shrink-0 cursor-default items-center" />}>
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-center">
                        {overBars.map(b => (
                          <p key={b.label}>{b.label} exceeds estimate ({fmtShort(b.value)} vs {fmtShort(project.estimate)})</p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )
          })()}
        </div>

        {/* Financial rows */}
        <div className="flex flex-col gap-1 border-t border-border/40 px-4 py-2.5">
          {[
            { label: "Estimate", value: project.estimate, color: undefined },
            { label: "Invoiced", value: project.invoiced, color: "#22c55e" },
            { label: "Expenses", value: project.expenses, color: "#ef4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{label}</span>
              <span className={`text-[11px] font-semibold tabular-nums ${blur}`} style={color ? { color } : undefined}>
                {fmtShort(value)}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  return (
    <Suspense>
      <AccountingContent />
    </Suspense>
  )
}

function AccountingContent() {
  const searchParams = useSearchParams()
  const company = searchParams.get("company") || "hvac"
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const { data: availableYears } = useQBYears({ company })
  const [year, setYear]         = useState<number | "all">(new Date().getFullYear())
  const [month, setMonth]       = useState<number | "all">("all")
  const [projectSearch, setProjectSearch] = useState("")
  const [projectSortAsc,   setProjectSortAsc]   = useState(true)
  const [projectSortField, setProjectSortField] = useState<"name" | "profit">("name")
  const [projectFilter, setProjectFilter]   = useState<"all" | "profit" | "loss">("all")
  const [detailCustomerID, setDetailCustomerID] = useState<string | null>(null)

  const aria = useAria({ company })

  const carouselRef = useRef<HTMLDivElement>(null)
  const drag        = useRef({ x: 0, scroll: 0, active: false })

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!drag.current.active || !carouselRef.current) return
      carouselRef.current.scrollLeft = drag.current.scroll + (drag.current.x - e.clientX)
    }
    function onUp() { drag.current.active = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [])

  const yearParam = year === "all" ? undefined : year

  const { data: chartData, isLoading: chartLoading } = useQBChart({
    company,
    year: yearParam,
    month: month !== "all" ? month : undefined,
  })

  const { data: projects, isLoading: projectsLoading } = useQBProjects({
    company,
    year: yearParam,
  })

  // Only keep periods that have at least one non-zero value (filters out future months)
  const activeChartData = chartData?.filter(p => p.received > 0 || p.paid > 0) ?? []

  const totalReceived  = activeChartData.reduce((s, p) => s + p.received, 0)
  const totalPaid      = activeChartData.reduce((s, p) => s + p.paid, 0)
  const netFlow        = totalReceived - totalPaid
  const hasChartData   = activeChartData.length > 0

  const totalProjects   = projects?.length ?? 0
  const profitProjects  = projects?.filter(p => p.profit > 0).length ?? 0
  const lossProjects    = projects?.filter(p => p.profit < 0).length ?? 0
  const hasProjectData  = totalProjects > 0

  const filteredProjects = (projects?.filter(p => {
    if (projectFilter === "profit" && p.profit <= 0) return false
    if (projectFilter === "loss"   && p.profit >= 0) return false
    return !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
  }) ?? []).slice().sort((a, b) => {
    const dir = projectSortAsc ? 1 : -1
    if (projectSortField === "name") return dir * a.name.localeCompare(b.name)
    return dir * (a[projectSortField] - b[projectSortField])
  })

  if (chartLoading && projectsLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            {COMPANY_LOGO[company] && (
              <>
                <Image
                  src={COMPANY_LOGO[company]}
                  alt={company}
                  width={64}
                  height={20}
                  className="object-contain h-5 w-auto"
                  style={{ filter: "grayscale(1) brightness(1.1)" }}
                />
                <span className="h-5 w-px bg-border" />
              </>
            )}
            <h1 className="text-xl font-semibold tracking-tight">Accounting</h1>
          </div>
          <p className="text-sm text-muted-foreground">Cash flow and project breakdown</p>
        </div>

        <div className="flex items-end gap-2">
          {/* Period */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Select
                value={String(year)}
                onValueChange={(v) => { setYear(v === "all" ? "all" : Number(v)); setMonth("all") }}
              >
                <SelectTrigger className="h-8 w-[72px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{year === "all" ? "All" : year}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {(availableYears ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              {year !== "all" && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <Select
                    value={String(month)}
                    onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
                  >
                    <SelectTrigger className="h-8 w-[110px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                      <span className="flex-1 truncate text-left text-sm">
                        {month === "all" ? "All" : MONTHS.find(m => m.value === month)?.label ?? "All"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>

          {/* Aria AI */}
          {aria.triggerButton}
        </div>
      </div>

      {/* ── Body: main content + Aria panel side by side ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* Main scroll area */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto no-scrollbar">

      {/* ── Summary metrics ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Received", value: totalReceived, color: hasChartData ? "#22c55e" : undefined, loading: chartLoading, info: "Sum of all customer payments received in the selected period." },
          { label: "Total Paid",     value: totalPaid,     color: hasChartData ? "#ef4444" : undefined, loading: chartLoading, info: "Sum of all vendor bill payments made in the selected period." },
          { label: "Net Cash Flow",  value: netFlow,       color: hasChartData ? (netFlow >= 0 ? "#22c55e" : "#ef4444") : undefined, loading: chartLoading, info: "Difference between total received and total paid. Positive means more money came in than went out." },
        ].map(({ label, value, color, loading, info }) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
              <InfoBtn title={label} description={info} />
            </div>
            {loading
              ? <div className="h-6 w-24 rounded bg-muted animate-pulse mt-0.5" />
              : <span className={`text-lg font-bold ${blur}`} style={color ? { color } : undefined}>
                  {hasChartData ? fmt(value) : "—"}
                </span>}
          </div>
        ))}

        {/* Projects triple metric */}
        <div className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Projects</span>
            <InfoBtn title="Projects" description="Total identified projects, split between those with positive profit margin (profit) and those with negative margin (loss)." />
          </div>
          {projectsLoading
            ? <div className="h-6 w-24 rounded bg-muted animate-pulse mt-0.5" />
            : <div className="flex items-center gap-2 mt-0.5">
                <span className="text-lg font-bold">{hasProjectData ? totalProjects : "—"}</span>
                {hasProjectData && (
                  <>
                    <span className="h-5 w-px bg-border/60 shrink-0" />
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-sm font-semibold text-green-500">
                        <TrendingUp className="h-3.5 w-3.5" />{profitProjects}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-red-500">
                        <TrendingDown className="h-3.5 w-3.5" />{lossProjects}
                      </span>
                    </div>
                  </>
                )}
              </div>
          }
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="rounded-xl border border-border bg-card/60 p-5 flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between">
          <span className="text-sm font-medium">
            Cash Flow {month !== "all" ? "Daily" : "Monthly"}{yearParam ? ` · ${yearParam}` : " · All Time"}
          </span>
          <div className="flex items-center gap-3">
            {hasChartData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Received
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Paid
                </div>
              </div>
            )}
            <InfoBtn title="Cash Flow" description="Customer payments received vs. vendor bill payments made, grouped by month (year view) or by day (month view). Only periods with transactions are shown." />
          </div>
        </div>
        {chartLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          </div>
        ) : !hasChartData ? (
          <Empty className="min-h-0 flex-1 border">
            <EmptyMedia><BarChart2 className="h-8 w-8 text-muted-foreground/50" /></EmptyMedia>
            <EmptyTitle>No cash flow data for this period.</EmptyTitle>
          </Empty>
        ) : (
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  ticks={
                    !yearParam
                      // All-time: one tick per year (January of each year present in data)
                      ? activeChartData.filter(p => p.period.endsWith("-01")).map(p => p.period)
                      : undefined
                  }
                  tickFormatter={(v) => {
                    if (!yearParam)          return v.slice(0, 4)   // all-time  → "2024"
                    if (month !== "all")     return v.slice(8)       // daily     → "15"
                    const m = parseInt(v.slice(5), 10)
                    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] ?? v
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={showFinancialData ? fmtShort : () => ""} width={showFinancialData ? 64 : 24} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="received" name="Received"
                  stroke="#22c55e" strokeWidth={2} fill="url(#gradReceived)"
                  dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="paid" name="Paid"
                  stroke="#ef4444" strokeWidth={2} fill="url(#gradPaid)"
                  dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Project carousel ── */}
      <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/60">

        {/* Controls bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <GalleryHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Project Cards</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                placeholder="Search…"
                className="h-7 w-40 rounded-md border border-input bg-transparent pl-7 pr-6 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30"
              />
              {projectSearch && (
                <button
                  onClick={() => setProjectSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Profit / Loss filter */}
            <div className="flex h-7 items-center rounded-md border border-input bg-transparent text-[11px] dark:bg-input/30 overflow-hidden">
              {([
                { key: "all",    node: <span className="text-[11px] font-medium">All</span> },
                { key: "profit", node: <TrendingUp  className="h-3.5 w-3.5" /> },
                { key: "loss",   node: <TrendingDown className="h-3.5 w-3.5" /> },
              ] as const).map(({ key, node }) => (
                <button
                  key={key}
                  onClick={() => setProjectFilter(key)}
                  className={cn(
                    "flex h-full items-center px-2.5 transition-colors",
                    projectFilter === key
                      ? key === "profit" ? "bg-green-500/20 text-green-400"
                        : key === "loss" ? "bg-red-500/20 text-red-400"
                        : "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {node}
                </button>
              ))}
            </div>

            <div className="flex h-7 items-center rounded-md border border-input bg-transparent dark:bg-input/30 overflow-hidden">
              {(["name", "profit"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setProjectSortField(f)}
                  className={cn(
                    "flex h-full items-center px-2.5 text-[11px] font-medium capitalize transition-colors",
                    projectSortField === f ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f}
                </button>
              ))}
              <button
                onClick={() => setProjectSortAsc(v => !v)}
                className="flex h-full items-center border-l border-input px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {projectSortField === "profit"
                  ? projectSortAsc ? <ArrowDown01 className="h-3.5 w-3.5" /> : <ArrowUp01 className="h-3.5 w-3.5" />
                  : projectSortAsc ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpZA  className="h-3.5 w-3.5" />}
              </button>
            </div>
            <InfoBtn title="Projects" description="Project breakdown grouped by customer name from QB estimates. Shows estimate, invoiced amount, expenses and profit margin for the selected year." />
          </div>
        </div>

        {/* Cards */}
        {projectsLoading ? (
          <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            Loading projects…
          </div>
        ) : !hasProjectData ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <Empty className="border-0">
              <EmptyMedia><FolderOpen className="h-8 w-8 text-muted-foreground/50" /></EmptyMedia>
              <EmptyTitle>No projects found for this period.</EmptyTitle>
            </Empty>
          </div>
        ) : (
          <div
            ref={carouselRef}
            className="flex cursor-grab items-start gap-3 overflow-x-auto overflow-y-hidden p-3 select-none active:cursor-grabbing [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            onMouseDown={e => { drag.current = { x: e.clientX, scroll: carouselRef.current?.scrollLeft ?? 0, active: true } }}
          >
            {filteredProjects.map(p => (
              <ProjectCardItem
                key={p.customer_id || p.name}
                project={p}
                onClick={() => setDetailCustomerID(p.customer_id)}
              />
            ))}
          </div>
        )}

      </div>

      </div>{/* end main scroll area */}

      {/* Aria panel — slides in, compresses main content */}
      {aria.panel}

      </div>{/* end body flex row */}

      {/* ── Project Detail Modal ── */}
      {detailCustomerID && (
        <ProjectDetailModal
          company={company}
          customerID={detailCustomerID}
          onClose={() => setDetailCustomerID(null)}
        />
      )}

    </div>
  )
}
