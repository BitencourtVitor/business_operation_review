"use client"

import { Suspense, useState, useMemo, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Search, X, HandCoins, Loader2, Building2, Home, LandPlot, Settings,
  ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01, HardHat, Wallet,
  AlertTriangle, OctagonAlert, CheckCircle2, MapPin, ChevronLeft, ChevronRight, ChevronDown,
  CalendarClock, Users, Check, Layers,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetProjects, useLaborSummary } from "@/hooks/use-budget"
import type { BudgetProjectDetail } from "@/services/budget.service"
import { ProjectBudgetModal } from "./components/ProjectBudgetModal"
import { JobSiteChart } from "./components/JobSiteChart"

// ── Constants ────────────────────────────────────────────────────────────────

const COMPANY_LOGO: Record<string, string> = {
  hvac:    "/images/sublogo_hvac.png",
  framing: "/images/sublogo_framing.png",
  pcg:     "/images/sublogo_pcg.png",
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const pct = (part: number, whole: number) => (whole > 0 ? Math.min((part / whole) * 100, 100) : 0)

// ── Persisted collapse state ─────────────────────────────────────────────────

function usePersistedCollapse(key: string): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(key) === "1"
  })
  const set = (v: boolean | ((prev: boolean) => boolean)) => {
    setCollapsed(prev => {
      const next = typeof v === "function" ? v(prev) : v
      if (typeof window !== "undefined") localStorage.setItem(key, next ? "1" : "0")
      return next
    })
  }
  return [collapsed, set]
}

// ── Group-by-jobsite aggregation ─────────────────────────────────────────────
// Rolls up every project sharing a customer_group (jobsite) into one summed
// card. Not expandable — turn "group by jobsite" off to see individual lots.

const SUM_FIELDS = [
  "projected_receive", "invoiced", "income_actual", "received", "to_receive",
  "cost_total", "cost_ceiling", "paid", "open_payable", "to_pay",
  "labor_committed", "labor_budget", "labor_billed", "labor_open", "labor_paid",
] as const satisfies readonly (keyof BudgetProjectDetail)[]

function groupProjectsByJobsite(list: BudgetProjectDetail[]): (BudgetProjectDetail & { __count: number })[] {
  const groups = new Map<string, BudgetProjectDetail & { __count: number }>()
  for (const p of list) {
    const key = p.customer_group || p.name
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...p, project_id: `group:${key}`, name: key, __count: 1 })
      continue
    }
    for (const f of SUM_FIELDS) (existing[f] as number) += p[f] as number
    existing.over_ceiling = existing.over_ceiling || p.over_ceiling
    existing.in_progress = existing.in_progress || p.in_progress
    existing.potentially_closed = existing.potentially_closed && p.potentially_closed
    existing.__count += 1
  }
  return [...groups.values()]
}

// ── Project Card ──────────────────────────────────────────────────────────────

