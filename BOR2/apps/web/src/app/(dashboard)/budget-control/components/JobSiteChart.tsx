"use client"

import { useMemo, useRef, useState } from "react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, LabelList,
} from "recharts"
import { Users, Layers, CircleCheck, Clock, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import type { BudgetProjectDetail } from "@/services/budget.service"

// ── Constants ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const RECEIVE      = "#22c55e"
const RECEIVE_PEND = "#86efac"
const PAY          = "#ef4444"
const PAY_PEND     = "#fca5a5"
const MAX_ITEMS    = 80
const PER_ITEM     = 132

type Mode = "all" | "actual" | "outstanding"

const MODES: { value: Mode; label: string; Icon: React.ElementType }[] = [
  { value: "all",         label: "All",         Icon: Layers      },
  { value: "actual",      label: "Actual",      Icon: CircleCheck },
  { value: "outstanding", label: "Outstanding", Icon: Clock       },
]

// ── Data types ────────────────────────────────────────────────────────────────

type Agg = {
  name: string
  invoiced: number
  remainingIncome: number
  billed: number
  remainingCost: number
}

type Row = {
  name: string
  execReceivable: number
  pendReceivable: number
  execPayable: number
  pendPayable: number
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, mode }: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  mode: Mode
}) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload

  const totalRec  = r.execReceivable + r.pendReceivable
  const totalPay  = r.execPayable    + r.pendPayable
  const profit    = totalRec - totalPay
  const marginPct = totalRec > 0 ? (profit / totalRec) * 100 : 0
  const profitColor = marginPct >= 30 ? "var(--primary)" : marginPct > 0 ? "#f59e0b" : "#ef4444"

  const showRec = mode === "actual" ? r.execReceivable : mode === "outstanding" ? r.pendReceivable : totalRec
  const showPay = mode === "actual" ? r.execPayable    : mode === "outstanding" ? r.pendPayable    : totalPay
  const recLabel = mode === "actual" ? "Received" : mode === "outstanding" ? "Outstanding" : "Income"
  const payLabel = mode === "actual" ? "Paid"     : mode === "outstanding" ? "Outstanding" : "Cost"

  return (
    <div className="w-max max-w-[220px] rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 break-words font-semibold leading-snug">{r.name}</p>

      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RECEIVE }} />
          {recLabel}
        </span>
        <span className="font-semibold tabular-nums" style={{ color: RECEIVE }}>{fmt(showRec)}</span>
      </div>
      {mode === "all" && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground/80">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RECEIVE }} /> Received
            </span>
            <span className="tabular-nums">{fmt(r.execReceivable)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RECEIVE_PEND }} /> Outstanding
            </span>
            <span className="tabular-nums">{fmt(r.pendReceivable)}</span>
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PAY }} />
          {payLabel}
        </span>
        <span className="font-semibold tabular-nums" style={{ color: PAY }}>{fmt(showPay)}</span>
      </div>
      {mode === "all" && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground/80">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PAY }} /> Paid
            </span>
            <span className="tabular-nums">{fmt(r.execPayable)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PAY_PEND }} /> Outstanding
            </span>
            <span className="tabular-nums">{fmt(r.pendPayable)}</span>
          </div>
        </div>
      )}

      {mode !== "outstanding" && (
        <>
          <div className="my-1.5 border-t border-border/50" />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
            <span className="text-muted-foreground">Profit</span>
            <span className="font-bold tabular-nums" style={{ color: profitColor }}>
              {fmt(profit)} <span className="font-semibold opacity-70">({marginPct.toFixed(0)}%)</span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── X-axis tick ───────────────────────────────────────────────────────────────

function wrapLabel(s: string, max = 20, maxLines = 3): string[] {
  const words = s.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w }
    else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.{1}$/, "…")
    return kept
  }
  return lines
}

function XTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const lines = wrapLabel(String(payload?.value ?? ""))
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((ln, i) => (
        <text key={i} x={0} y={0} dy={11 + i * 10} textAnchor="middle" fill="#666" fontSize={9}>
          {ln}
        </text>
      ))}
    </g>
  )
}

// ── Margin labels ─────────────────────────────────────────────────────────────

// Label always on execReceivable (always has height when customer has income).
// In "all" mode the pending bar may be zero-height so Recharts skips its LabelList;
// instead we compute the pending bar's pixel height from the exec bar's scale ratio
// and offset y upward to land above the full stack.
function makeMarginLabel(data: Row[], show: boolean, mode: Mode) {
  return function MarginLabel(props: any) {
    if (!show || mode === "outstanding") return <g />
    const { x, y, width, height, index } = props
    const row = data[index]
    if (!row) return <g />

    let rec: number, pay: number, labelY: number

    if (mode === "actual") {
      rec    = row.execReceivable
      pay    = row.execPayable
      labelY = y - 5
    } else {
      // "all" mode: offset y by pend bar height (derived from exec scale)
      const pendH = row.execReceivable > 0
        ? (row.pendReceivable / row.execReceivable) * height
        : 0
      rec    = row.execReceivable + row.pendReceivable
      pay    = row.execPayable    + row.pendPayable
      labelY = y - pendH - 5
    }

    if (!rec) return <g />
    const margin = ((rec - pay) / rec) * 100
    const color  = margin >= 30 ? "var(--primary)" : margin > 0 ? "#f59e0b" : "#ef4444"
    return (
      <g>
        <text x={x + width + 2} y={labelY} textAnchor="middle" fontSize={10} fontWeight={700}
          style={{ fill: color, stroke: "var(--background)", strokeWidth: 3, paintOrder: "stroke" }}>
          {margin.toFixed(0)}%
        </text>
      </g>
    )
  }
}

