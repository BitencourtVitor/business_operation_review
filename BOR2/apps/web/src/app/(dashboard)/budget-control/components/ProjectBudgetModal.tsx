"use client"

import { useState } from "react"
import {
  X, ChevronRight, Loader2, Building2, Home, AlertTriangle,
  Wallet, Coins, HardHat,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { useBudgetDetail } from "@/hooks/use-budget"
import type { CostAccount, PORow } from "@/services/budget.service"

// Exact money with cents (the modal is the precision view).
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (s: string) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
const pctStr = (part: number, whole: number) => `${pct(part, whole).toFixed(0)}%`

const GROUP_LABEL: Record<string, string> = {
  "Cost of Goods Sold": "Cost of Goods Sold",
  "Expense": "Expense",
  "Other": "Other",
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

// One category row inside a partition (signed amount).
function CatRow({ name, amount, blur }: { name: string; amount: number; blur: string }) {
  const neg = amount < 0
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="truncate text-[11px] text-muted-foreground" title={name}>{name}</span>
      <span className={cn("ml-auto shrink-0 text-xs font-semibold tabular-nums", blur)}
        style={neg ? { color: "#22c55e" } : undefined}>
        {fmt(amount)}
      </span>
    </div>
  )
}

// A cost account row with nested sub-accounts (QB rolls children under parents).
function AccountRow({ node, blur, depth = 0 }: { node: CostAccount; blur: string; depth?: number }) {
  const neg = node.amount < 0
  const hasKids = !!node.children?.length
  return (
    <>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: 4 + depth * 14 }}>
        <span className={cn("truncate text-[11px]", depth === 0 ? "text-foreground" : "text-muted-foreground")} title={node.name}>
          {node.name}
        </span>
        <span className={cn("ml-auto shrink-0 text-xs font-semibold tabular-nums", blur)}
          style={neg ? { color: "#22c55e" } : undefined}>
          {fmt(node.amount)}
        </span>
      </div>
      {hasKids && node.children!.map(c => <AccountRow key={c.name} node={c} blur={blur} depth={depth + 1} />)}
    </>
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
        <span className={`w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums ${blur}`}>{fmt(po.committed)}</span>
      </button>
      {open && (
        <div className="divide-y divide-border/20 border-t border-border/30 bg-background/40">
          {po.lines.map((l, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 pl-8">
              <span className="flex-1 whitespace-pre-line text-[10px] leading-tight text-muted-foreground">{l.description || "—"}</span>
              <div className="flex shrink-0 items-center gap-3 text-[10px] tabular-nums">
                <span className={`w-20 text-right font-semibold ${blur}`}>{fmt(l.amount)}</span>
                <span className={`w-20 text-right text-muted-foreground ${blur}`} title="Billed">{fmt(l.received)}</span>
                <span className={`w-20 text-right ${blur}`} style={l.open > 0 ? { color: "#f59e0b" } : { color: "var(--muted-foreground)" }} title="Open">
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

// ── Modal ─────────────────────────────────────────────────────────────────────

export function ProjectBudgetModal({ company, projectID, onClose }: {
  company: string; projectID: string; onClose: () => void
}) {
  const { data, isLoading } = useBudgetDetail({ company, project_id: projectID })
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const overCeiling = !!data && data.cost_ceiling > 0 && data.cost_total > data.cost_ceiling

  // Group cost accounts by their account-type group, preserving server order.
  const costGroups: { group: string; rows: CostAccount[]; subtotal: number }[] = []
  if (data) {
    for (const ca of (data.cost_accounts ?? [])) {
      let g = costGroups.find(x => x.group === ca.group)
      if (!g) { g = { group: ca.group, rows: [], subtotal: 0 }; costGroups.push(g) }
      g.rows.push(ca)
      g.subtotal += ca.amount
    }
  }
  const incomeAccounts = data?.income_accounts ?? []
  const purchaseOrders = data?.purchase_orders ?? []

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

              {/* ── A Receber / A Pagar ──────────────────────────────────────── */}
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">

                {/* INCOME — A Receber */}
                <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-500">A Receber · Income</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pctStr(data.received, data.projected_receive)} received
                    </span>
                  </div>
                  <SegBar total={Math.max(data.income_actual, data.projected_receive)} segments={[
                    { value: data.received, color: "#22c55e" },
                    { value: data.to_receive, color: "#f59e0b" },
                  ]} />
                  <div className="flex flex-col gap-1.5">
                    <Line label="Estimated (contract)" value={data.projected_receive} blur={blur} />
                    <Line label="Income (actual)" value={data.income_actual} blur={blur} strong pctOf={data.projected_receive} />
                    <Line label="Received" value={data.received} color="#22c55e" dot="#22c55e" blur={blur} />
                    <Line label="To receive (open)" value={data.to_receive} dot="#f59e0b" blur={blur} />
                  </div>
                  {/* Income categories */}
                  <div className="mt-1 border-t border-border/40 pt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Categories</p>
                    {incomeAccounts.length === 0
                      ? <p className="px-1 py-1 text-[11px] italic text-muted-foreground/50">No income recorded.</p>
                      : incomeAccounts.map(ia => <CatRow key={ia.name} name={ia.name} amount={ia.amount} blur={blur} />)}
                  </div>
                </div>

                {/* COST — A Pagar */}
                <div className={cn("flex flex-col gap-3 rounded-xl border p-4",
                  overCeiling ? "border-red-500/30 bg-red-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.03]")}>
                  <div className="flex items-center gap-2">
                    <Coins className={cn("h-4 w-4", overCeiling ? "text-red-500" : "text-amber-500")} />
                    <span className={cn("text-sm font-semibold", overCeiling ? "text-red-500" : "text-amber-500")}>A Pagar · Cost</span>
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
                  {/* Cost categories grouped by account type */}
                  <div className="mt-1 flex flex-col gap-2 border-t border-border/40 pt-2">
                    {costGroups.length === 0 && (
                      <p className="px-1 py-1 text-[11px] italic text-muted-foreground/50">No cost recorded.</p>
                    )}
                    {costGroups.map(g => (
                      <div key={g.group} className="flex flex-col">
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            {GROUP_LABEL[g.group] ?? g.group}
                          </span>
                          <span className={`ml-auto text-[11px] font-bold tabular-nums text-muted-foreground ${blur}`}>{fmt(g.subtotal)}</span>
                        </div>
                        {g.rows.map(r => <AccountRow key={r.name} node={r} blur={blur} />)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Purchase Orders ──────────────────────────────────────────── */}
              <div className="flex flex-col rounded-xl border border-border bg-muted/10">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <HardHat className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-500">Purchase Orders ({purchaseOrders.length})</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] tabular-nums text-muted-foreground">
                    <span className={blur}>Committed {fmt(data.labor_committed)}</span>
                    <span className={blur}>Billed {fmt(data.labor_billed)}</span>
                    <span className={blur} style={data.labor_open > 0 ? { color: "#f59e0b" } : undefined}>Open {fmt(data.labor_open)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {purchaseOrders.length === 0 ? (
                    <p className="py-4 text-center text-[11px] italic text-muted-foreground/50">No purchase orders.</p>
                  ) : (
                    purchaseOrders.map(po => <POCard key={po.external_id} po={po} blur={blur} />)
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
