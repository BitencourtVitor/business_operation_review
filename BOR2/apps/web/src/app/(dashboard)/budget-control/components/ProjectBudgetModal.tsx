"use client"

import { useState } from "react"
import * as Lucide from "lucide-react"
import {
  X, ChevronRight, Loader2, Building2, Home, AlertTriangle, Tag,
  Wallet, HardHat, Coins, HelpCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail } from "@/hooks/use-budget"
import type { CategoryCost, PORow, SubcontractorCategory } from "@/services/budget.service"

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const fmtDate = (s: string) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
const pctStr = (part: number, whole: number) => `${pct(part, whole).toFixed(0)}%`

function CatIcon({ name, className }: { name: string; className?: string }) {
  const Ico = (Lucide as unknown as Record<string, React.ElementType>)[name] ?? Tag
  return <Ico className={className} />
}

// ── Segmented progress bar ────────────────────────────────────────────────────

function SegBar({ total, segments }: { total: number; segments: { value: number; color: string }[] }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
      {segments.map((s, i) => {
        const w = total > 0 ? Math.max((Math.max(s.value, 0) / total) * 100, 0) : 0
        return <div key={i} className="h-full transition-all" style={{ width: `${w}%`, backgroundColor: s.color }} />
      })}
    </div>
  )
}

// One metric line: label · amount · (optional) percent
function Line({ label, value, color, blur, pctOf, dot, strong }: {
  label: string; value: number; color?: string; blur: string
  pctOf?: number; dot?: string; strong?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className={cn("text-[11px] text-muted-foreground", strong && "font-medium text-foreground")}>{label}</span>
      <span className={cn("ml-auto tabular-nums", strong ? "text-[13px] font-bold" : "text-xs font-semibold", blur)}
        style={color ? { color } : undefined}>
        {fmt(value)}
      </span>
      {pctOf !== undefined && (
        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
          {pctStr(value, pctOf)}
        </span>
      )}
    </div>
  )
}

// ── Cost-by-category row (account-based / materials) ──────────────────────────

function alertColor(p: number, hasMax: boolean): string | undefined {
  if (!hasMax) return undefined
  if (p >= 100) return "#ef4444"
  if (p >= 80) return "#f59e0b"
  return "#22c55e"
}