// ── Chart ─────────────────────────────────────────────────────────────────────

export function JobSiteChart({ projects, selectedCustomers, forceExploded, onSelectCustomer, onOpenProject, collapsed, onToggleCollapsed }: {
  projects: BudgetProjectDetail[]
  selectedCustomers?: Set<string>
  /** true when "group by jobsite" is off — always show per-project bars, even with no customer selected. */
  forceExploded?: boolean
  /** Bar click in grouped mode: user picked a jobsite bar — select that customer. */
  onSelectCustomer?: (name: string) => void
  /** Bar click in exploded mode: user picked a project bar — open its detail. */
  onOpenProject?: (name: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const { showFinancialData } = useFinancialStore()
  const [mode, setMode] = useState<Mode>("actual")
  const hasCustomerSelection = (selectedCustomers?.size ?? 0) > 0
  const exploded = !!forceExploded || hasCustomerSelection

  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false })
  const onDragStart = (e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    drag.current = { active: true, startX: e.pageX, startLeft: el.scrollLeft, moved: false }
  }
  const onDragMove = (e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!drag.current.active || !el) return
    const dx = e.pageX - drag.current.startX
    if (Math.abs(dx) > 3) drag.current.moved = true
    el.scrollLeft = drag.current.startLeft - dx
  }
  const onDragEnd = () => { drag.current.active = false }

  // Selecting one or more customers scopes the chart to just their projects
  // (independent of forceExploded, which only changes the grouping key below).
  const scoped = useMemo(
    () => hasCustomerSelection ? projects.filter(p => selectedCustomers!.has(p.customer_group || p.name)) : projects,
    [projects, hasCustomerSelection, selectedCustomers])

  const aggregated = useMemo<Agg[]>(() => {
    const agg = new Map<string, Agg>()
    for (const p of scoped) {
      const name = exploded ? p.name : (p.customer_group || p.name)
      const row = agg.get(name) ?? { name, invoiced: 0, remainingIncome: 0, billed: 0, remainingCost: 0 }
      row.invoiced        += p.received + p.to_receive
      row.billed          += p.paid + p.open_payable
      row.remainingIncome += p.to_receive
      row.remainingCost   += p.to_pay
      agg.set(name, row)
    }
    return [...agg.values()]
  }, [scoped, exploded])

  // Base data — all 4 values always present, sorted by total.
  const data = useMemo<Row[]>(() => aggregated
    .map(a => ({
      name:           a.name,
      execReceivable: a.invoiced,
      pendReceivable: a.remainingIncome,
      execPayable:    a.billed,
      pendPayable:    a.remainingCost,
    }))
    .filter(r => (r.execReceivable + r.pendReceivable) > 0 || (r.execPayable + r.pendPayable) > 0)
    .sort((a, b) =>
      (b.execReceivable + b.pendReceivable + b.execPayable + b.pendPayable) -
      (a.execReceivable + a.pendReceivable + a.execPayable + a.pendPayable),
    )
    .slice(0, MAX_ITEMS),
  [aggregated])

  // Display data — zeroes out the portion not relevant to the current mode.
  // This lets us always render the same 4 Bar components with stackId without
  // conditional rendering; zero-height bars within a stack take no extra space.
  const displayData = useMemo<Row[]>(() => data.map(r => ({
    name:           r.name,
    execReceivable: mode === "outstanding"  ? 0 : r.execReceivable,
    pendReceivable: mode === "actual" ? 0 : r.pendReceivable,
    execPayable:    mode === "outstanding"  ? 0 : r.execPayable,
    pendPayable:    mode === "actual" ? 0 : r.pendPayable,
  })), [data, mode])

  const marginLabel = useMemo(() => makeMarginLabel(data, showFinancialData, mode), [data, showFinancialData, mode])

  const profitTotals = useMemo(() => {
    let rec = 0, pay = 0
    for (const r of data) {
      rec += mode === "outstanding"  ? r.pendReceivable
           : mode === "actual" ? r.execReceivable
           : r.execReceivable + r.pendReceivable
      pay += mode === "outstanding"  ? r.pendPayable
           : mode === "actual" ? r.execPayable
           : r.execPayable + r.pendPayable
    }
    const profit = rec - pay
    const pct    = rec > 0 ? (profit / rec) * 100 : 0
    const color  = pct >= 30 ? "var(--primary)" : pct > 0 ? "#f59e0b" : "#ef4444"
    return { profit, pct, color }
  }, [data, mode])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-card/70">

      {/* Header */}
      <div className={cn("flex shrink-0 items-center gap-3 px-4 py-2.5", !collapsed && "border-b border-border/40")}>
        <div className="flex items-center gap-2">
          {onToggleCollapsed && (
            <button onClick={onToggleCollapsed} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          <span className="text-sm font-semibold">Receivable vs Payable</span>
          <span className="h-3.5 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground">
            {exploded ? "by Project" : "by Customer"}
          </span>
        </div>
        {!collapsed && <div className="ml-auto flex items-center gap-3">

          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {mode !== "outstanding" && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RECEIVE }} />
                Received
              </span>
            )}
            {mode !== "actual" && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RECEIVE_PEND }} />
                {mode === "all" ? "Outstanding Income" : "Outstanding"}
              </span>
            )}
            {mode === "all" && <span className="h-3 w-px bg-border/60" />}
            {mode !== "outstanding" && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PAY }} />
                Paid
              </span>
            )}
            {mode !== "actual" && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PAY_PEND }} />
                {mode === "all" ? "Outstanding Cost" : "Outstanding"}
              </span>
            )}
            {mode !== "outstanding" && showFinancialData && (
              <>
                <span className="h-3 w-px bg-border/60" />
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center gap-0.5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                  </span>
                  Profit
                </span>
              </>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
            {MODES.map(({ value, label, Icon }) => (
              <button key={value} onClick={() => setMode(value)}
                className={cn(
                  "flex h-full items-center gap-1.5 px-2.5 text-[11px] font-medium transition-colors",
                  mode === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}>
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>
        </div>}
      </div>

      {/* Chart */}
      {!collapsed && <div
        ref={scrollRef}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        className={cn(
          "min-h-0 flex-1 overflow-x-auto overflow-y-hidden [&_.recharts-surface]:outline-none",
          data.length > 0 && "cursor-grab select-none active:cursor-grabbing [&_.recharts-wrapper]:!cursor-grab active:[&_.recharts-wrapper]:!cursor-grabbing",
        )}
      >
        {data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground/60">
            <Users className="h-7 w-7" />
            <p className="text-xs">No data to display.</p>
          </div>
        ) : (
          <div className="h-full p-3" style={{ width: data.length * PER_ITEM, minWidth: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayData}
                margin={{ top: 16, right: 12, left: 0, bottom: 0 }}
                barGap={4}
                barCategoryGap="22%"
                className={cn((onSelectCustomer || onOpenProject) && "[&_.recharts-bar-rectangle]:cursor-pointer")}
                onClick={(state: any) => {
                  if (drag.current.moved) return
                  const name = state?.activeLabel
                  if (!name) return
                  if (exploded) onOpenProject?.(name)
                  else onSelectCustomer?.(name)
                }}
              >
                <defs>
                  <linearGradient id="jsExecRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={RECEIVE}      stopOpacity={1}   />
                    <stop offset="100%" stopColor={RECEIVE}      stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="jsPendRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={RECEIVE_PEND} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={RECEIVE_PEND} stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="jsExecPay" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={PAY}          stopOpacity={1}   />
                    <stop offset="100%" stopColor={PAY}          stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="jsPendPay" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={PAY_PEND}     stopOpacity={0.9} />
                    <stop offset="100%" stopColor={PAY_PEND}     stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="name" interval={0} tick={<XTick />} height={48} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={showFinancialData ? 52 : 16}
                  tickFormatter={showFinancialData ? fmtShort : () => ""}
                />
                <RechartsTooltip
                  content={<ChartTooltip mode={mode} />}
                  cursor={{ fill: "currentColor", opacity: 0.06 }}
                />

                {/* Receivable stack — exec at bottom, pending on top */}
                <Bar dataKey="execReceivable" stackId="rec"
                  fill="url(#jsExecRec)" stroke={RECEIVE} strokeWidth={1} maxBarSize={40}
                  radius={[3, 3, 3, 3]}>
                  <LabelList content={marginLabel} />
                </Bar>
                <Bar dataKey="pendReceivable" stackId="rec"
                  fill="url(#jsPendRec)" stroke={RECEIVE_PEND} strokeWidth={1} maxBarSize={40}
                  radius={[3, 3, 3, 3]} />

                {/* Payable stack — exec at bottom, pending on top */}
                <Bar dataKey="execPayable" stackId="pay"
                  fill="url(#jsExecPay)" stroke={PAY} strokeWidth={1} maxBarSize={40}
                  radius={[3, 3, 3, 3]} />
                <Bar dataKey="pendPayable" stackId="pay"
                  fill="url(#jsPendPay)" stroke={PAY_PEND} strokeWidth={1} maxBarSize={40}
                  radius={[3, 3, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>}
    </div>
  )
}