function MetricRow({ label, value, color, blur, strong }: {
  label: string; value: number; color?: string; blur: string; strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn("tabular-nums", strong ? "text-[13px] font-bold" : "text-[12px] font-semibold", blur)}
        style={color ? { color } : undefined}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ p, blur, onOpen, inProgressCost = 0 }: {
  p: BudgetProjectDetail; blur: string; onOpen: () => void; inProgressCost?: number
}) {
  const hasLabor = p.labor_committed > 0
  const hasInProgress = inProgressCost > 0
  const profit = p.income_actual - p.cost_total
  const marginPct = p.income_actual > 0 ? Math.round((profit / p.income_actual) * 100) : 0
  const positiveMargin = profit >= 0

  return (
    <button onClick={onOpen}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-all duration-200 hover:border-foreground/25 hover:shadow-xl hover:shadow-black/40 md:flex-row md:items-stretch">

      {/* Identity */}
      <div className="flex min-w-0 items-center gap-3 border-b border-border/50 px-4 py-3 md:w-[26%] md:border-b-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm font-semibold leading-tight" title={p.name}>{p.name}</p>
          {p.client_name && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{p.client_name}</span>
            </div>
          )}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Margin</span>
            <span className={cn("text-[13px] font-bold tabular-nums", positiveMargin ? "text-primary" : "text-destructive", blur)}>
              {fmt(profit)}
            </span>
            <span className={cn("text-[12px] font-semibold tabular-nums", positiveMargin ? "text-primary/70" : "text-destructive/70", blur)}>
              {marginPct}%
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
            {p.project_type === "building"
              ? <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
              : p.project_type === "lot"
              ? <LandPlot  className="h-3.5 w-3.5 text-muted-foreground/70" />
              : <Home      className="h-3.5 w-3.5 text-muted-foreground/70" />}
          </div>
          {(p.potentially_closed || p.over_ceiling || hasInProgress) && (
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background px-1.5 py-1.5">
              {hasInProgress && (
                <TooltipProvider delay={0}>
                  <Tooltip>
                    <TooltipTrigger render={<span className="flex" />}>
                      <CalendarClock className="h-4 w-4 text-blue-500" />
                    </TooltipTrigger>
                    <TooltipContent>In-progress costs accruing this pay period: {fmt(inProgressCost)}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {p.potentially_closed && (
                <TooltipProvider delay={0}>
                  <Tooltip>
                    <TooltipTrigger render={<span className="flex" />}>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </TooltipTrigger>
                    <TooltipContent>Potentially closed — subcontractor POs settled and no income pending (bills may still be open)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {p.over_ceiling && (
                <TooltipProvider delay={0}>
                  <Tooltip>
                    <TooltipTrigger render={<span className="flex" />}>
                      {marginPct < 0
                        ? <OctagonAlert className="h-4 w-4 text-red-500" />
                        : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                    </TooltipTrigger>
                    <TooltipContent>
                      {marginPct < 0
                        ? "Loss, margin below 0%"
                        : "Margin below the 30% target"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Income + Cost containers */}
      <div className="flex flex-1 flex-col gap-2 p-2 md:flex-row md:items-stretch">

      {/* Income container */}
      <div className="flex flex-1 flex-col justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Income</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {pct(p.income_actual, p.projected_receive).toFixed(0)}% invoiced
          </span>
        </div>
        {/* 3-segment bar: received | outstanding | remaining */}
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct(p.received, p.projected_receive)}%` }} />
          <div className="h-full bg-orange-400/70 transition-all" style={{ width: `${pct(p.to_receive, p.projected_receive)}%` }} />
        </div>
        <div className="flex flex-col gap-1">
          <MetricRow label="Estimated" value={p.projected_receive} blur={blur} strong />
          <MetricRow label="Total"     value={p.income_actual}     blur={blur} />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Received</span>
              <span className={cn("text-[11px] font-semibold tabular-nums text-emerald-500", blur)}>{fmt(p.received)}</span>
            </div>
            <span className="text-[10px] text-muted-foreground/40">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Outstanding</span>
              <span className={cn("text-[11px] font-semibold tabular-nums", p.to_receive > 0 ? "text-orange-400" : "text-muted-foreground/50", blur)}>{fmt(p.to_receive)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cost container — double width, holds Cost + Contractors */}
      <div className="flex flex-[2] flex-col overflow-hidden rounded-lg border border-red-500/30 md:flex-row md:items-stretch">
        {/* Cost */}
        <div className="flex flex-1 flex-col justify-center gap-2 border-b border-border/40 bg-red-500/[0.05] px-4 py-3 md:border-b-0">
          <div className="flex items-center gap-1.5">
            <HandCoins className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Cost</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {pct(p.cost_total, p.cost_ceiling).toFixed(0)}% of budget
            </span>
          </div>
          {/* 3-segment bar: paid | outstanding bills | remaining vs budget */}
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div className="h-full transition-all" style={{ width: `${pct(p.paid, p.cost_ceiling)}%`, backgroundColor: "#ef4444" }} />
            <div className="h-full bg-orange-400/70 transition-all" style={{ width: `${pct(p.open_payable, p.cost_ceiling)}%` }} />
          </div>
          <div className="flex flex-col gap-1">
            <MetricRow label="Cost Budget" value={p.cost_ceiling} blur={blur} strong />
            <MetricRow label="Total"       value={p.cost_total} color={p.over_ceiling ? "#ef4444" : undefined} blur={blur} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Paid</span>
                <span className={cn("text-[11px] font-semibold tabular-nums text-red-400", blur)}>{fmt(p.paid)}</span>
              </div>
              <span className="text-[10px] text-muted-foreground/40">|</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Outstanding</span>
                <span className={cn("text-[11px] font-semibold tabular-nums", p.open_payable > 0 ? "text-orange-400" : "text-muted-foreground/50", blur)}>{fmt(p.open_payable)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Contractors — nested breakdown of the Cost block */}
        <div className="flex flex-1 flex-col justify-center gap-2 border-t border-border/40 bg-yellow-500/[0.03] px-4 py-3 md:border-l md:border-t-0 md:border-yellow-500/20">
          <div className="flex items-center gap-1.5">
            <HardHat className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-500">Contractors</span>
            {hasLabor && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {pct(p.labor_billed, p.labor_committed).toFixed(0)}% billed
              </span>
            )}
          </div>
          {hasLabor ? (() => {
            const laborOutstanding = Math.max(p.labor_billed - p.labor_paid, 0)
            return (
              <>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                  <div className="h-full transition-all" style={{ width: `${pct(p.labor_paid, p.labor_committed)}%`, backgroundColor: "#eab308" }} />
                  <div className="h-full bg-orange-400/70 transition-all" style={{ width: `${pct(laborOutstanding, p.labor_committed)}%` }} />
                </div>
                <div className="flex flex-col gap-1">
                  <MetricRow label="Contracted" value={p.labor_committed} blur={blur} strong />
                  <MetricRow label="Total"       value={p.labor_billed}   blur={blur} />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">Paid</span>
                      <span className={cn("text-[11px] font-semibold tabular-nums text-yellow-500", blur)}>{fmt(p.labor_paid)}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40">|</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">Outstanding</span>
                      <span className={cn("text-[11px] font-semibold tabular-nums", laborOutstanding > 0 ? "text-orange-400" : "text-muted-foreground/50", blur)}>{fmt(laborOutstanding)}</span>
                    </div>
                  </div>
                </div>
              </>
            )
          })() : (
            <p className="py-1 text-[11px] italic text-muted-foreground/50">No purchase orders.</p>
          )}
        </div>
      </div>
      </div>
    </button>
  )
}

// ── Client multi-select ────────────────────────────────────────────────────────

function ClientFilter({ clients, selected, setSelected }: {
  clients: string[]; selected: Set<string>; setSelected: (s: Set<string>) => void
}) {
  const [q, setQ] = useState("")
  const filtered = q ? clients.filter(c => c.toLowerCase().includes(q.toLowerCase())) : clients
  const toggle = (c: string) => {
    const next = new Set(selected)
    next.has(c) ? next.delete(c) : next.add(c)
    setSelected(next)
  }
  return (
    <Popover>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <Users className="h-3.5 w-3.5" />
        {selected.size === 0 ? "All clients" : `${selected.size} client${selected.size > 1 ? "s" : ""}`}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter clients…"
            className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        </div>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent">
            Clear selection
          </button>
        )}
        <div className="flex max-h-64 flex-col overflow-y-auto no-scrollbar">
          {filtered.map(c => {
            const on = selected.has(c)
            return (
              <button key={c} onClick={() => toggle(c)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate" title={c}>{c}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground/50">No clients.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Customer multi-select ───────────────────────────────────────────────────────

function CustomerFilter({ customers, selected, setSelected }: {
  customers: string[]; selected: Set<string>; setSelected: (s: Set<string>) => void
}) {
  const [q, setQ] = useState("")
  const filtered = q ? customers.filter(c => c.toLowerCase().includes(q.toLowerCase())) : customers
  const toggle = (c: string) => {
    const next = new Set(selected)
    next.has(c) ? next.delete(c) : next.add(c)
    setSelected(next)
  }
  return (
    <Popover>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <Layers className="h-3.5 w-3.5" />
        {selected.size === 0 ? "All customers" : `${selected.size} customer${selected.size > 1 ? "s" : ""}`}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter customers…"
            className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        </div>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent">
            Clear selection
          </button>
        )}
        <div className="flex max-h-64 flex-col overflow-y-auto no-scrollbar">
          {filtered.map(c => {
            const on = selected.has(c)
            return (
              <button key={c} onClick={() => toggle(c)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate" title={c}>{c}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground/50">No customers.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Project multi-select ──────────────────────────────────────────────────────
// Unlike Client/Customer (which group by client name / jobsite), this lists
// every individual project/lot leaf, keyed by project_id (names can repeat).

type ProjectOption = { id: string; label: string }

function ProjectFilter({ options, selected, setSelected }: {
  options: ProjectOption[]; selected: Set<string>; setSelected: (s: Set<string>) => void
}) {
  const [q, setQ] = useState("")
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  return (
    <Popover>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <Building2 className="h-3.5 w-3.5" />
        {selected.size === 0 ? "All projects" : `${selected.size} project${selected.size > 1 ? "s" : ""}`}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter projects…"
            className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring dark:bg-input/30" />
        </div>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent">
            Clear selection
          </button>
        )}
        <div className="flex max-h-64 flex-col overflow-y-auto no-scrollbar">
          {filtered.map(o => {
            const on = selected.has(o.id)
            return (
              <button key={o.id} onClick={() => toggle(o.id)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate" title={o.label}>{o.label}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground/50">No projects.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Period (range) filter ────────────────────────────────────────────────────
// A range is two "YYYY-MM" endpoints (inclusive). Clicking a month sets the
// start anchor; the next click sets the end anchor and everything between is
// implicitly included (e.g. Jan + Mar → Feb is part of the range too). A
// third click starts a new range. Nothing refetches until "Apply" is clicked
// — toggling months only updates a local draft.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function monthKey(year: number, month: number) { return `${year}-${String(month).padStart(2, "0")}` }

// Returns the year string when [start, end] spans exactly Jan–Dec of one year, else null.
function fullYearBounds(start: string | null, end: string | null): string | null {
  if (!start || !end) return null
  return start.endsWith("-01") && end.endsWith("-12") && start.slice(0, 4) === end.slice(0, 4)
    ? start.slice(0, 4)
    : null
}

function periodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "All time"
  const fy = fullYearBounds(start, end)
  if (fy) return fy
  return start === end ? formatMonthKey(start) : `${formatMonthKey(start)}—${formatMonthKey(end)}`
}

// Months after the current one have no data yet — not selectable.
function isFutureMonth(key: string): boolean {
  const now = new Date()
  return key > monthKey(now.getFullYear(), now.getMonth() + 1)
}

function PeriodFilter({ start, end, onApply }: {
  start: string | null; end: string | null
  onApply: (start: string | null, end: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [navYear, setNavYear] = useState(() => Number((start ?? String(new Date().getFullYear())).slice(0, 4)))
  const [draftStart, setDraftStart] = useState(start)
  const [draftEnd, setDraftEnd] = useState(end)

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      setDraftStart(start)
      setDraftEnd(end)
      setNavYear(Number((start ?? String(new Date().getFullYear())).slice(0, 4)))
    }
  }

  const draftMin = draftStart && draftEnd ? (draftStart < draftEnd ? draftStart : draftEnd) : draftStart
  const draftMax = draftStart && draftEnd ? (draftStart < draftEnd ? draftEnd : draftStart) : draftStart

  const clickMonth = (k: string) => {
    if (draftStart && draftEnd) { setDraftStart(k); setDraftEnd(null) }
    else if (draftStart) { setDraftEnd(k) }
    else { setDraftStart(k) }
  }

  const yearKeys = Array.from({ length: 12 }, (_, i) => monthKey(navYear, i + 1))
  // "Full year" always selects every AVAILABLE month of navYear — Jan through
  // the current month when navYear is still in progress, not the disabled rest.
  const availableYearKeys = yearKeys.filter(k => !isFutureMonth(k))
  const fullYearStart = availableYearKeys[0]
  const fullYearEnd = availableYearKeys[availableYearKeys.length - 1]
  const draftIsFullYear = availableYearKeys.length > 0 && draftMin === fullYearStart && draftMax === fullYearEnd
  const toggleFullYear = () => {
    if (availableYearKeys.length === 0) return
    if (draftIsFullYear) { setDraftStart(null); setDraftEnd(null) }
    else { setDraftStart(fullYearStart); setDraftEnd(fullYearEnd) }
  }

  const apply = () => { onApply(draftMin, draftMax); setOpen(false) }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
        <CalendarClock className="h-3.5 w-3.5" /> {periodLabel(start, end)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => setNavYear(y => y - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{navYear}</span>
          <button onClick={() => setNavYear(y => y + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <button onClick={toggleFullYear} disabled={availableYearKeys.length === 0}
          className={cn("mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors",
            availableYearKeys.length === 0 ? "cursor-not-allowed opacity-40" : draftIsFullYear ? "bg-primary/15 text-primary" : "hover:bg-accent")}>
          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", draftIsFullYear ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
            {draftIsFullYear && <Check className="h-3 w-3" />}
          </span>
          Full year {navYear}
        </button>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => {
            const k = monthKey(navYear, i + 1)
            const future = isFutureMonth(k)
            // Highlight the whole implied range, not just the two clicked anchors.
            const on = draftMin != null && k >= draftMin && k <= (draftMax ?? draftMin)
            return (
              <button key={m} onClick={() => clickMonth(k)} disabled={future}
                className={cn("rounded px-1 py-1 text-[11px] transition-colors",
                  future ? "cursor-not-allowed text-muted-foreground/30" : on ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                {m}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5">
          <button onClick={() => { setDraftStart(null); setDraftEnd(null) }}
            className="rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent">
            Clear
          </button>
          <button onClick={apply}
            className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatMonthKey(k: string) {
  const [y, m] = k.split("-")
  return `${m}/${y}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BudgetControlPage() {
  return <Suspense><BudgetContent /></Suspense>
}

type SortField = "name" | "projected_receive" | "labor_committed" | "cost_total"

const PAGE_SIZE = 20

function BudgetContent() {
  const searchParams = useSearchParams()
  const company = searchParams.get("company") || "framing"
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const { user }       = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage = (!!user && ["dev", "owner", "admin"].includes(user.role))
    || myPerms?.permissions?.budget_control === "write"

  const [search,    setSearch]    = useState("")
  const [sortField, setSortField] = useState<SortField>("projected_receive")
  const [sortAsc,   setSortAsc]   = useState(false)
  const [detailID,  setDetailID]  = useState<string | null>(null)
  const [page,      setPage]      = useState(1)
  const [alerts,    setAlerts]    = useState({ green: true, yellow: true, red: true })
  const [types,     setTypes]     = useState({ building: true, lot: true, private: true })
  const [groupByJobsite, setGroupByJobsite] = useState(true)
  const [chartCollapsed, setChartCollapsed] = usePersistedCollapse("budget-control:chart-collapsed")
  const [projectsCollapsed, setProjectsCollapsed] = usePersistedCollapse("budget-control:projects-collapsed")
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  // Applied (not draft) period — only changes when the user clicks "Apply" in
  // PeriodFilter, so toggling checkboxes doesn't refetch on every click.
  const [periodStart, setPeriodStart] = useState<string | null>(() => monthKey(new Date().getFullYear(), 1))
  const [periodEnd,   setPeriodEnd]   = useState<string | null>(() => monthKey(new Date().getFullYear(), 12))

  const { data: projects, isLoading: projLoading } = useBudgetProjects({
    company,
    periodStart: periodStart ?? undefined,
    periodEnd: periodEnd ?? undefined,
  })
  const { data: laborSummary } = useLaborSummary(company)

  const clientNames = useMemo(
    () => [...new Set((projects ?? []).map(p => p.client_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [projects])

  // Client multi-select narrows BOTH the chart and the project list.
  const clientFiltered = useMemo(
    () => (projects ?? []).filter(p => selectedClients.size === 0 || selectedClients.has(p.client_name)),
    [projects, selectedClients])

  // Customer multi-select narrows BOTH the chart (which also "explodes" into
  // per-project bars once a customer is picked) and the project list below.
  const customerNames = useMemo(
    () => [...new Set(clientFiltered.map(p => p.customer_group || p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [clientFiltered])

  // A selected customer may not exist under a newly picked client — drop it.
  useEffect(() => {
    setSelectedCustomers(prev => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter(c => customerNames.includes(c)))
      return next.size === prev.size ? prev : next
    })
  }, [customerNames])

  const customerFiltered = useMemo(
    () => clientFiltered.filter(p => selectedCustomers.size === 0 || selectedCustomers.has(p.customer_group || p.name)),
    [clientFiltered, selectedCustomers])

  // Project multi-select narrows BOTH the chart and the project list further,
  // down to individual leaf projects (keyed by project_id — names can repeat).
  const projectOptions = useMemo(
    () => customerFiltered
      .map(p => ({ id: p.project_id, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [customerFiltered])

  useEffect(() => {
    setSelectedProjects(prev => {
      if (prev.size === 0) return prev
      const validIds = new Set(projectOptions.map(o => o.id))
      const next = new Set([...prev].filter(id => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [projectOptions])

  const projectFiltered = useMemo(
    () => customerFiltered.filter(p => selectedProjects.size === 0 || selectedProjects.has(p.project_id)),
    [customerFiltered, selectedProjects])

  const rows = useMemo(() => {
    const filtered = projectFiltered
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .filter(p => {
        if (p.project_type === "building" && !types.building) return false
        if (p.project_type === "lot"      && !types.lot)      return false
        if (p.project_type === "private"  && !types.private)  return false
        return true
      })
      .filter(p => {
        const loss      = (p.income_actual - p.cost_total) < 0
        const hasGreen  = p.potentially_closed
        const hasRed    = p.over_ceiling && loss
        const hasYellow = p.over_ceiling && !loss
        if (hasGreen  && !alerts.green)  return false
        if (hasRed    && !alerts.red)    return false
        if (hasYellow && !alerts.yellow) return false
        return true
      })
    const base: (BudgetProjectDetail & { __count?: number })[] =
      groupByJobsite ? groupProjectsByJobsite(filtered) : filtered
    return base.slice().sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortField === "name") return dir * a.name.localeCompare(b.name)
      return dir * ((a[sortField] as number) - (b[sortField] as number))
    })
  }, [projectFiltered, search, sortField, sortAsc, alerts, types, groupByJobsite])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows  = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page])

  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset to page 1 whenever the filtered/sorted set changes.
  useEffect(() => { setPage(1) }, [search, sortField, sortAsc, company, alerts, types, groupByJobsite, selectedClients, selectedProjects, periodStart, periodEnd])
  // Keep page in range if the row count shrinks.
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  // Scroll the list back to top on page change.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [page])

  if (projLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-0.5 flex items-center gap-2.5">
            {COMPANY_LOGO[company] && (
              <>
                <Image src={COMPANY_LOGO[company]} alt={company} width={64} height={20}
                  className="h-5 w-auto object-contain" style={{ filter: "grayscale(1) brightness(1.1)" }} />
                <span className="h-5 w-px bg-border" />
              </>
            )}
            <h1 className="text-xl font-semibold tracking-tight">Budget Control</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Cost and income tracking, per project
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PeriodFilter start={periodStart} end={periodEnd} onApply={(s, e) => { setPeriodStart(s); setPeriodEnd(e) }} />
          <ClientFilter clients={clientNames} selected={selectedClients} setSelected={setSelectedClients} />
          <CustomerFilter customers={customerNames} selected={selectedCustomers} setSelected={setSelectedCustomers} />
          <ProjectFilter options={projectOptions} selected={selectedProjects} setSelected={setSelectedProjects} />
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => setGroupByJobsite(v => !v)}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors dark:bg-input/30",
                      groupByJobsite ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  />
                }
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", groupByJobsite ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {groupByJobsite && <Check className="h-3 w-3" />}
                </span>
                Group by jobsite
              </TooltipTrigger>
              <TooltipContent>
                {groupByJobsite ? "Grouped — cards roll up all lots per jobsite" : "Exploded — one card per lot/project"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {canManage && (
            <Link href="/budget-control/manage"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
              <Settings className="h-3.5 w-3.5" /> Manage
            </Link>
          )}
        </div>
      </div>

      {/* ── Receivable / payable by customer chart ───────────────────────── */}
      <div className={cn("shrink-0", chartCollapsed ? "h-11" : "h-[300px]")}>
        <JobSiteChart
          projects={projectFiltered}
          selectedCustomers={selectedCustomers}
          forceExploded={!groupByJobsite}
          onSelectCustomer={name => setSelectedCustomers(new Set([name]))}
          onOpenProject={name => {
            const match = projectFiltered.find(p => p.name === name)
            if (match) setDetailID(match.project_id)
          }}
          collapsed={chartCollapsed}
          onToggleCollapsed={() => setChartCollapsed(v => !v)}
        />
      </div>

      {/* ── Projects container ────────────────────────────────────────────── */}
      <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40", projectsCollapsed ? "shrink-0" : "flex-1")}>

        {/* Container header */}
        <div className={cn("flex shrink-0 items-center gap-3 px-4 py-3", !projectsCollapsed && "border-b border-border/50")}>
          <button onClick={() => setProjectsCollapsed(v => !v)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {projectsCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <span className="text-sm font-semibold">Projects</span>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
          {!projectsCollapsed && <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search project…"
                className="h-7 w-44 rounded-md border border-input bg-transparent pl-7 pr-6 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Alert filters */}
            <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
              {([
                { key: "building", Icon: Building2, label: "Buildings" },
                { key: "lot",      Icon: LandPlot,   label: "Lots" },
                { key: "private",  Icon: Home,       label: "Private" },
              ] as const).map(({ key, Icon, label }) => (
                <TooltipProvider key={key} delay={0}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          onClick={() => setTypes(t => ({ ...t, [key]: !t[key] }))}
                          className={cn(
                            "flex h-full items-center px-2 transition-colors",
                            types[key] ? "text-foreground" : "text-muted-foreground/25 hover:text-muted-foreground/60",
                          )}
                        />
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>{types[key] ? `Showing: ${label}` : `Hidden: ${label}`}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
              <span className="mx-0.5 h-4 w-px bg-border" />
              {([
                { key: "green",  Icon: CheckCircle2,  on: "text-emerald-500", label: "Potentially closed" },
                { key: "yellow", Icon: AlertTriangle, on: "text-yellow-500",  label: "Margin below target" },
                { key: "red",    Icon: OctagonAlert,  on: "text-red-500",     label: "Loss" },
              ] as const).map(({ key, Icon, on, label }) => (
                <TooltipProvider key={key} delay={0}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          onClick={() => setAlerts(a => ({ ...a, [key]: !a[key] }))}
                          className={cn(
                            "flex h-full items-center px-2 transition-colors",
                            alerts[key] ? on : "text-muted-foreground/25 hover:text-muted-foreground/60",
                          )}
                        />
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>{alerts[key] ? `Showing: ${label}` : `Hidden: ${label}`}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            {/* Sort */}
            <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
              <span className="flex h-full items-center border-r border-input bg-muted/40 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Order by
              </span>
              {([
                { f: "projected_receive", label: "Estimate" },
                { f: "cost_total",        label: "Cost" },
                { f: "labor_committed",   label: "Labor" },
                { f: "name",              label: "Name" },
              ] as const).map(({ f, label }) => (
                <button key={f} onClick={() => setSortField(f)}
                  className={cn("flex h-full items-center px-2.5 text-[11px] font-medium transition-colors",
                    sortField === f ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
              <button onClick={() => setSortAsc(v => !v)}
                className="flex h-full items-center border-l border-input px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {sortField === "name"
                  ? (sortAsc ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpZA className="h-3.5 w-3.5" />)
                  : (sortAsc ? <ArrowDown01 className="h-3.5 w-3.5" /> : <ArrowUp01 className="h-3.5 w-3.5" />)}
              </button>
            </div>
          </div>}
        </div>

        {/* Content */}
        {projectsCollapsed ? null : projLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty className="border-0">
              <EmptyMedia><HandCoins className="h-8 w-8 text-muted-foreground/50" /></EmptyMedia>
              <EmptyTitle>No projects found.</EmptyTitle>
            </Empty>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-4">
              <div className="flex flex-col gap-3">
                {pageRows.map((p, i) => {
                  const isGroup = p.project_id.startsWith("group:")
                  return (
                    <ProjectCard
                      key={p.project_id ?? i}
                      p={p}
                      blur={blur}
                      onOpen={isGroup ? () => {} : () => setDetailID(p.project_id)}
                      inProgressCost={laborSummary?.[p.project_id] ?? 0}
                    />
                  )
                })}
              </div>
            </div>
            {pageCount > 1 && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 px-4 py-2.5">
                <span className="text-[11px] text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 dark:bg-input/30">
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="px-2 text-[11px] tabular-nums text-muted-foreground">
                    {page} / {pageCount}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                    className="flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 dark:bg-input/30">
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {detailID && (
        <ProjectBudgetModal company={company} projectID={detailID} onClose={() => setDetailID(null)} />
      )}
    </div>
  )
}
