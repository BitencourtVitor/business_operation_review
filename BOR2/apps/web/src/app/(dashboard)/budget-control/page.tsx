"use client"

import { Suspense, useState, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Search, X, Info, HandCoins, Loader2, Building2, Home, Settings,
  ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01, HardHat, Wallet,
  AlertTriangle, CheckCircle2, MapPin,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetProjects, useBudgetSummary } from "@/hooks/use-budget"
import { useClients, useJobSites } from "@/hooks/use-clients"
import type { BudgetProject, BudgetStatus } from "@/services/budget.service"
import type { ClientItem, JobSiteItem } from "@/services/clients.service"
import { ProjectBudgetModal } from "./components/ProjectBudgetModal"
import { Segmented } from "./components/Segmented"

// ── Constants ────────────────────────────────────────────────────────────────

const COMPANY_LOGO: Record<string, string> = {
  hvac:    "/images/sublogo_hvac.png",
  framing: "/images/sublogo_framing.png",
  pcg:     "/images/sublogo_pcg.png",
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return fmt(n)
}
const pct = (part: number, whole: number) => (whole > 0 ? Math.min((part / whole) * 100, 100) : 0)

// ── Job-site matching (token-based) ──────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

type SiteMatch = { clientName: string; siteName: string } | null

function bestJobSiteMatch(
  projectName: string,
  jobSites: JobSiteItem[],
  clients: ClientItem[],
): SiteMatch {
  const pn = normalize(projectName)
  let best: { site: JobSiteItem; score: number } | null = null
  for (const site of jobSites) {
    // Extract "Coppersmith" from "Coppersmith at Canton, MA"
    const mainName = site.name.split(/ at /i)[0].trim()
    const tokens = normalize(mainName).split(" ").filter(t => t.length >= 3)
    if (!tokens.length) continue
    const hits = tokens.filter(t => pn.includes(t)).length
    const score = hits / tokens.length
    if (!best || score > best.score) best = { site, score }
  }
  if (!best || best.score < 0.6) return null
  const client = clients.find(c => c.id === best!.site.client_id)
  return {
    clientName: client?.name ?? "Particular",
    siteName:   best.site.name,
  }
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function InfoBtn({ title, description }: { title: string; description: string }) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default" />}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity hover:opacity-100" />
        </TooltipTrigger>
        <TooltipContent className="flex max-w-[240px] flex-col gap-1">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

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

function Bar({ part, whole, color }: { part: number; whole: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct(part, whole)}%`, backgroundColor: color }} />
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ p, blur, match, onOpen }: {
  p: BudgetProject; blur: string; match: SiteMatch; onOpen: () => void
}) {
  const hasLabor = p.labor_committed > 0
  return (
    <button onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-all hover:border-border hover:shadow-md">

      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border/50 px-4 py-3">
        {p.project_type === "building"
          ? <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
          : <Home      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="line-clamp-2 text-sm font-semibold leading-tight" title={p.name}>{p.name}</p>
          {match && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{match.clientName} · {match.siteName.split(/ at /i)[0]}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {p.potentially_closed && (
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </TooltipTrigger>
                <TooltipContent>Potentially closed — nothing left to pay or receive</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {p.over_ceiling && (
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </TooltipTrigger>
                <TooltipContent>Cost over the 70% ceiling (margin below 30%)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Receivable */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Receivable</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {pct(p.received, p.projected_receive).toFixed(0)}% received
          </span>
        </div>
        <Bar part={p.received} whole={p.projected_receive} color="#22c55e" />
        <div className="flex flex-col gap-1">
          <MetricRow label="Estimated"  value={p.projected_receive} blur={blur} strong />
          <MetricRow label="Received"   value={p.received}          color="#22c55e" blur={blur} />
          <MetricRow label="To receive" value={p.to_receive}        blur={blur} />
        </div>
      </div>

      {/* Cost vs ceiling */}
      <div className="flex flex-col gap-2 border-t border-border/40 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Cost</span>
          <span className="ml-auto text-[10px] text-muted-foreground">ceiling {fmtShort(p.cost_ceiling)}</span>
        </div>
        <Bar part={p.cost_total} whole={p.cost_ceiling} color={p.over_ceiling ? "#ef4444" : "#f59e0b"} />
        <MetricRow label="Spent" value={p.cost_total} color={p.over_ceiling ? "#ef4444" : undefined} blur={blur} />
      </div>

      {/* Labor (PO) */}
      <div className="flex flex-col gap-2 border-t border-border/40 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <HardHat className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
            Labor — Subcontractor (PO)
          </span>
        </div>
        {hasLabor ? (
          <>
            <Bar part={p.labor_billed} whole={p.labor_committed} color="#f59e0b" />
            <div className="flex flex-col gap-1">
              <MetricRow label="Committed (PO)"   value={p.labor_committed} blur={blur} />
              <MetricRow label="To pay (open PO)" value={p.labor_open}
                color={p.labor_open > 0 ? "#f59e0b" : undefined} blur={blur} />
            </div>
          </>
        ) : (
          <p className="py-1 text-[11px] italic text-muted-foreground/50">No purchase orders.</p>
        )}
      </div>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BudgetControlPage() {
  return <Suspense><BudgetContent /></Suspense>
}

type SortField = "name" | "projected_receive" | "labor_committed" | "cost_total"

function BudgetContent() {
  const searchParams = useSearchParams()
  const company = searchParams.get("company") || "framing"
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const { user }       = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage = (!!user && ["dev", "owner", "admin"].includes(user.role))
    || myPerms?.permissions?.budget_control === "write"

  const [status,    setStatus]    = useState<BudgetStatus>("in_progress")
  const [search,    setSearch]    = useState("")
  const [sortField, setSortField] = useState<SortField>("projected_receive")
  const [sortAsc,   setSortAsc]   = useState(false)
  const [detailID,  setDetailID]  = useState<string | null>(null)

  const { data: summary,  isLoading: sumLoading  } = useBudgetSummary({ company })
  const { data: projects, isLoading: projLoading } = useBudgetProjects({ company, status })
  const { data: clients  = [] } = useClients()
  const { data: jobSites = [] } = useJobSites()

  // Pre-compute job-site matches for all projects
  const matchMap = useMemo(() => {
    const map = new Map<string, SiteMatch>()
    for (const p of (projects ?? [])) {
      map.set(p.customer_id || p.name, bestJobSiteMatch(p.name, jobSites, clients))
    }
    return map
  }, [projects, jobSites, clients])

  const rows = useMemo(() => (projects ?? [])
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1
      if (sortField === "name") return dir * a.name.localeCompare(b.name)
      return dir * ((a[sortField] as number) - (b[sortField] as number))
    }),
  [projects, search, sortField, sortAsc])

  if (sumLoading && projLoading) return <PageSkeleton />

  const s = summary
  const collectionRate = s && s.projected_receive > 0 ? (s.received / s.projected_receive * 100) : 0
  const grossMargin    = s && s.received > 0          ? ((s.received - s.cost_total) / s.received * 100) : 0

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

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Project status
            </span>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "in_progress", label: "In progress" },
                { value: "settled",     label: "Settled" },
                { value: "all",         label: "All" },
              ]}
            />
          </div>
          {canManage && (
            <Link href="/budget-control/manage"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:bg-input/30">
              <Settings className="h-3.5 w-3.5" /> Manage
            </Link>
          )}
        </div>
      </div>

      {/* ── Summary KPIs ─────────────────────────────────────────────────── */}
      {s && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/50 bg-border/30 lg:grid-cols-4">
          {([
            {
              label: "Estimated (receivable)",
              value: s.projected_receive,
              color: undefined as string | undefined,
              sub:   `${rows.length} project${rows.length === 1 ? "" : "s"} · ${status === "in_progress" ? "in progress" : status}`,
              info:  "Sum of project estimates — projected to receive.",
            },
            {
              label: "Received",
              value: s.received,
              color: "#22c55e",
              sub:   `${collectionRate.toFixed(1)}% collection rate`,
              info:  "Customer payments received to date.",
            },
            {
              label: "Cost",
              value: s.cost_total,
              color: "#ef4444",
              sub:   `${grossMargin.toFixed(1)}% gross margin`,
              info:  "All recorded expenses (bills, purchases, vendor credits).",
            },
            {
              label: "To pay",
              value: s.to_pay,
              color: s.to_pay > 0 ? "#f59e0b" : undefined,
              sub:   "Open PO + outstanding bills",
              info:  "Open PO commitment + outstanding vendor bill balances.",
            },
          ] as const).map(({ label, value, color, sub, info }) => (
            <div key={label} className="flex flex-col gap-0.5 bg-card/70 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
                <InfoBtn title={label} description={info} />
              </div>
              <span className={`text-lg font-bold ${blur}`} style={color ? { color } : undefined}>
                {fmt(value)}
              </span>
              <span className="text-[10px] text-muted-foreground/60">{sub}</span>
            </div>
          ))}
        </div>
      )}

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
            {/* Sort */}
            <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
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
          <div className="flex-1 overflow-y-auto no-scrollbar p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map(p => (
                <ProjectCard
                  key={p.customer_id || p.name}
                  p={p}
                  blur={blur}
                  match={matchMap.get(p.customer_id || p.name) ?? null}
                  onOpen={() => setDetailID(p.customer_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {detailID && (
        <ProjectBudgetModal company={company} customerID={detailID} onClose={() => setDetailID(null)} />
      )}
    </div>
  )
}
