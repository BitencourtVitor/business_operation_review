"use client"

import { useState } from "react"
import {
  X, ChevronRight, Loader2, Building2, Home, AlertTriangle,
  Wallet, Coins, HardHat, Tag, ChevronDown, Receipt, Check, Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail } from "@/hooks/use-budget"
import type { CostAccount, CostCategory, CostVendor } from "@/services/budget.service"
import * as LucideIcons from "lucide-react"

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (s: string) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
const pctStr = (part: number, whole: number) => `${pct(part, whole).toFixed(0)}%`

// ── Shared primitives ─────────────────────────────────────────────────────────

type SegDef = { value: number; color: string; label?: string; icon?: React.ComponentType<{ className?: string }> }

function SegBar({ total, segments, remainder }: {
  total: number
  segments: SegDef[]
  remainder?: { label: string; value: number }
}) {
  const filledPct = segments.reduce((sum, s) => sum + (total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0), 0)
  const remainPct = Math.max(100 - filledPct, 0)

  const tooltip = (label: string, value: number, color?: string) => (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-[10px] font-medium text-popover-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
      {color && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: color }} />}
      {label}: <span className="font-bold">{fmt(value)}</span>
    </div>
  )

  return (
    <div className="relative h-6 w-full">
      {/* Coloured segments — clipped to pill shape */}
      <div className="absolute inset-0 flex overflow-hidden rounded-full bg-muted/30">
        {segments.map((s, i) => {
          const w = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0
          return (
            <div key={i} className="flex h-full items-center justify-center transition-all" style={{ width: `${w}%`, backgroundColor: s.color }}>
              {s.icon && w > 10 && <s.icon className="h-3 w-3 text-white/80" />}
            </div>
          )
        })}
      </div>
      {/* Transparent hover zones — outside overflow-hidden so tooltips aren't clipped */}
      <div className="absolute inset-0 flex">
        {segments.map((s, i) => {
          const w = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0
          return (
            <div key={i} className="group relative h-full" style={{ width: `${w}%` }}>
              {s.label && tooltip(s.label, s.value, s.color)}
            </div>
          )
        })}
        {remainder && remainPct > 0 && (
          <div className="group relative h-full" style={{ width: `${remainPct}%` }}>
            {tooltip(remainder.label, remainder.value)}
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ label, value, color, blur, pctOf, dot, strong, dimmed }: {
  label: string; value: number; color?: string; blur: string
  pctOf?: number; dot?: string; strong?: boolean; dimmed?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className={cn("text-[11px]", strong ? "font-medium text-foreground" : dimmed ? "text-muted-foreground/50" : "text-muted-foreground")}>{label}</span>
      <span className={cn("ml-auto tabular-nums", strong ? "text-[13px] font-bold" : "text-xs font-semibold", blur)}
        style={color ? { color } : undefined}>
        {fmt(value)}
      </span>
      {pctOf !== undefined && (
        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
          {pctStr(value, pctOf)}
        </span>
      )}
    </div>
  )
}

// Inline icon from a Lucide icon name string (from the category icon field).
function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
  if (!Icon) return <Tag className={className} />
  return <Icon className={className} />
}

// ── QB Accounts tree (collapsed secondary) ────────────────────────────────────

function AccountRow({ node, blur, depth = 0 }: { node: CostAccount; blur: string; depth?: number }) {
  const neg = node.amount < 0
  const hasKids = !!node.children?.length
  return (
    <>
      <div className="flex items-center gap-2 py-0.5" style={{ paddingLeft: 4 + depth * 12 }}>
        <span className={cn("truncate text-[11px]", depth === 0 ? "text-foreground/80 font-medium" : "text-muted-foreground")} title={node.name}>
          {node.name}
        </span>
        <span className={cn("ml-auto shrink-0 text-[11px] font-semibold tabular-nums", blur)}
          style={neg ? { color: "#22c55e" } : undefined}>
          {fmt(node.amount)}
        </span>
      </div>
      {hasKids && node.children!.map(c => <AccountRow key={c.name} node={c} blur={blur} depth={depth + 1} />)}
    </>
  )
}

