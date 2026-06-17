"use client"

import { useState } from "react"
import {
  X, ChevronRight, Loader2, Building2, Home, AlertTriangle,
  Wallet, Coins, HardHat, Tag, ChevronDown, Check, Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail } from "@/hooks/use-budget"
import type { CostCategory, CostVendor } from "@/services/budget.service"
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

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
  if (!Icon) return <Tag className={className} />
  return <Icon className={className} />
}

// ── Value cell ────────────────────────────────────────────────────────────────

function ValueCell({ value, color, blur, sm }: { value: number; color?: string; blur: string; sm?: boolean }) {
  return (
    <div className="w-24 text-right">
      <span
        className={cn("tabular-nums font-semibold", sm ? "text-[10px]" : "text-[11px]", blur)}
        style={color ? { color } : undefined}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

// ── Vendor row ────────────────────────────────────────────────────────────────

function VendorRow({ vendor, blur }: { vendor: CostVendor; blur: string }) {
  const [open, setOpen] = useState(false)
  const hasDetail = vendor.payments.length > 0 || vendor.purchase_orders.length > 0
  const isSettled = vendor.billed > 0 && vendor.open <= 0

  return (
    <div className="border-t border-border/10 first:border-t-0">
      <button
        onClick={() => hasDetail && setOpen(o => !o)}
        className={cn(
          "flex w-full items-center gap-2 py-1.5 pr-4 text-left",
          "pl-[52px]", // aligns name below category name (px-4 + icon-w-6 + gap-3 ≈ 52px)
          hasDetail ? "cursor-pointer hover:bg-muted/10" : "cursor-default"
        )}
      >
        {hasDetail
          ? <ChevronRight className={cn("h-2.5 w-2.5 shrink-0 -ml-4 text-muted-foreground/30 transition-transform", open && "rotate-90")} />
          : <div className="h-2.5 w-2.5 shrink-0 -ml-4" />
        }
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/80">{vendor.vendor_name || "—"}</span>
        {isSettled && <Check className="h-3 w-3 shrink-0 text-emerald-500/60" />}
        <div className="flex shrink-0 items-center">
          <ValueCell value={vendor.committed} blur={blur} sm />
          <ValueCell value={vendor.billed} blur={blur} sm />
          <ValueCell value={vendor.paid} color="#22c55e" blur={blur} sm />
          <ValueCell value={vendor.open} color={vendor.open > 0 ? "#f97316" : undefined} blur={blur} sm />
        </div>
        {/* spacer matching chevron width in CategoryRow */}
        <div className="w-[22px] shrink-0" />
      </button>

      {open && (
        <div className="ml-[52px] mb-2 border-l border-border/20 pl-3 pr-4">
          {vendor.payments.length > 0 && (
            <div className="py-1.5">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                Payments ({vendor.payments.length})
              </p>
              {vendor.payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <div className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/50" />
                  <span className="w-14 shrink-0 text-[10px] tabular-nums text-muted-foreground/50">{fmtDate(p.date)}</span>
                  <span className="flex-1 truncate text-[10px] text-muted-foreground/40">{p.ref_number || "—"}</span>
                  <span className={cn("text-[10px] font-semibold tabular-nums text-emerald-600", blur)}>{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {vendor.purchase_orders.length > 0 && (
            <div className={cn("py-1.5", vendor.payments.length > 0 && "border-t border-border/10")}>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                Purchase orders ({vendor.purchase_orders.length})
              </p>
              {vendor.purchase_orders.map(po => (
                <div key={po.external_id} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] text-muted-foreground/50">{po.doc_number || po.external_id}</span>
                  <span className="text-[9px] text-muted-foreground/30">{fmtDate(po.txn_date)}</span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium"
                    style={po.po_status === "Open"
                      ? { color: "#f97316", background: "rgba(245,158,11,0.1)" }
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

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({ cat, blur, isOpen, onToggle }: { cat: CostCategory; blur: string; isOpen: boolean; onToggle: () => void }) {
  const isUncategorized = !cat.category_id
  const isSettled = cat.billed > 0 && cat.open <= 0
  const isNoPO = cat.committed === 0
  const isOverbilled = cat.committed > 0 && cat.billed > cat.committed

  const billedPct = cat.committed > 0 ? Math.min((cat.billed / cat.committed) * 100, 100) : 0
  const paidPct = cat.committed > 0 ? Math.min((cat.paid / cat.committed) * 100, 100) : 0

  return (
    <div className={cn("border-b border-border/30 last:border-b-0", isUncategorized && "opacity-60")}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/10"
      >
        {/* Icon */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/30">
          <CategoryIcon name={cat.icon} className="h-3 w-3 text-muted-foreground/70" />
        </div>

        {/* Name + mini progress bar */}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold">{cat.category_name}</span>
          {!isNoPO && (
            <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/30">
              <div className="absolute inset-y-0 left-0 rounded-full bg-red-500/35 transition-all" style={{ width: `${billedPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/65 transition-all" style={{ width: `${paidPct}%` }} />
            </div>
          )}
        </div>

        {/* Status badge — fixed width keeps value columns aligned */}
        <div className="w-16 shrink-0 text-right">
          {isSettled ? (
            <span className="inline-block rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">settled</span>
          ) : isNoPO ? (
            <span className="inline-block rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/50">no PO</span>
          ) : isOverbilled ? (
            <span className="inline-block rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-orange-500">overbilled</span>
          ) : null}
        </div>

        {/* 4 value columns */}
        <div className="flex shrink-0 items-center">
          <ValueCell value={cat.committed} blur={blur} />
          <ValueCell value={cat.billed} blur={blur} />
          <ValueCell value={cat.paid} color="#22c55e" blur={blur} />
          <ValueCell value={cat.open} color={cat.open > 0 ? "#f97316" : undefined} blur={blur} />
        </div>

        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="border-t border-border/20 bg-background/20 pb-1">
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
  const [showByType, setShowByType] = useState(false)
  const [openCatId, setOpenCatId] = useState<string | null>(null)

  const overCeiling = !!data && data.cost_ceiling > 0 && data.cost_total > data.cost_ceiling

  const incomeAccounts = data?.income_accounts ?? []
  const costCategories = (data?.cost_categories ?? []).slice().sort((a, b) => {
    if (!a.category_id) return 1
    if (!b.category_id) return -1
    return 0
  })
  const costAccounts = data?.cost_accounts ?? []

  const catTotals = costCategories.reduce(
    (acc, c) => ({ committed: acc.committed + c.committed, billed: acc.billed + c.billed, paid: acc.paid + c.paid, open: acc.open + c.open }),
    { committed: 0, billed: 0, paid: 0, open: 0 }
  )

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
                <div className="flex flex-col gap-3 self-start rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-500">Income</span>
                    <div className="ml-auto flex items-baseline gap-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                      <span className={cn("text-base font-bold tabular-nums text-emerald-500", blur)}>{fmt(data.income_actual)}</span>
                    </div>
                  </div>
                  <SegBar
                    total={Math.max(data.income_actual, data.projected_receive)}
                    segments={[
                      { value: data.received, color: "#22c55e", label: "Received", icon: Check },
                      { value: data.to_receive, color: "#f97316", label: "Outstanding", icon: Clock },
                    ]}
                    remainder={{ label: "Estimated", value: data.projected_receive }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Received</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.received)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Outstanding</span>
                      <span className={cn("text-lg font-bold tabular-nums text-orange-500", blur)}>{fmt(data.to_receive)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Estimated</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.projected_receive)}</span>
                    </div>
                  </div>
                  {incomeAccounts.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-border/30">
                      <button
                        onClick={() => setShowByType(o => !o)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/10"
                      >
                        <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">By Type</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showByType && "rotate-180")} />
                      </button>
                      {showByType && (
                        <div className="border-t border-border/20">
                          <div className="flex items-center bg-muted/10 px-3 py-1">
                            <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Type</span>
                            <div className="flex shrink-0">
                              {["Invoiced", "Received", "Outstanding"].map(h => (
                                <div key={h} className="w-28 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{h}</div>
                              ))}
                            </div>
                          </div>
                          {incomeAccounts.map(ia => {
                            const receivedForType = Math.max(ia.amount - ia.outstanding, 0)
                            const settled = ia.outstanding === 0
                            return (
                              <div key={ia.name} className="flex items-center border-t border-border/20 px-3 py-1.5">
                                <div className="flex flex-1 items-center gap-1.5 min-w-0">
                                  <span className={cn("truncate text-[11px]", settled ? "text-muted-foreground/50" : "text-muted-foreground")}>{ia.name}</span>
                                  <div className="w-3.5 shrink-0">
                                    {settled && <Check className="h-3 w-3 text-emerald-500" />}
                                  </div>
                                </div>
                                <div className="flex shrink-0">
                                  <span className={cn("w-28 text-right text-[11px] font-semibold tabular-nums", settled ? "text-muted-foreground/50" : "text-foreground/80", blur)}>
                                    {fmt(ia.amount)}
                                  </span>
                                  <span className={cn("w-28 text-right text-[11px] font-semibold tabular-nums", settled ? "text-muted-foreground/50" : "text-foreground/80", blur)}>
                                    {fmt(receivedForType)}
                                  </span>
                                  <span className={cn("w-28 text-right text-[11px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/50" : "text-orange-500")}>
                                    {fmt(ia.outstanding)}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* COST OVERVIEW */}
                <div className={cn("flex flex-col gap-3 self-start rounded-xl border p-4",
                  overCeiling ? "border-red-500/30 bg-red-500/[0.04]" : "border-red-500/20 bg-red-500/[0.03]")}>
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-500">Cost</span>
                    <div className="ml-auto flex items-baseline gap-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                      <span className={cn("text-base font-bold tabular-nums text-red-500", blur)}>
                        {fmt(data.cost_total)}
                      </span>
                    </div>
                  </div>
                  <SegBar
                    total={Math.max(data.cost_ceiling, data.cost_total)}
                    segments={[
                      { value: data.paid, color: "#ef4444", label: "Paid", icon: Check },
                      { value: data.open_payable, color: "#f97316", label: "Outstanding", icon: Clock },
                    ]}
                    remainder={{ label: "Cost Budget", value: data.cost_ceiling }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Paid</span>
                      <span className={cn("text-lg font-bold tabular-nums text-red-500", blur)}>{fmt(data.paid)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Outstanding</span>
                      <span className={cn("text-lg font-bold tabular-nums text-orange-500", blur)}>{fmt(data.open_payable)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Cost Budget</span>
                      <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(data.cost_ceiling)}</span>
                    </div>
                  </div>
                  {overCeiling && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-500">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Over the 70% ceiling — projected margin below {Math.round(data.margin_target * 100)}%.
                    </div>
                  )}
                  {/* By Account collapsible */}
                  {costAccounts.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-border/30">
                      <button
                        onClick={() => setShowAccounts(o => !o)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/10"
                      >
                        <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">By Account</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showAccounts && "rotate-180")} />
                      </button>
                      {showAccounts && (
                        <div className="border-t border-border/20">
                          <div className="flex items-center bg-muted/10 px-3 py-1">
                            <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Account</span>
                            <div className="flex shrink-0">
                              <div className="w-28 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Billed</div>
                              <div className="w-28 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Paid</div>
                              <div className="w-28 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Outstanding</div>
                            </div>
                          </div>
                          {costAccounts.map((ca, i) => (
                            <div key={i} className="flex items-center border-t border-border/10 px-3 py-1">
                              <span className="flex-1 truncate text-[11px] font-medium text-foreground/80" title={ca.name}>{ca.name}</span>
                              <span className={cn("w-28 text-right text-[11px] font-semibold tabular-nums", blur, ca.amount < 0 && "text-emerald-500")}>
                                {fmt(ca.amount)}
                              </span>
                              <span className={cn("w-28 text-right text-[11px] font-semibold tabular-nums", blur)}>
                                {fmt(ca.paid)}
                              </span>
                              <span className={cn("w-28 text-right text-[11px] font-semibold tabular-nums", blur, ca.outstanding > 0 ? "text-orange-500" : "text-muted-foreground/40")}>
                                {fmt(ca.outstanding)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Subcontractor Costs ───────────────────────────────────────── */}
              <div className="flex flex-col gap-0">

                {/* Section header */}
                <div className="flex flex-col gap-2 rounded-t-xl border border-yellow-500/25 bg-yellow-500/[0.04] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <HardHat className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-xs font-semibold text-yellow-500">Subcontractor Costs</span>
                    {costCategories.length === 0 && (
                      <span className="text-[10px] italic text-muted-foreground/50">No categories assigned yet</span>
                    )}
                    {costCategories.length > 0 && (
                      <div className="ml-auto flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground">
                        <span>Committed <span className={cn("font-semibold text-foreground", blur)}>{fmt(catTotals.committed)}</span></span>
                        <span>Billed <span className={cn("font-semibold text-foreground", blur)}>{fmt(catTotals.billed)}</span></span>
                        <span>Paid <span className={cn("font-semibold text-emerald-600", blur)}>{fmt(catTotals.paid)}</span></span>
                        <span>Open <span className={cn("font-semibold", catTotals.open > 0 ? "text-orange-500" : "text-muted-foreground", blur)}>{fmt(catTotals.open)}</span></span>
                      </div>
                    )}
                  </div>
                  {/* Overall billing progress bar */}
                  {catTotals.committed > 0 && (
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-red-500/30 transition-all"
                        style={{ width: `${Math.min((catTotals.billed / catTotals.committed) * 100, 100)}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/60 transition-all"
                        style={{ width: `${Math.min((catTotals.paid / catTotals.committed) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Column labels */}
                {costCategories.length > 0 && (
                  <div className="flex items-center border-x border-yellow-500/20 bg-background/20 px-4 py-1">
                    <div className="h-6 w-6 shrink-0" /> {/* icon placeholder */}
                    <div className="flex-1 pl-3 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Category</div>
                    <div className="w-16 shrink-0" /> {/* badge placeholder */}
                    <div className="flex shrink-0 items-center">
                      {(["Committed", "Billed", "Paid", "Open"] as const).map(lbl => (
                        <div key={lbl} className="w-24 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                          {lbl}
                        </div>
                      ))}
                    </div>
                    <div className="w-[22px] shrink-0" /> {/* chevron placeholder */}
                  </div>
                )}

                {/* Category rows */}
                <div className={cn(
                  "flex flex-col overflow-hidden rounded-b-xl border border-t-0 border-yellow-500/20",
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

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
