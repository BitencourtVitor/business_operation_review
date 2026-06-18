"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"
import { Loader2, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"
import { budgetMappingService } from "@/services/budget-mapping.service"
import { clientsCatalogService } from "@/services/clients.service"
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
const MAX_ITEMS = 80    // cap so we don't render thousands of bars
const PER_ITEM  = 54    // px of horizontal room per job site (drives X scroll)

type Mode = "executed" | "pending"

const LABELS: Record<Mode, { receivable: string; payable: string }> = {
  executed: { receivable: "Invoiced",         payable: "Billed" },
  pending:  { receivable: "Remaining Income", payable: "Remaining Cost" },
}

// Raw per-job-site aggregation; the active mode picks which pair to plot.
type Agg = { name: string; invoiced: number; remainingIncome: number; billed: number; remainingCost: number }
type Row = { name: string; receivable: number; payable: number }

function ChartTooltip({ active, payload, labels }: {
  active?: boolean
  payload?: Array<{ payload: Row }>
  labels?: { receivable: string; payable: string }
}) {
  if (!active || !payload?.length || !labels) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{r.name}</p>
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
    </div>
  )
}

export function JobSiteChart({ projects, company }: {
  projects: BudgetProjectDetail[]; company: string
}) {
  const { showFinancialData } = useFinancialStore()
  const [mode, setMode] = useState<Mode>("executed")

  const { data: mappings, isLoading: mapLoading } = useQuery({
    queryKey: ["budget-mappings", company],
    queryFn: () => budgetMappingService.list(company),
    enabled: !!company,
  })
  const { data: jobSites, isLoading: siteLoading } = useQuery({
    queryKey: ["job-sites"],
    queryFn: () => clientsCatalogService.listJobSites(),
  })

  const aggregated = useMemo<Agg[]>(() => {
    const siteName = new Map((jobSites ?? []).map(j => [j.id, j.name]))
    const siteOf   = new Map((mappings ?? [])
      .filter(m => m.job_site_id != null)
      .map(m => [m.customer_id, m.job_site_id as number]))

    // Job sites come from Manage > Project Assignment: a customer assigned to a
    // catalog job site groups under it; an unassigned customer is its own job
    // site. Empty mapping → one group per customer until sites are assigned.
    const agg = new Map<string, Agg>()
    for (const p of projects) {
      const sid = siteOf.get(p.project_id)
      const key  = sid != null ? `s${sid}` : `p${p.project_id}`
      const name = sid != null ? (siteName.get(sid) ?? `Site ${sid}`) : p.name
      const row = agg.get(key) ?? {
        name,
        invoiced: 0, remainingIncome: 0, billed: 0, remainingCost: 0,
      }
      row.invoiced        += p.received + p.to_receive   // executed income
      row.billed          += p.paid + p.open_payable     // executed cost
      row.remainingIncome += p.to_receive                // pending income
      row.remainingCost   += p.to_pay                    // pending cost
      agg.set(key, row)
    }
    return [...agg.values()]
  }, [projects, mappings, jobSites])

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
  const loading = mapLoading || siteLoading

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-card/70">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Receivable vs Payable</span>
          <span className="h-3.5 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground">by Job Site</span>
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
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground/60">
            <MapPin className="h-7 w-7" />
            <p className="text-xs">Assign projects to job sites to see the breakdown.</p>
          </div>
        ) : (
          <div className="h-full p-3" style={{ width: data.length * PER_ITEM, minWidth: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={1} barCategoryGap="22%">
              <defs>
                <linearGradient id="jsReceivable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={RECEIVE} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={RECEIVE} stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="jsPayable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={PAY} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={PAY} stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                tick={{ fontSize: 9 }}
                angle={-35}
                textAnchor="end"
                height={64}
                tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={showFinancialData ? 52 : 16}
                tickFormatter={showFinancialData ? fmtShort : () => ""}
              />
              <RechartsTooltip content={<ChartTooltip labels={labels} />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
              <Bar dataKey="receivable" name={labels.receivable} fill="url(#jsReceivable)" stroke={RECEIVE} strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Bar dataKey="payable"    name={labels.payable}    fill="url(#jsPayable)"    stroke={PAY}     strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
