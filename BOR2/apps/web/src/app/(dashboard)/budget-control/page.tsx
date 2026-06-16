"use client"

import { Suspense, useState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Search, X, Info, HandCoins, Loader2, FolderOpen,
  ArrowDownAZ, ArrowUpZA, ArrowDown01, ArrowUp01, HardHat, Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetProjects, useBudgetSummary } from "@/hooks/use-budget"
import type { BudgetProject } from "@/services/budget.service"

const COMPANY_LOGO: Record<string, string> = {
  hvac:    "/images/sublogo_hvac.png",
  framing: "/images/sublogo_framing.png",
  pcg:     "/images/sublogo_pcg.png",
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return fmt(n)
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.min((part / whole) * 100, 100) : 0)

function InfoBtn({ title, description }: { title: string; description: string }) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default" />}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity hover:opacity-100" />
        </TooltipTrigger>
        <TooltipContent className="flex flex-col gap-1 max-w-[240px]">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── metric row inside a card section ─────────────────────────────────────────

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

// ── project card (one per obra) ──────────────────────────────────────────────

function ProjectCard({ p, blur }: { p: BudgetProject; blur: string }) {
  const hasLabor = p.labor_committed > 0
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all hover:border-border hover:shadow-md">

      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border/50 px-4 py-3">
        <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
        <p className="line-clamp-2 text-sm font-semibold leading-tight" title={p.name}>{p.name}</p>
      </div>

      {/* Receivables */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Receivable</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{pct(p.received, p.projected_receive).toFixed(0)}% received</span>
        </div>
        <Bar part={p.received} whole={p.projected_receive} color="#22c55e" />
        <div className="flex flex-col gap-1">
          <MetricRow label="Estimated" value={p.projected_receive} blur={blur} strong />
          <MetricRow label="Invoiced" value={p.invoiced} blur={blur} />
          <MetricRow label="Received" value={p.received} color="#22c55e" blur={blur} />
        </div>
      </div>

      {/* Labor / subcontractor (PO-driven) */}
      <div className="flex flex-col gap-2 border-t border-border/40 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <HardHat className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Labor — Subcontractor (PO)</span>
        </div>
        {hasLabor ? (
          <>
            <Bar part={p.labor_billed} whole={p.labor_committed} color="#f59e0b" />
            <div className="flex flex-col gap-1">
              <MetricRow label="Committed (PO)" value={p.labor_committed} blur={blur} strong />
              <MetricRow label="Billed" value={p.labor_billed} blur={blur} />
              <MetricRow label="To pay (open PO)" value={p.labor_open} color={p.labor_open > 0 ? "#f59e0b" : undefined} blur={blur} />
            </div>
          </>
        ) : (
          <p className="py-1 text-[11px] italic text-muted-foreground/50">No purchase orders for this project.</p>
        )}
      </div>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function BudgetControlPage() {
  return (
    <Suspense>
      <BudgetContent />
    </Suspense>
  )
}

type SortField = "name" | "projected_receive" | "labor_committed" | "labor_open"

function BudgetContent() {
  const searchParams = useSearchParams()
  const company = searchParams.get("company") || "framing"
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("labor_committed")
  const [sortAsc, setSortAsc] = useState(false)

  const { data: summary, isLoading: sumLoading } = useBudgetSummary({ company })
  const { data: projects, isLoading: projLoading } = useBudgetProjects({ company })

  const rows = (projects ?? []).filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  ).slice().sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    if (sortField === "name") return dir * a.name.localeCompare(b.name)
    return dir * ((a[sortField] as number) - (b[sortField] as number))
  })

  if (sumLoading && projLoading) return <PageSkeleton />

  const s = summary

  return (
    <div className="flex h-full flex-col gap-4">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          <p className="text-sm text-muted-foreground">Receivables and subcontractor (labor) commitment per project</p>
        </div>
      </div>

      {/* Summary KPIs */}
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Estimated (receivable)", value: s.projected_receive, color: undefined, info: "Sum of project estimates — projected to receive." },
            { label: "Received", value: s.received, color: "#22c55e", info: "Customer payments actually received." },
            { label: "Labor committed (PO)", value: s.labor_committed, color: "#f59e0b", info: "Total of subcontractor purchase orders — projected labor cost." },
            { label: "Labor to pay (open PO)", value: s.labor_open, color: s.labor_open > 0 ? "#f59e0b" : undefined, info: "Open PO commitment not yet billed — upcoming subcontractor outflow." },
          ].map(({ label, value, color, info }) => (
            <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                <InfoBtn title={label} description={info} />
              </div>
              <span className={`text-lg font-bold ${blur}`} style={color ? { color } : undefined}>{fmt(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <span className="text-sm font-semibold">{rows.length} project{rows.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="h-7 w-40 rounded-md border border-input bg-transparent pl-7 pr-6 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex h-7 items-center rounded-md border border-input bg-transparent dark:bg-input/30 overflow-hidden">
            {([
              { f: "labor_committed", label: "Labor" },
              { f: "projected_receive", label: "Estimate" },
              { f: "name", label: "Name" },
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

      {/* Project cards */}
      {projLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty className="border-0">
            <EmptyMedia><HandCoins className="h-8 w-8 text-muted-foreground/50" /></EmptyMedia>
            <EmptyTitle>No projects found for this period.</EmptyTitle>
          </Empty>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map(p => <ProjectCard key={p.customer_id || p.name} p={p} blur={blur} />)}
          </div>
        </div>
      )}
    </div>
  )
}
