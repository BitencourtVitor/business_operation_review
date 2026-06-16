"use client"

import { useState } from "react"
import * as Lucide from "lucide-react"
import { X, ChevronRight, Loader2, Building2, Home, AlertTriangle, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail } from "@/hooks/use-budget"
import type { CategoryCost, PORow } from "@/services/budget.service"

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const fmtDate = (s: string) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}

function CatIcon({ name, className }: { name: string; className?: string }) {
  const Ico = (Lucide as unknown as Record<string, React.ElementType>)[name] ?? Tag
  return <Ico className={className} />
}

function alertColor(pct: number, hasMax: boolean): string | undefined {
  if (!hasMax) return undefined
  if (pct >= 100) return "#ef4444"
  if (pct >= 80) return "#f59e0b"
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
        {hasMax && c.alert_pct >= 80 && (
          <AlertTriangle className="h-3 w-3" style={{ color: color }} />
        )}
        <span className={`ml-auto text-xs font-semibold tabular-nums ${blur}`}>{fmt(c.actual)}</span>
        {hasMax && (
          <span className={`text-[10px] text-muted-foreground tabular-nums ${blur}`}>/ {fmt(c.max)}</span>
        )}
      </div>
      {hasMax && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  )
}

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

export function ProjectBudgetModal({ company, customerID, onClose }: {
  company: string; customerID: string; onClose: () => void
}) {
  const { data, isLoading } = useBudgetDetail({ company, customer_id: customerID })
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const overCeiling = !!data && data.cost_ceiling > 0 && data.cost_total > data.cost_ceiling

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative flex max-h-[90vh] w-[min(1080px,96vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            {data?.project_type === "building"
              ? <Building2 className="h-4 w-4 text-muted-foreground" />
              : <Home className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="text-sm font-semibold leading-tight">{data?.name ?? "Project"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {data?.project_type ?? ""} · target margin {data ? Math.round(data.margin_target * 100) : 30}%
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
              {/* Top figures */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: "Estimated", value: data.projected_receive, color: undefined },
                  { label: "Received", value: data.received, color: "#22c55e" },
                  { label: "Cost", value: data.cost_total, color: "#ef4444" },
                  { label: "Cost ceiling (70%)", value: data.cost_ceiling, color: overCeiling ? "#ef4444" : undefined },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className={`text-base font-bold ${blur}`} style={color ? { color } : undefined}>{fmt(value)}</span>
                  </div>
                ))}
              </div>
              {overCeiling && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Cost exceeds the 70% ceiling — projected margin below {Math.round(data.margin_target * 100)}%.
                </div>
              )}

              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                {/* Cost by category */}
                <div className="flex flex-col rounded-xl border border-border bg-muted/10">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-xs font-semibold">Cost by category</span>
                    <span className={`text-xs font-bold tabular-nums text-red-400 ${blur}`}>{fmt(data.cost_total)}</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {data.categories.length === 0 && (
                      <p className="px-4 py-6 text-center text-[11px] italic text-muted-foreground/50">No categorized cost.</p>
                    )}
                    {data.categories.map(c => <CategoryRow key={c.name} c={c} blur={blur} />)}
                    {data.uncategorized > 0.5 && (
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        <span className="text-xs text-muted-foreground/60">Uncategorized</span>
                        <span className={`ml-auto text-xs font-semibold tabular-nums text-muted-foreground/60 ${blur}`}>{fmt(data.uncategorized)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Purchase orders */}
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
