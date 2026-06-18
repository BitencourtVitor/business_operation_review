"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"
import { Loader2, MapPin } from "lucide-react"
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
const PAY     = "#f59e0b"
const MAX_ITEMS = 30

type Row = { name: string; receivable: number; payable: number }

function ChartTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: Row }>
}) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{r.name}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RECEIVE }} /> To receive
        </span>
        <span className="font-semibold tabular-nums" style={{ color: RECEIVE }}>{fmt(r.receivable)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PAY }} /> To pay
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

  const { data: mappings, isLoading: mapLoading } = useQuery({
    queryKey: ["budget-mappings", company],
    queryFn: () => budgetMappingService.list(company),
    enabled: !!company,
  })
  const { data: jobSites, isLoading: siteLoading } = useQuery({
    queryKey: ["job-sites"],
    queryFn: () => clientsCatalogService.listJobSites(),
  })

  const data = useMemo<Row[]>(() => {
    const siteName = new Map((jobSites ?? []).map(j => [j.id, j.name]))
    const siteOf   = new Map((mappings ?? [])
      .filter(m => m.job_site_id != null)
      .map(m => [m.customer_id, m.job_site_id as number]))

    const agg = new Map<number, Row>()
    for (const p of projects) {
      const sid = siteOf.get(p.project_id)
      if (sid == null) continue
      const row = agg.get(sid) ?? { name: siteName.get(sid) ?? `Site ${sid}`, receivable: 0, payable: 0 }
      row.receivable += p.to_receive
      row.payable    += p.to_pay
      agg.set(sid, row)
    }
    return [...agg.values()]
      .filter(r => r.receivable > 0 || r.payable > 0)
      .sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable))
      .slice(0, MAX_ITEMS)
  }, [projects, mappings, jobSites])

  const loading = mapLoading || siteLoading

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-card/70">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <span className="text-sm font-semibold">Receivable vs Payable by job site</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RECEIVE }} /> To receive
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PAY }} /> To pay
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground/60">
            <MapPin className="h-7 w-7" />
            <p className="text-xs">Assign projects to job sites to see the breakdown.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={1} barCategoryGap="22%">
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
              <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", opacity: 0.06 }} />
              <Bar dataKey="receivable" name="To receive" fill={RECEIVE} radius={[2, 2, 0, 0]} maxBarSize={26} />
              <Bar dataKey="payable"    name="To pay"     fill={PAY}     radius={[2, 2, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