function CategoryRow({ c, blur }: { c: CategoryCost; blur: string }) {
  const hasMax = c.max > 0
  const color = alertColor(c.alert_pct, hasMax)
  const barPct = hasMax ? Math.min(c.alert_pct, 100) : 0
  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <CatIcon name={c.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">{c.name}</span>
        {hasMax && c.alert_pct >= 80 && <AlertTriangle className="h-3 w-3" style={{ color }} />}
        <span className={`ml-auto text-xs font-semibold tabular-nums ${blur}`}>{fmt(c.actual)}</span>
        {hasMax && <span className={`text-[10px] text-muted-foreground tabular-nums ${blur}`}>/ {fmt(c.max)}</span>}
      </div>
      {hasMax && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  )
}

// ── Subcontractor-by-category row (PO commitment) ─────────────────────────────

function SubRow({ s, blur }: { s: SubcontractorCategory; blur: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <CatIcon name={s.icon || "HardHat"} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">{s.name}</span>
        <span className={`ml-auto text-xs font-semibold tabular-nums ${blur}`}>{fmt(s.committed)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(pct(s.billed, s.committed), 100)}%` }} />
      </div>
      <div className="flex items-center gap-3 text-[10px] tabular-nums text-muted-foreground">
        <span className={blur}>Billed {fmt(s.billed)}</span>
        <span className="ml-auto" style={s.open > 0 ? { color: "#f59e0b" } : undefined}>
          <span className={blur}>Open {fmt(s.open)}</span>
        </span>
      </div>
    </div>
  )
}

// ── Purchase Order card ───────────────────────────────────────────────────────

function POCard({ po, blur }: { po: PORow; blur: string }) {
  const [open, setOpen] = useState(false)
  const isOpen = po.po_status === "Open"
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/20">
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-90")} />
        <span className="truncate text-[11px] font-medium">{po.vendor_name || "—"}</span>
        {po.category && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{po.category}</span>}
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
          style={isOpen ? { color: "#f59e0b", background: "rgba(245,158,11,0.12)" } : { color: "#9ca3af", background: "rgba(156,163,175,0.12)" }}
        >
          {po.po_status || "—"}
        </span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtDate(po.txn_date)}</span>
        <span className={`w-20 shrink-0 text-right text-[11px] font-semibold tabular-nums ${blur}`}>{fmt(po.committed)}</span>
      </button>
      {open && (
        <div className="divide-y divide-border/20 border-t border-border/30 bg-background/40">
          {po.lines.map((l, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 pl-8">
              <span className="flex-1 whitespace-pre-line text-[10px] leading-tight text-muted-foreground">{l.description || "—"}</span>
              <div className="flex shrink-0 items-center gap-3 text-[10px] tabular-nums">
                <span className={`w-16 text-right font-semibold ${blur}`}>{fmt(l.amount)}</span>
                <span className={`w-16 text-right text-muted-foreground ${blur}`} title="Billed">{fmt(l.received)}</span>
                <span className={`w-16 text-right ${blur}`} style={l.open > 0 ? { color: "#f59e0b" } : { color: "var(--muted-foreground)" }} title="Open">
                  {l.open > 0 ? fmt(l.open) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section shell ─────────────────────────────────────────────────────────────

function Panel({ title, total, accent, blur, icon: Icon, children, empty }: {
  title: string; total?: number; accent: string; blur: string
  icon: React.ElementType; children: React.ReactNode; empty?: boolean
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-muted/10">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
        <span className="text-xs font-semibold">{title}</span>
        {total !== undefined && (
          <span className={`ml-auto text-xs font-bold tabular-nums ${blur}`} style={{ color: accent }}>{fmt(total)}</span>
        )}
      </div>
      {empty
        ? <p className="px-4 py-6 text-center text-[11px] italic text-muted-foreground/50">Nothing here.</p>
        : <div className="divide-y divide-border/30">{children}</div>}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function ProjectBudgetModal({ company, projectID, onClose }: {
  company: string; projectID: string; onClose: () => void
}) {
  const { data, isLoading } = useBudgetDetail({ company, project_id: projectID })
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const overCeiling = !!data && data.cost_ceiling > 0 && data.cost_total > data.cost_ceiling

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative flex max-h-[92vh] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            {data?.project_type === "building"
              ? <Building2 className="h-4 w-4 text-muted-foreground" />
              : <Home className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="text-sm font-semibold leading-tight">{data?.name ?? "Project"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {data?.client_name ? `${data.client_name} · ` : ""}{data?.project_type ?? ""} · target margin {data ? Math.round(data.margin_target * 100) : 30}%
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data found</div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* ── Income / Cost partitions ─────────────────────────────────── */}
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">

                {/* INCOME */}
                <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-500">Income</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pctStr(data.received, data.projected_receive)} received
                    </span>
                  </div>
                  <SegBar total={data.projected_receive} segments={[
                    { value: data.received, color: "#22c55e" },
                    { value: data.to_receive, color: "#f59e0b" },
                    { value: Math.max(data.projected_receive - data.invoiced, 0), color: "#3f3f46" },
                  ]} />
                  <div className="flex flex-col gap-1.5">
                    <Line label="Estimated (contract)" value={data.projected_receive} blur={blur} strong />
                    <Line label="Invoiced" value={data.invoiced} blur={blur} pctOf={data.projected_receive} />
                    <Line label="Received" value={data.received} color="#22c55e" dot="#22c55e" blur={blur} pctOf={data.projected_receive} />
                    <Line label="To receive (open invoices)" value={data.to_receive} dot="#f59e0b" blur={blur} pctOf={data.projected_receive} />
                  </div>
                </div>

                {/* COST */}
                <div className={cn("flex flex-col gap-3 rounded-xl border p-4",
                  overCeiling ? "border-red-500/30 bg-red-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.03]")}>
                  <div className="flex items-center gap-2">
                    <Coins className={cn("h-4 w-4", overCeiling ? "text-red-500" : "text-amber-500")} />
                    <span className={cn("text-sm font-semibold", overCeiling ? "text-red-500" : "text-amber-500")}>Cost</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pctStr(data.cost_total, data.cost_ceiling)} of ceiling
                    </span>
                  </div>
                  <SegBar total={Math.max(data.cost_ceiling, data.cost_total)} segments={[
                    { value: data.paid, color: overCeiling ? "#ef4444" : "#f59e0b" },
                    { value: data.open_payable, color: "#fbbf24" },
                  ]} />
                  <div className="flex flex-col gap-1.5">
                    <Line label="Cost ceiling (70%)" value={data.cost_ceiling} blur={blur} strong />
                    <Line label="Spent (incurred)" value={data.cost_total} color={overCeiling ? "#ef4444" : undefined} blur={blur} pctOf={data.cost_ceiling} />
                    <Line label="Paid" value={data.paid} dot={overCeiling ? "#ef4444" : "#f59e0b"} blur={blur} pctOf={data.cost_total} />
                    <Line label="To pay (bills + open PO)" value={data.to_pay} dot="#fbbf24" blur={blur} />
                  </div>
                  {overCeiling && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-500">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Over the 70% ceiling — projected margin below {Math.round(data.margin_target * 100)}%.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Cost breakdowns ──────────────────────────────────────────── */}
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">

                {/* Subcontractors by category */}
                <Panel title="Subcontractors (PO)" total={data.labor_committed} accent="#f59e0b" blur={blur}
                  icon={HardHat} empty={data.subcontractor_categories.length === 0}>
                  {data.subcontractor_categories.map(s => <SubRow key={s.name} s={s} blur={blur} />)}
                  <div className="flex items-center gap-3 px-3 py-2 text-[10px] tabular-nums text-muted-foreground">
                    <span className={blur}>Billed {fmt(data.labor_billed)}</span>
                    <span className="ml-auto" style={data.labor_open > 0 ? { color: "#f59e0b" } : undefined}>
                      <span className={blur}>Open {fmt(data.labor_open)}</span>
                    </span>
                  </div>
                </Panel>

                {/* Other costs by category */}
                <Panel title="Cost by category" total={data.cost_total} accent="#ef4444" blur={blur}
                  icon={Coins} empty={data.categories.length === 0 && data.uncategorized <= 0.5}>
                  {data.categories.map(c => <CategoryRow key={c.name} c={c} blur={blur} />)}
                  {data.uncategorized > 0.5 && (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground/60">Uncategorized</span>
                      <span className={`ml-auto text-xs font-semibold tabular-nums text-muted-foreground/60 ${blur}`}>{fmt(data.uncategorized)}</span>
                    </div>
                  )}
                </Panel>
              </div>

              {/* ── Purchase orders ──────────────────────────────────────────── */}
              <div className="flex flex-col rounded-xl border border-border bg-muted/10">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-xs font-semibold text-amber-500">Purchase Orders ({data.purchase_orders.length})</span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {data.purchase_orders.length === 0 ? (
                    <p className="py-4 text-center text-[11px] italic text-muted-foreground/50">No purchase orders.</p>
                  ) : (
                    data.purchase_orders.map(po => <POCard key={po.external_id} po={po} blur={blur} />)
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
