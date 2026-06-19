"use client"

import { useMemo, useRef, useState } from "react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, LabelList,
} from "recharts"
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import type { BudgetProjectDetail } from "@/services/budget.service"

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const RECEIVE = "#22c55e"
const PAY     = "#ef4444"
const MAX_ITEMS = 80
const PER_ITEM  = 132

type Mode = "executed" | "pending"

const LABELS: Record<Mode, { receivable: string; payable: string }> = {
  executed: { receivable: "Invoiced",         payable: "Billed" },
  pending:  { receivable: "Remaining Income", payable: "Remaining Cost" },
}

type Agg = { name: string; invoiced: number; remainingIncome: number; billed: number; remainingCost: number }
type Row = { name: string; receivable: number; payable: number }

function ChartTooltip({ active, payload, labels }: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  labels?: { receivable: string; payable: string }
}) {
  if (!active || !payload?.length || !labels) return null
  const r = payload[0].payload
  const profit = r.receivable - r.payable
  const marginPct = r.receivable > 0 ? (profit / r.receivable) * 100 : 0
  const profitColor = marginPct >= 30 ? "var(--primary)" : marginPct > 0 ? "#f59e0b" : "#ef4444"
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold">{r.name}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RECEIVE }} /> {labels.receivable}
        </span>
        <span className="font-semibold tabular-nums" style={{ color: RECEIVE }}>{fmt(r.receivable)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PAY }} /> {labels.payable}
        </span>
        <span className="font-semibold tabular-nums" style={{ color: PAY }}>{fmt(r.payable)}</span>
      </div>
      <div className="my-1.5 border-t border-border/50" />
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Profit</span>
        <span className="font-bold tabular-nums" style={{ color: profitColor }}>
          {fmt(profit)} <span className="font-semibold opacity-70">({marginPct.toFixed(0)}%)</span>
        </span>
      </div>
    </div>
  )
}

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

// Factory returns a LabelList content component that renders the margin %
// centered between the receivable and payable bars.
// Both bars have the same width; barGap=4 → midpoint of gap = x + barWidth + 2,
// which is also the exact midpoint between the two bar centers.
function makeMarginLabel(data: Row[], show: boolean) {
  return function MarginLabel(props: any) {
    if (!show) return <g />
    const { x, y, width, index } = props
    const row = data[index]
    if (!row?.receivable) return <g />
    const margin = ((row.receivable - row.payable) / row.receivable) * 100
    const midX = x + width + 2
    const color = margin >= 30 ? "var(--primary)" : margin > 0 ? "#f59e0b" : "#ef4444"
    return (
      <g>
        <text x={midX} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={700}
          style={{ fill: color, stroke: "hsl(var(--background))", strokeWidth: 3, paintOrder: "stroke" }}>
          {margin.toFixed(0)}%
        </text>
      </g>
    )
  }
}

export function JobSiteChart({ projects }: {
  projects: BudgetProjectDetail[]
}) {
  const { showFinancialData } = useFinancialStore()
  const [mode, setMode] = useState<Mode>("executed")

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

  const aggregated = useMemo<Agg[]>(() => {
    // Group by QB "Customer name" (the project's immediate parent in the
    // hierarchy), mirroring the QuickBooks Project Status report — many
    // projects roll up under one customer. No catalog mapping needed.
    const agg = new Map<string, Agg>()
    for (const p of projects) {
      const name = p.customer_group || p.name
      const row = agg.get(name) ?? {
        name,
        invoiced: 0, remainingIncome: 0, billed: 0, remainingCost: 0,
      }
      row.invoiced        += p.received + p.to_receive
      row.billed          += p.paid + p.open_payable
      row.remainingIncome += p.to_receive
      row.remainingCost   += p.to_pay
      agg.set(name, row)
    }
    return [...agg.values()]
  }, [projects])

  const data = useMemo<Row[]>(() => aggregated
    .map(a => ({
      name: a.name,
      receivable: mode === "executed" ? a.invoiced : a.remainingIncome,
      payable:    mode === "executed" ? a.billed   : a.remainingCost,
    }))
    .filter(r => r.receivable > 0 || r.payable > 0)
    .sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable))
    .slice(0, MAX_ITEMS),
  [aggregated, mode])

  const labels = LABELS[mode]
  const marginLabel = useMemo(() => makeMarginLabel(data, showFinancialData), [data, showFinancialData])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-card/70">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Receivable vs Payable</span>
          <span className="h-3.5 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground">by Customer</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RECEIVE }} /> {labels.receivable}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PAY }} /> {labels.payable}
            </span>
          </div>
          <div className="flex h-7 items-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30">
            {([
              { value: "executed", label: "Executed" },
              { value: "pending",  label: "Pending" },
            ] as const).map(({ value, label }) => (
              <button key={value} onClick={() => setMode(value)}
                className={cn("flex h-full items-center px-2.5 text-[11px] font-medium transition-colors",
                  mode === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        className={cn("min-h-0 flex-1 overflow-x-auto overflow-y-hidden [&_.recharts-surface]:outline-none",
          data.length > 0 && "cursor-grab select-none active:cursor-grabbing [&_.recharts-wrapper]:!cursor-grab active:[&_.recharts-wrapper]:!cursor-grabbing")}
      >
        {data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground/60">
            <Users className="h-7 w-7" />
            <p className="text-xs">No data to display.</p>
          </div>
        ) : (
          <div className="h-full p-3" style={{ width: data.length * PER_ITEM, minWidth: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} barGap={4} barCategoryGap="22%">
              <defs>
                <linearGradient id="jsReceivable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={RECEIVE} stopOpacity={1} />
                  <stop offset="100%" stopColor={RECEIVE} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="jsPayable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={PAY} stopOpacity={1} />
                  <stop offset="100%" stopColor={PAY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                tick={<XTick />}
                height={48}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={showFinancialData ? 52 : 16}
                tickFormatter={showFinancialData ? fmtShort : () => ""}
              />
              <RechartsTooltip content={<ChartTooltip labels={labels} />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
              <Bar dataKey="receivable" name={labels.receivable} fill="url(#jsReceivable)" stroke={RECEIVE} strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={40}>
                <LabelList content={marginLabel} />
              </Bar>
              <Bar dataKey="payable" name={labels.payable} fill="url(#jsPayable)" stroke={PAY} strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