// ── Vendor row inside a category ──────────────────────────────────────────────

function VendorRow({ vendor, blur }: { vendor: CostVendor; blur: string }) {
  const [open, setOpen] = useState(false)
  const hasPayments = vendor.payments.length > 0
  const isSettled = vendor.billed > 0 && vendor.open <= 0
  return (
    <div className="overflow-hidden rounded-lg border border-border/30 bg-card/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/20"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{vendor.vendor_name || "—"}</span>
        {isSettled && (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
            quitado
          </span>
        )}
        {/* 4-column metrics */}
        <div className="flex shrink-0 items-center gap-px">
          <MetricCell label="committed" value={vendor.committed} blur={blur} />
          <MetricCell label="billed" value={vendor.billed} blur={blur} />
          <MetricCell label="paid" value={vendor.paid} color="#22c55e" blur={blur} />
          <MetricCell label="open" value={vendor.open} color={vendor.open > 0 ? "#f59e0b" : undefined} blur={blur} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/20 bg-background/30">
          {/* Payment history */}
          {hasPayments ? (
            <div className="px-8 py-2">
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Payments ({vendor.payments.length})
              </p>
              <div className="flex flex-col gap-0.5">
                {vendor.payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-0.5">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/60" />
                    <span className="w-14 shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtDate(p.date)}</span>
                    <span className="flex-1 truncate text-[10px] text-muted-foreground/70">{p.ref_number || "—"}</span>
                    <span className={cn("text-[11px] font-semibold tabular-nums text-emerald-600", blur)}>{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="px-8 py-2 text-[10px] italic text-muted-foreground/40">No payments recorded.</p>
          )}

          {/* PO list (simplified) */}
          {vendor.purchase_orders.length > 0 && (
            <div className="border-t border-border/10 px-8 py-2">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Purchase orders ({vendor.purchase_orders.length})
              </p>
              {vendor.purchase_orders.map(po => (
                <div key={po.external_id} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] text-muted-foreground/70">{po.doc_number || po.external_id}</span>
                  <span className="text-[9px] text-muted-foreground/40">{fmtDate(po.txn_date)}</span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium"
                    style={po.po_status === "Open"
                      ? { color: "#f59e0b", background: "rgba(245,158,11,0.1)" }
                      : { color: "#9ca3af", background: "rgba(156,163,175,0.1)" }}
                  >
                    {po.po_status}
                  </span>
                  <span className={cn("ml-auto text-[10px] font-semibold tabular-nums", blur)}>{fmt(po.committed)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value, color, blur }: { label: string; value: number; color?: string; blur: string }) {
  return (
    <div className="flex w-24 flex-col items-end px-1">
      <span className={cn("text-[11px] font-semibold tabular-nums", blur)} style={color ? { color } : undefined}>
        {fmt(value)}
      </span>
    </div>
  )
}

// ── Category accordion row ────────────────────────────────────────────────────

function CategoryRow({ cat, blur, isOpen, onToggle }: { cat: CostCategory; blur: string; isOpen: boolean; onToggle: () => void }) {
  const isSettled = cat.billed > 0 && cat.open <= 0

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-card/60 px-4 py-3 text-left hover:bg-muted/20"
      >
        {/* Icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          <CategoryIcon name={cat.icon} className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {/* Name */}
        <span className="min-w-0 flex-1 text-[12px] font-semibold">{cat.category_name}</span>
        {/* Settled badge */}
        {isSettled && (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-600">
            quitado
          </span>
        )}
        {/* 4 metrics */}
        <div className="flex shrink-0 items-center gap-px">
          <MetricCell label="committed" value={cat.committed} blur={blur} />
          <MetricCell label="billed" value={cat.billed} blur={blur} />
          <MetricCell label="paid" value={cat.paid} color="#22c55e" blur={blur} />
          <MetricCell label="open" value={cat.open} color={cat.open > 0 ? "#f59e0b" : undefined} blur={blur} />
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="flex flex-col gap-2 border-t border-border/30 bg-background/30 p-3 pl-5">
          {cat.vendors.map(v => (
            <VendorRow key={v.vendor_id || v.vendor_name} vendor={v} blur={blur} />
          ))}
        </div>
      )}
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
  const [showAccounts, setShowAccounts] = useState(false)
  const [openCatId, setOpenCatId] = useState<string | null>(null)

  const overCeiling = !!data && data.cost_ceiling > 0 && data.cost_total > data.cost_ceiling

  const incomeAccounts = data?.income_accounts ?? []
  const costCategories = (data?.cost_categories ?? []).slice().sort((a, b) => {
    if (!a.category_id) return 1
    if (!b.category_id) return -1
    return 0
  })
  const costAccounts = data?.cost_accounts ?? []

  // Totals across all categories for the section header
  const catTotals = costCategories.reduce(
    (acc, c) => ({ committed: acc.committed + c.committed, billed: acc.billed + c.billed, paid: acc.paid + c.paid, open: acc.open + c.open }),
    { committed: 0, billed: 0, paid: 0, open: 0 }
  )

  // Cash position (receivables perspective)
  const netCash = data ? Math.max(data.received - data.paid, 0) : 0
  const netExposure = data ? data.to_receive - data.to_pay : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[92vh] w-[min(1200px,96vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

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
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data found</div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* ── Top row: Income + Cost overview ────────────────────────── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                {/* INCOME */}
                <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-500">Income</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                      <span className={cn("text-xs font-semibold tabular-nums text-emerald-500", blur)}>{fmt(data.income_actual)}</span>
                    </div>
                  </div>
                  <SegBar
                    total={Math.max(data.income_actual, data.projected_receive)}
                    segments={[
                      { value: data.received, color: "#22c55e", label: "Received", icon: Check },
                      { value: data.to_receive, color: "#f59e0b", label: "Outstanding", icon: Clock },
                    ]}
                    remainder={{ label: "Estimated", value: data.projected_receive }}
                  />
                  {/* 3-column: Received | Outstanding | Estimated */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Received</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.received)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Outstanding</span>
                      <span className={cn("text-lg font-bold tabular-nums text-amber-500", blur)}>{fmt(data.to_receive)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Estimated</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.projected_receive)}</span>
                    </div>
                  </div>
                  {incomeAccounts.length > 0 && (
                    <div className="border-t border-border/30 pt-2">
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">BY TYPE</p>
                      {incomeAccounts.map(ia => (
                        <div key={ia.name} className="flex items-center gap-2 px-1 py-0.5">
                          <span className="truncate text-[11px] text-muted-foreground">{ia.name}</span>
                          <div className="ml-auto flex items-center gap-3">
                            {ia.outstanding > 0 && (
                              <span className="text-[10px] text-muted-foreground/50">
                                out. <span className={cn("font-semibold text-amber-500", blur)}>{fmt(ia.outstanding)}</span>
                              </span>
                            )}
                            <span className={cn("text-[11px] font-semibold tabular-nums", blur)}
                              style={ia.amount < 0 ? { color: "#22c55e" } : undefined}>
                              {fmt(ia.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* COST OVERVIEW */}
                <div className={cn("flex flex-col gap-3 rounded-xl border p-4",
                  overCeiling ? "border-red-500/30 bg-red-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.03]")}>
                  <div className="flex items-center gap-2">
                    <Coins className={cn("h-4 w-4", overCeiling ? "text-red-500" : "text-amber-500")} />
                    <span className={cn("text-sm font-semibold", overCeiling ? "text-red-500" : "text-amber-500")}>
                      Cost
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pctStr(data.cost_total, data.cost_ceiling)} of ceiling
                    </span>
                  </div>
                  <SegBar
                    total={Math.max(data.cost_ceiling, data.cost_total)}
                    segments={[
                      { value: data.paid, color: overCeiling ? "#ef4444" : "#f59e0b", label: "Paid (bills)", icon: Receipt },
                      { value: data.open_payable, color: "#fbbf24", label: "Outstanding", icon: Clock },
                    ]}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Line label="Cost ceiling (70%)" value={data.cost_ceiling} blur={blur} strong />
                    <Line label="Total incurred" value={data.cost_total}
                      color={overCeiling ? "#ef4444" : undefined} blur={blur} pctOf={data.cost_ceiling} />
                    <Line label="Paid (bills)" value={data.paid} dot={overCeiling ? "#ef4444" : "#f59e0b"} blur={blur} />
                    <Line label="To pay (bills + PO open)" value={data.to_pay} dot="#fbbf24" blur={blur} />
                  </div>
                  {overCeiling && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-500">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Over the 70% ceiling — projected margin below {Math.round(data.margin_target * 100)}%.
                    </div>
                  )}
                  {/* Cash position */}
                  <div className="border-t border-border/30 pt-2">
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">CASH POSITION</p>
                    <Line
                      label="Net cash (received − paid)"
                      value={netCash}
                      color={netCash >= 0 ? "#22c55e" : "#ef4444"}
                      blur={blur}
                    />
                    <Line
                      label="Net exposure (to receive − to pay)"
                      value={netExposure}
                      color={netExposure >= 0 ? "#22c55e" : "#ef4444"}
                      blur={blur}
                    />
                  </div>
                </div>
              </div>

              {/* ── Cost by Category ─────────────────────────────────────────── */}
              <div className="flex flex-col gap-0">
                {/* Section header */}
                <div className="flex items-center gap-3 rounded-t-xl border border-border/50 bg-muted/20 px-4 py-2.5">
                  <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold leading-tight">Subcontractor Costs</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">by category</span>
                  </div>
                  {costCategories.length === 0 && (
                    <span className="text-[10px] italic text-muted-foreground/50">No categories assigned yet</span>
                  )}
                  {costCategories.length > 0 && (
                    <div className="ml-auto flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground">
                      <span>PO Value <span className={cn("font-semibold text-foreground", blur)}>{fmt(catTotals.committed)}</span></span>
                      <span>Billed <span className={cn("font-semibold text-foreground", blur)}>{fmt(catTotals.billed)}</span></span>
                      <span>Paid <span className={cn("font-semibold text-emerald-600", blur)}>{fmt(catTotals.paid)}</span></span>
                      <span>Open <span className={cn("font-semibold", catTotals.open > 0 ? "text-amber-500" : "text-muted-foreground", blur)}>{fmt(catTotals.open)}</span></span>
                    </div>
                  )}
                </div>

                {/* Column labels row */}
                {costCategories.length > 0 && (
                  <div className="flex items-center border-x border-border/40 bg-background/20 px-4 py-1">
                    <div className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Category</div>
                    <div className="flex shrink-0 items-center gap-px">
                      {(["PO value", "billed", "paid", "open"] as const).map(lbl => (
                        <div key={lbl} className="w-24 text-right pr-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                          {lbl}
                        </div>
                      ))}
                    </div>
                    <div className="w-8" />
                  </div>
                )}

                {/* Category rows */}
                <div className={cn(
                  "flex flex-col overflow-hidden rounded-b-xl border border-t-0 border-border/50",
                  costCategories.length === 0 && "rounded-t-none"
                )}>
                  {costCategories.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-[11px] italic text-muted-foreground/40">
                      Assign categories to subcontractors in Manage → Category Assignment.
                    </div>
                  ) : (
                    costCategories.map(cat => {
                      const id = cat.category_id || cat.category_name
                      return (
                        <CategoryRow
                          key={id}
                          cat={cat}
                          blur={blur}
                          isOpen={openCatId === id}
                          onToggle={() => setOpenCatId(prev => prev === id ? null : id)}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              {/* ── QB Accounts (secondary, collapsible) ─────────────────────── */}
              {costAccounts.length > 0 && (
                <div className="rounded-xl border border-border/30">
                  <button
                    onClick={() => setShowAccounts(o => !o)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/10"
                  >
                    <Receipt className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-[11px] font-medium text-muted-foreground">Cost by QB Account</span>
                    <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showAccounts && "rotate-180")} />
                  </button>
                  {showAccounts && (
                    <div className="border-t border-border/20 px-4 py-3">
                      {costAccounts.map((ca, i) => (
                        <div key={i} className="mb-3">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{ca.group}</p>
                          <AccountRow node={ca} blur={blur} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
