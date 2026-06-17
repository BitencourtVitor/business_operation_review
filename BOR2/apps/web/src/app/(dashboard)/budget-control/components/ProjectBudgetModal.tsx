"use client"

import { useState } from "react"
import {
  X, ChevronRight, Loader2, Building2, Home, AlertTriangle,
  Wallet, Coins, HardHat, Tag, ChevronDown, Check, Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail } from "@/hooks/use-budget"
import type { CostAccount, CostCategory, CostVendor, PODetail, VendorBackCharge } from "@/services/budget.service"
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
      {/* Visual layer — overflow-hidden keeps rounding clean */}
      <div className="absolute inset-0 flex overflow-hidden rounded-full bg-muted/30">
        {segments.map((s, i) => {
          const w = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0
          return (
            <div key={`v${i}`} className="flex h-full items-center justify-center transition-all" style={{ width: `${w}%`, backgroundColor: s.color }}>
              {s.icon && w > 10 && <s.icon className="h-3 w-3 text-white/80" />}
            </div>
          )
        })}
      </div>
      {/* Interaction layer — no overflow clip so tooltips escape upward */}
      <div className="absolute inset-0 flex">
        {segments.map((s, i) => {
          const w = total > 0 ? (Math.max(s.value, 0) / total) * 100 : 0
          return (
            <div key={`i${i}`} className="group relative h-full" style={{ width: `${w}%` }}>
              {/* hover brightens matching visual segment via overlay */}
              <div className="absolute inset-0 rounded-sm bg-white/0 transition-colors group-hover:bg-white/15" />
              {s.label && tooltip(s.label, s.value, s.color)}
            </div>
          )
        })}
        {remainder && remainPct > 0 && (
          <div className="group relative h-full" style={{ width: `${remainPct}%` }}>
            <div className="absolute inset-0 rounded-sm bg-white/0 transition-colors group-hover:bg-white/5" />
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
    <div className="w-20 text-right">
      <span
        className={cn("tabular-nums font-semibold", sm ? "text-[10px]" : "text-[11px]", blur)}
        style={color ? { color } : undefined}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

// ── Mini donut chart ──────────────────────────────────────────────────────────

function MiniDonut({ paidPct, billedPct }: { paidPct: number; billedPct: number }) {
  const r = 5.5
  const circ = 2 * Math.PI * r
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 -rotate-90">
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" stroke="currentColor" className="text-muted-foreground/15" />
      {billedPct > 0 && (
        <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" stroke="currentColor"
          className="text-orange-400/40"
          strokeDasharray={`${(billedPct / 100) * circ} ${circ}`} />
      )}
      {paidPct > 0 && (
        <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" stroke="currentColor"
          className="text-emerald-500/80"
          strokeDasharray={`${(paidPct / 100) * circ} ${circ}`} />
      )}
    </svg>
  )
}

// ── Account row (By Account tree with expandable children) ───────────────────

function AccountRow({ ca, blur }: { ca: CostAccount; blur: string }) {
  const [open, setOpen] = useState(false)
  const hasChildren = (ca.children?.length ?? 0) > 0
  const settled = ca.outstanding === 0 && ca.amount !== 0
  return (
    <>
      <div
        className={cn(
          "flex items-center border-t border-border/10 px-3 py-1",
          hasChildren && "cursor-pointer hover:bg-muted/10",
          settled && "text-muted-foreground"
        )}
        onClick={() => hasChildren && setOpen(o => !o)}
      >
        <div className="w-4 shrink-0 mr-0.5">
          {hasChildren && (
            <ChevronRight className={cn("h-2.5 w-2.5 text-muted-foreground/30 transition-transform", open && "rotate-90")} />
          )}
        </div>
        <div className="flex flex-1 min-w-0 items-center gap-1">
          {ca.name === "Contractors" && <HardHat className={cn("h-3 w-3 shrink-0", settled ? "text-muted-foreground/60" : "text-yellow-500/70")} />}
          <span className={cn("truncate text-[11px] font-medium", settled ? "text-muted-foreground" : ca.name === "Contractors" ? "text-yellow-500/80" : "text-foreground/80")} title={ca.name}>{ca.name}</span>
          {settled && <Check className="h-3 w-3 shrink-0 text-red-500/60" />}
        </div>
        <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, !settled && ca.amount < 0 && "text-emerald-500")}>{fmt(ca.amount)}</span>
        <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur)}>{fmt(ca.paid)}</span>
        <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, !settled && ca.outstanding > 0 ? "text-orange-500" : !settled ? "text-muted-foreground/40" : "")}>{fmt(ca.outstanding)}</span>
      </div>
      {open && ca.children?.map((child, j) => {
        const settled = child.outstanding === 0
        return (
          <div key={j} className="flex items-center border-t border-border/10 bg-muted/5 px-3 py-1 pl-7">
            <div className="w-4 shrink-0 mr-0.5 flex items-center justify-center">
              <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
            </div>
            <span className={cn("flex-1 truncate text-[10px]", settled ? "text-muted-foreground/40" : "text-muted-foreground/60")} title={child.name}>{child.name}</span>
            <span className={cn("w-20 text-right text-[10px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/40" : "text-foreground/80")}>{fmt(child.amount)}</span>
            <span className={cn("w-20 text-right text-[10px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/40" : "")}>{fmt(child.paid)}</span>
            <span className={cn("w-20 text-right text-[10px] font-semibold tabular-nums", blur, child.outstanding > 0 ? "text-orange-500" : "text-muted-foreground/40")}>{fmt(child.outstanding)}</span>
          </div>
        )
      })}
    </>
  )
}

