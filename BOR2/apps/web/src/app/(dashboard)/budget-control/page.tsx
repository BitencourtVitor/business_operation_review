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
  Search, X, HandCoins, Loader2, Building2, Home, Settings,
  ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01, HardHat, Wallet,
  AlertTriangle, OctagonAlert, CheckCircle2, MapPin, ChevronLeft, ChevronRight,
  CalendarClock,
} from "lucide-react"
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
  const profit = p.invoiced - p.cost_total
  const marginPct = p.invoiced > 0 ? Math.round((profit / p.invoiced) * 100) : 0
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
                    <TooltipContent>Potentially closed, nothing left to pay or receive</TooltipContent>
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
          <MetricRow label="Invoiced"  value={p.invoiced}          blur={blur} />
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
  const [types,     setTypes]     = useState({ building: true, house: true })

  const { data: projects, isLoading: projLoading } = useBudgetProjects({ company })
  const { data: laborSummary } = useLaborSummary(company)

  const rows = useMemo(() => (projects ?? [])
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => {
      if (p.project_type === "building" && !types.building) return false
      if (p.project_type === "house"    && !types.house)    return false
      return true
    })
    .filter(p => {
      const loss      = (p.invoiced - p.cost_total) < 0
      const hasGreen  = p.potentially_closed
      const hasRed    = p.over_ceiling && loss
      const hasYellow = p.over_ceiling && !loss
      if (hasGreen  && !alerts.green)  return false
      if (hasRed    && !alerts.red)    return false
      if (hasYellow && !alerts.yellow) return false
      return true
    })
    .slice()
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortField === "name") return dir * a.name.localeCompare(b.name)
      return dir * ((a[sortField] as number) - (b[sortField] as number))
    }),
  [projects, search, sortField, sortAsc, alerts, types])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows  = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page])

  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset to page 1 whenever the filtered/sorted set changes.
  useEffect(() => { setPage(1) }, [search, sortField, sortAsc, company, alerts, types])
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
            Receivables, cost by category and subcontractor (PO) commitment — per project
          </p>
        </div>

        {canManage && (
          <Link href="/budget-control/manage"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
            <Settings className="h-3.5 w-3.5" /> Manage
          </Link>
        )}
      </div>

      {/* ── Job-site receivable / payable chart ──────────────────────────── */}
      <div className="h-[220px] shrink-0">
        <JobSiteChart projects={projects ?? []} />
      </div>

      {/* ── Projects container ────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">

        {/* Container header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="text-sm font-semibold">Projects</span>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
          <div className="ml-auto flex items-center gap-2">
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
                { key: "house",    Icon: Home,      label: "Houses" },
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
          </div>
        </div>

        {/* Content */}
        {projLoading ? (
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
                {pageRows.map((p, i) => (
                  <ProjectCard
                    key={p.project_id ?? i}
                    p={p}
                    blur={blur}
                    onOpen={() => setDetailID(p.project_id)}
                    inProgressCost={laborSummary?.[p.project_id] ?? 0}
                  />
                ))}
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