// ── Back charge row (inside vendor expansion) ─────────────────────────────────

function BackChargeRow({ backCharges, blur }: { backCharges: VendorBackCharge[]; blur: string }) {
  const [open, setOpen] = useState(false)
  const total = backCharges.reduce((s, bc) => s + bc.amount, 0)

  return (
    <div className="border-t border-border/10 first:border-t-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 py-1 pr-4 text-left pl-[68px] cursor-pointer hover:bg-muted/10"
      >
        <ChevronRight className={cn("h-2 w-2 shrink-0 -ml-4 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
        <div className="flex flex-1 min-w-0 items-center gap-1">
          <span className="shrink-0 text-[10px] text-muted-foreground/70">Back charges</span>
        </div>
        <div className="flex shrink-0 items-center">
          <div className="w-20 shrink-0" />
          <div className="w-20 shrink-0" />
          <div className="w-20 text-right">
            <span className={cn("text-[10px] font-semibold tabular-nums text-red-500", blur)}>
              -{fmt(total)}
            </span>
          </div>
          <div className="w-20 shrink-0" />
        </div>
        <div className="w-[22px] shrink-0" />
      </button>

      {open && (
        <div className="mb-1.5 ml-[68px] border-l border-border/20 pl-3 pr-4">
          {backCharges.map((bc, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 border-t border-border/10 first:border-t-0">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/70" />
              <span className="w-14 shrink-0 text-[9px] tabular-nums text-muted-foreground/80">{fmtDate(bc.date)}</span>
              <span className="flex-1 min-w-0 truncate text-[9px] text-muted-foreground/75">
                {bc.ref_number || "—"}
              </span>
              <div className="flex shrink-0 items-center">
                <div className="w-20 shrink-0" />
                <div className="w-20 shrink-0" />
                <div className="w-20 text-right">
                  <span className={cn("text-[9px] font-semibold tabular-nums text-red-500", blur)}>
                    -{fmt(bc.amount)}
                  </span>
                </div>
                <div className="w-20 shrink-0" />
              </div>
              <div className="w-[22px] shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PO row (inside vendor expansion) ─────────────────────────────────────────

function SubPORow({ po, blur }: { po: PODetail; blur: string }) {
  const [open, setOpen] = useState(false)
  const outstanding = Math.max(po.billed - po.paid, 0)
  const settled = po.committed > 0 && po.paid >= po.committed

  return (
    <div className="border-t border-border/10 first:border-t-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex w-full items-center gap-2 py-1 pr-4 text-left pl-[68px] cursor-pointer hover:bg-muted/10",
          settled && "text-muted-foreground"
        )}
      >
        <ChevronRight className={cn("h-2 w-2 shrink-0 -ml-4 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
        <div className="flex flex-1 min-w-0 items-center gap-1">
          <span className="shrink-0 text-[10px] text-muted-foreground/70">Purchase Order</span>
          <span className={cn("truncate text-[10px] font-medium", settled ? "text-muted-foreground" : "text-foreground")}>
            {po.doc_number || po.external_id}
          </span>
          {settled && <Check className="h-2.5 w-2.5 shrink-0 text-yellow-500/70" />}
        </div>
        <span className="mr-2 shrink-0 text-[9px] tabular-nums text-muted-foreground/75">{fmtDate(po.txn_date)}</span>
        <div className="flex shrink-0 items-center">
          <ValueCell value={po.committed} blur={blur} sm />
          <ValueCell value={po.billed} blur={blur} sm />
          <ValueCell value={po.paid} color={settled ? undefined : po.paid > 0 ? "#22c55e" : undefined} blur={blur} sm />
          <ValueCell value={outstanding} color={settled ? undefined : outstanding > 0 ? "#f97316" : undefined} blur={blur} sm />
        </div>
        <div className="w-[22px] shrink-0" />
      </button>

      {open && (
        <div className="mb-1.5 ml-[68px] border-l border-border/20 pl-3 pr-4">
          {po.payments.length === 0 ? (
            <div className="py-1.5 text-[10px] text-muted-foreground/60 italic">No payments recorded yet.</div>
          ) : po.payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 border-t border-border/10 first:border-t-0">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
              <span className="w-14 shrink-0 text-[9px] tabular-nums text-muted-foreground/80">{fmtDate(p.date)}</span>
              <span className="flex-1 min-w-0 truncate text-[9px] text-muted-foreground/75">
                {p.ref_number ? `Payment ${p.ref_number}` : "—"}
              </span>
              <div className="flex shrink-0 items-center">
                <div className="w-20 shrink-0" />
                <div className="w-20 shrink-0" />
                <div className="w-20 text-right">
                  <span className={cn("text-[9px] font-semibold tabular-nums text-emerald-500", blur)}>{fmt(p.amount)}</span>
                </div>
                <div className="w-20 shrink-0" />
              </div>
              <div className="w-[22px] shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Vendor row ────────────────────────────────────────────────────────────────

function VendorRow({ vendor, blur }: { vendor: CostVendor; blur: string }) {
  const [open, setOpen] = useState(false)
  const hasDetail = vendor.purchase_orders.length > 0 || (vendor.back_charges?.length ?? 0) > 0
  const bcTotal = vendor.back_charges?.reduce((s, bc) => s + bc.amount, 0) ?? 0
  const netPaid = vendor.paid - bcTotal
  const netBilled = vendor.billed - bcTotal
  const outstanding = Math.max(netBilled - netPaid, 0)
  const isSettled = vendor.committed > 0 && vendor.paid >= vendor.committed

  return (
    <div className="border-t border-border/10 first:border-t-0">
      <button
        onClick={() => hasDetail && setOpen(o => !o)}
        className={cn(
          "flex w-full items-center gap-2 py-1.5 pr-4 text-left pl-[52px]",
          hasDetail ? "cursor-pointer hover:bg-muted/10" : "cursor-default",
          isSettled && "text-muted-foreground"
        )}
      >
        {hasDetail
          ? <ChevronRight className={cn("h-2.5 w-2.5 shrink-0 -ml-4 text-muted-foreground/30 transition-transform", open && "rotate-90")} />
          : <div className="h-2.5 w-2.5 shrink-0 -ml-4" />
        }
        <div className="flex flex-1 min-w-0 items-center gap-1">
          <span className={cn("truncate text-[11px]", isSettled ? "text-muted-foreground" : "text-muted-foreground/80")}>{vendor.vendor_name || "—"}</span>
          {isSettled && <Check className="h-3 w-3 shrink-0 text-yellow-500/70" />}
        </div>
        <div className="flex shrink-0 items-center">
          <ValueCell value={vendor.committed} blur={blur} sm />
          <ValueCell value={netBilled} blur={blur} sm />
          <ValueCell value={netPaid} color={isSettled ? undefined : "#22c55e"} blur={blur} sm />
          <ValueCell value={outstanding} color={isSettled ? undefined : outstanding > 0 ? "#f97316" : undefined} blur={blur} sm />
        </div>
        <div className="w-[22px] shrink-0" />
      </button>

      {open && (
        <div className="border-t border-border/20 bg-background/20 pb-1">
          {(vendor.back_charges?.length ?? 0) > 0 && (
            <BackChargeRow backCharges={vendor.back_charges} blur={blur} />
          )}
          {vendor.purchase_orders.map(po => (
            <SubPORow key={po.external_id || po.doc_number} po={po} blur={blur} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({ cat, blur, isOpen, onToggle }: { cat: CostCategory; blur: string; isOpen: boolean; onToggle: () => void }) {
  const isUncategorized = !cat.category_id
  const bcTotal = cat.vendors.reduce((s, v) => s + (v.back_charges?.reduce((s2, bc) => s2 + bc.amount, 0) ?? 0), 0)
  const netPaid = cat.paid - bcTotal
  const netBilled = cat.billed - bcTotal
  const outstanding = Math.max(netBilled - netPaid, 0)
  const isSettled = cat.committed > 0 && cat.paid >= cat.committed
  const isNoPO = cat.committed === 0
  const isOverbilled = cat.committed > 0 && netBilled > cat.committed
  const isOverBudget = cat.budget_limit > 0 && cat.committed > cat.budget_limit

  const billedPct = cat.committed > 0 ? Math.min((netBilled / cat.committed) * 100, 100) : 0
  const paidPct = cat.committed > 0 ? Math.min((netPaid / cat.committed) * 100, 100) : 0

  return (
    <div className={cn("border-b border-border/30 last:border-b-0", isUncategorized && "opacity-60")}>
      <button
        onClick={onToggle}
        className={cn("flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-muted/10", isSettled && "text-muted-foreground")}
      >
        {/* Icon */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/30">
          <CategoryIcon name={cat.icon} className="h-3 w-3 text-muted-foreground/70" />
        </div>

        {/* Name + badges */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={cn("min-w-0 truncate text-[11px] font-semibold", isSettled && "text-muted-foreground")}>{cat.category_name}</span>
          {isSettled && <Check className="h-3 w-3 shrink-0 text-yellow-500/70" />}
          {isNoPO && <span className="shrink-0 rounded-full bg-muted/40 px-1.5 py-px text-[9px] font-medium text-muted-foreground/50">no PO</span>}
          {!isNoPO && isOverBudget && <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-amber-500">over bdgt</span>}
          {!isNoPO && !isOverBudget && isOverbilled && <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-orange-500">overbilled</span>}
        </div>

        {/* Donut + % label — fixed slot */}
        <div className="flex w-20 shrink-0 items-center justify-end gap-1.5 pr-2">
          {!isNoPO && (
            <>
              <span className={cn("text-[9px] tabular-nums", !isSettled && "text-muted-foreground/60")}>
                {Math.round(paidPct)}%
              </span>
              <MiniDonut paidPct={paidPct} billedPct={billedPct} />
            </>
          )}
        </div>

        {/* 4 value columns */}
        <div className="flex shrink-0 items-center">
          <ValueCell value={cat.committed} blur={blur} />
          <ValueCell value={netBilled} blur={blur} />
          <ValueCell value={netPaid} color={isSettled ? undefined : "#22c55e"} blur={blur} />
          <ValueCell value={outstanding} color={isSettled ? undefined : outstanding > 0 ? "#f97316" : undefined} blur={blur} />
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
    (acc, c) => {
      const bcTotal = c.vendors.reduce((s, v) => s + (v.back_charges?.reduce((s2, bc) => s2 + bc.amount, 0) ?? 0), 0)
      return { committed: acc.committed + c.committed, billed: acc.billed + c.billed, paid: acc.paid + c.paid, open: acc.open + c.open, backCharges: acc.backCharges + bcTotal }
    },
    { committed: 0, billed: 0, paid: 0, open: 0, backCharges: 0 }
  )
  const catNetPaid = catTotals.paid - catTotals.backCharges
  const catNetBilled = catTotals.billed - catTotals.backCharges
  const catNetOpen = catTotals.open + catTotals.backCharges

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[92vh] w-[min(1200px,96vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
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
          {data && (() => {
            const profit = data.income_actual - data.cost_total
            const marginPct = data.income_actual > 0 ? Math.round((profit / data.income_actual) * 100) : 0
            const positive = profit >= 0
            return (
              <div className="ml-auto flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Profit Margin</span>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-sm font-bold tabular-nums", positive ? "text-primary" : "text-destructive", blur)}>{fmt(profit)}</span>
                  <span className={cn("text-sm font-bold tabular-nums", positive ? "text-primary" : "text-destructive", blur)}>{marginPct}%</span>
                </div>
              </div>
            )
          })()}
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
            <div className="grid gap-4 grid-cols-[2fr_3fr]">

              {/* ── Left col: Income + Cost stacked ────────────────────────── */}
              <div className="flex flex-col gap-4">

                {/* INCOME */}
                <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
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
                    remainder={{ label: "Remaining", value: Math.max(data.projected_receive - data.income_actual, 0) }}
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
                                <div key={h} className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{h}</div>
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
                                  <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", settled ? "text-muted-foreground/50" : "text-foreground/80", blur)}>
                                    {fmt(ia.amount)}
                                  </span>
                                  <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", settled ? "text-muted-foreground/50" : "text-foreground/80", blur)}>
                                    {fmt(receivedForType)}
                                  </span>
                                  <span className={cn("w-20 text-right text-[11px] font-semibold tabular-nums", blur, settled ? "text-muted-foreground/50" : "text-orange-500")}>
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
                <div className={cn("flex flex-col gap-3 rounded-xl border p-4",
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
                    remainder={{ label: "Remaining", value: Math.max(data.cost_ceiling - data.cost_total, 0) }}
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
                            <div className="w-4 shrink-0 mr-0.5" />
                            <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Account</span>
                            <div className="flex shrink-0">
                              <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Billed</div>
                              <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Paid</div>
                              <div className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">Outstanding</div>
                            </div>
                          </div>
                          {costAccounts.map((ca, i) => (
                            <AccountRow key={i} ca={ca} blur={blur} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right col: Subcontractor Costs ───────────────────────────── */}
              <div className="self-start flex flex-col gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.04] p-4">

                {/* Title row */}
                <div className="flex items-center gap-2">
                  <HardHat className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-semibold text-yellow-500">Contractors Costs</span>
                  <div className="ml-auto flex items-baseline gap-1.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                    <span className={cn("text-base font-bold tabular-nums text-yellow-500", blur)}>{fmt(catNetBilled)}</span>
                  </div>
                </div>

                {/* SegBar */}
                <SegBar
                  total={Math.max(catTotals.committed, 1)}
                  segments={[
                    { value: catNetPaid, color: "#eab308", label: "Paid", icon: Check },
                    { value: Math.max(catNetBilled - catNetPaid, 0), color: "#f97316", label: "Outstanding", icon: Clock },
                  ]}
                  remainder={{ label: "Remaining", value: Math.max(catTotals.committed - catNetBilled, 0) }}
                />

                {/* KPI grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Paid</span>
                    <span className={cn("text-lg font-bold tabular-nums text-yellow-500", blur)}>{fmt(catNetPaid)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Outstanding</span>
                    <span className={cn("text-lg font-bold tabular-nums", (catNetBilled - catNetPaid) > 0 ? "text-orange-500" : "text-muted-foreground/50", blur)}>{fmt(Math.max(catNetBilled - catNetPaid, 0))}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Total</span>
                    <span className={cn("text-lg font-bold tabular-nums", blur)}>{fmt(catTotals.committed)}</span>
                  </div>
                </div>

                {/* Category list — always visible */}
                <div className="overflow-hidden rounded-lg border border-yellow-500/20">
                  {/* Column header */}
                  <div className="flex items-center border-b border-yellow-500/20 bg-muted/10 px-4 py-1">
                    <div className="h-6 w-6 shrink-0" />
                    <div className="min-w-0 flex-1 pl-3 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">Category</div>
                    {(["Contracted", "Billed", "Paid", "Outstanding"] as const).map(lbl => (
                      <div key={lbl} className="w-20 text-right text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">{lbl}</div>
                    ))}
                    <div className="w-[22px] shrink-0" />
                  </div>
                  {costCategories.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-[11px] italic text-muted-foreground/40">
                      No categories assigned yet.
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
