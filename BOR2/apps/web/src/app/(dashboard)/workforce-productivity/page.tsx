"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useWorkforceData } from "@/hooks/use-workforce"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { useInsights } from "@/components/insights/insights-panel"
import { ManageDataModal as WorkforceManageDataModal } from "./manage-data-modal"
import { Building2, Calendar, Clock, Database, Loader2, MapPin, TrendingUp, Users, Wrench } from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { MultiSelect } from "@/app/(dashboard)/permits/components/multi-select"
import { useWorkforceRules } from "@/hooks/use-workforce"
import type { WorkforceRow } from "@/services/workforce.service"
import type { AttributionRule } from "@/services/workforce.service"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Legend,
} from "recharts"

// ─── Constants ────────────────────────────────────────────────────────────────

const WORKTYPE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
  "#a78bfa", "#fb923c", "#64748b", "#e11d48", "#0ea5e9",
]

const TOP_N_OPTIONS = [5, 10, 15, 20]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonth(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "short", year: "2-digit" })
}

function formatMonthName(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "long" })
}

function fmtHours(h: number) {
  return h.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function getJobsiteLabel(r: { jobsite?: string; lotBuilding?: string; client?: string }): string {
  const jobsite = r.jobsite?.trim() ?? ""
  const lot     = r.lotBuilding?.trim() ?? ""
  if (!jobsite && !lot) return r.client?.trim() || "Unknown"
  if (jobsite && lot)   return `${jobsite} - ${lot}`
  return jobsite || lot
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?:  boolean
  payload?: { name: string; value: number; color?: string; fill?: string; stroke?: string }[]
  label?:   string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {label && <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? p.fill ?? p.stroke }} />
            <span className="text-xs text-muted-foreground">{p.name}</span>
            <span className="ml-auto pl-4 text-xs font-semibold tabular-nums text-foreground">
              {fmtHours(p.value)} hrs
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Rule application ─────────────────────────────────────────────────────────

function applyRules(rows: WorkforceRow[], rules: AttributionRule[]): WorkforceRow[] {
  if (!rules.length) return rows
  return rows.map(row => {
    for (const rule of rules) {
      const { company, client, jobsite, worktype } = rule.conditions
      if (company  && row.company  !== company)  continue
      if (client   && row.client   !== client)   continue
      if (jobsite  && row.jobsite  !== jobsite)  continue
      if (worktype && row.worktype !== worktype)  continue
      // All non-empty conditions matched — redirect company
      return { ...row, company: rule.targetCompany }
    }
    return row
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkforceProductivityPage() {
  const searchParams      = useSearchParams()
  const company           = searchParams.get("company") ?? undefined
  const { user }          = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage         = (user?.role as string) === "dev" || myPerms?.permissions?.["workforce-productivity"] === "write"

  const [manageOpen,     setManageOpen]     = useState(false)
  const [year,           setYear]           = useState(String(new Date().getFullYear()))
  const [month,          setMonth]          = useState("")
  const [clientFilter,   setClientFilter]   = useState<string[]>([])
  const [jobsiteFilter,  setJobsiteFilter]  = useState<string[]>([])
  const [worktypeFilter, setWorktypeFilter] = useState<string[]>([])
  const [topN,           setTopN]           = useState(10)

  // Reactive CSS-var colors (light/dark)
  const [cc, setCC] = useState({
    border:  "oklch(0.922 0 0)",
    muted:   "oklch(0.556 0 0)",
    primary: "oklch(0.53 0.19 260)",
    card:    "oklch(1 0 0)",
  })
  useEffect(() => {
    function resolve() {
      const s = getComputedStyle(document.documentElement)
      setCC({
        border:  s.getPropertyValue("--border").trim()           || "oklch(0.922 0 0)",
        muted:   s.getPropertyValue("--muted-foreground").trim() || "oklch(0.556 0 0)",
        primary: s.getPropertyValue("--primary").trim()          || "oklch(0.53 0.19 260)",
        card:    s.getPropertyValue("--card").trim()             || "oklch(1 0 0)",
      })
    }
    resolve()
    const obs = new MutationObserver(resolve)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  // Reset filters when company changes
  useEffect(() => {
    setYear(String(new Date().getFullYear()))
    setMonth("")
    setClientFilter([])
    setJobsiteFilter([])
    setWorktypeFilter([])
  }, [company])

  const { data: rawRows  = [], isLoading }  = useWorkforceData({ company })
  const { data: rules    = [] }             = useWorkforceRules()

  // Apply attribution rules: rows matching rule conditions get their company overridden
  const allRows = useMemo(() => applyRules(rawRows, rules), [rawRows, rules])

  // ── Filter options ────────────────────────────────────────────────────────

  const years = useMemo(() => {
    const set = new Set(allRows.map(r => r.referenceMonth.split("-")[0]))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [allRows])

  const availableMonths = useMemo(() => {
    const set = new Set(
      allRows
        .filter(r => !year || r.referenceMonth.startsWith(year))
        .map(r => r.referenceMonth)
    )
    return Array.from(set).sort()
  }, [allRows, year])

  const clientOptions   = useMemo(() =>
    Array.from(new Set(allRows.map(r => r.client).filter(Boolean))).sort() as string[]
  , [allRows])

  const jobsiteOptions  = useMemo(() =>
    Array.from(new Set(allRows.map(r => getJobsiteLabel(r)).filter(Boolean))).sort()
  , [allRows])

  const worktypeOptions = useMemo(() =>
    Array.from(new Set(allRows.map(r => r.worktype).filter(Boolean))).sort() as string[]
  , [allRows])

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const rows = useMemo(() => allRows.filter(r => {
    if (year           && !r.referenceMonth.startsWith(year))          return false
    if (month          && r.referenceMonth !== month)                   return false
    if (clientFilter.length   > 0 && !clientFilter.includes(r.client))    return false
    if (jobsiteFilter.length  > 0 && !jobsiteFilter.includes(getJobsiteLabel(r)))  return false
    if (worktypeFilter.length > 0 && !worktypeFilter.includes(r.worktype)) return false
    return true
  }), [allRows, year, month, clientFilter, jobsiteFilter, worktypeFilter])

  const isSingleProject = jobsiteFilter.length === 1

  // ── KPI metrics ───────────────────────────────────────────────────────────

  const totalHours     = useMemo(() => rows.reduce((s, r) => s + r.regularHours, 0), [rows])
  const totalEmployees = useMemo(() => new Set(rows.map(r => r.employeeName)).size, [rows])
  const totalJobsites  = useMemo(() => new Set(rows.map(r => getJobsiteLabel(r))).size, [rows])
  const avgHoursPerEmp = totalEmployees > 0 ? totalHours / totalEmployees : 0

  // ── General view chart data ───────────────────────────────────────────────

  // Chart #1 — Total Hours by Month
  const hoursByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { map[r.referenceMonth] = (map[r.referenceMonth] ?? 0) + r.regularHours })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, h]) => ({ month: formatMonth(m), hours: Math.round(h) }))
  }, [rows])

  // Chart #3 — Hours by Service Type (worktype)
  const hoursByWorktype = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const wt = r.worktype || "Unclassified"
      map[wt] = (map[wt] ?? 0) + r.regularHours
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, hours], i) => ({
        name,
        hours: Math.round(hours),
        color: WORKTYPE_COLORS[i % WORKTYPE_COLORS.length],
      }))
  }, [rows])

  // Chart #2 — Hours by Project (Top N)
  const topJobsites = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const label = getJobsiteLabel(r)
      map[label] = (map[label] ?? 0) + r.regularHours
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([name, hours]) => ({ name, hours: Math.round(hours) }))
  }, [rows, topN])

  // ── Single-project view chart data ────────────────────────────────────────

  const spMonths = useMemo(() =>
    isSingleProject ? Array.from(new Set(rows.map(r => r.referenceMonth))).sort() : []
  , [rows, isSingleProject])

  const spWorktypes = useMemo(() =>
    isSingleProject
      ? Array.from(new Set(rows.map(r => r.worktype || "Unclassified")))
      : []
  , [rows, isSingleProject])

  // Chart #4 — Hours: Total vs Worktype by month (multi-series line)
  const spMonthlyData = useMemo(() => {
    if (!isSingleProject) return []
    return spMonths.map(m => {
      const mRows = rows.filter(r => r.referenceMonth === m)
      const total = mRows.reduce((s, r) => s + r.regularHours, 0)
      const entry: Record<string, string | number> = {
        month: formatMonth(m),
        total: Math.round(total),
      }
      spWorktypes.forEach(wt => {
        entry[wt] = Math.round(
          mRows
            .filter(r => (r.worktype || "Unclassified") === wt)
            .reduce((s, r) => s + r.regularHours, 0)
        )
      })
      return entry
    })
  }, [rows, isSingleProject, spMonths, spWorktypes])

  // Chart #5 — Work Type Proportion (doughnut)
  const spWorktypePie = useMemo(() => {
    if (!isSingleProject) return []
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const wt = r.worktype || "Unclassified"
      map[wt] = (map[wt] ?? 0) + r.regularHours
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value], i) => ({
        name,
        value: Math.round(value),
        fill: WORKTYPE_COLORS[i % WORKTYPE_COLORS.length],
      }))
  }, [rows, isSingleProject])

  // Chart #6 — Hours per Employee by month
  const spHoursPerEmp = useMemo(() => {
    if (!isSingleProject) return []
    return spMonths.map(m => {
      const mRows = rows.filter(r => r.referenceMonth === m)
      const total = mRows.reduce((s, r) => s + r.regularHours, 0)
      const emp   = new Set(mRows.map(r => r.employeeName)).size
      return { month: formatMonth(m), hpe: emp > 0 ? Math.round(total / emp) : 0 }
    })
  }, [rows, isSingleProject, spMonths])

  // Chart #7 — Employee Count by month
  const spEmpCount = useMemo(() => {
    if (!isSingleProject) return []
    return spMonths.map(m => {
      const mRows = rows.filter(r => r.referenceMonth === m)
      return { month: formatMonth(m), count: new Set(mRows.map(r => r.employeeName)).size }
    })
  }, [rows, isSingleProject, spMonths])

  // ── Shared chart props ────────────────────────────────────────────────────

  const cursor = { fill: cc.muted, fillOpacity: 0.12 }
  const tick   = { fontSize: 11 }

  // ── Insights ──────────────────────────────────────────────────────────────

  const insights = useInsights({
    pageKey:  "Workforce Productivity",
    mes:      month ? parseInt(month.split("-")[1]) : new Date().getMonth() + 1,
    ano:      year  ? parseInt(year)                : new Date().getFullYear(),
    userId:   user?.id ?? "",
    canWrite: canManage,
  })

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workforce Productivity</h1>
          <p className="text-sm text-muted-foreground">
            {company ? `${company} · ` : ""}QBTime hours by project and work type
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">

          {/* Period */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <Select value={year || "all"} onValueChange={v => { setYear(v === "all" ? "" : (v ?? "")); setMonth("") }}>
                <SelectTrigger className="h-8 w-[68px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{year || "All"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="h-5 w-px shrink-0 bg-border" />
              <Select value={month || "all"} onValueChange={v => setMonth(v === "all" ? "" : (v ?? ""))}>
                <SelectTrigger className="h-8 w-[120px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">
                    {month ? formatMonthName(month) : "All months"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All months</SelectItem>
                  {availableMonths.map(m => <SelectItem key={m} value={m}>{formatMonthName(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Client</span>
            <MultiSelect label="Client" icon={<Building2 className="h-3.5 w-3.5 shrink-0" />}
              options={clientOptions} selected={clientFilter} onChange={setClientFilter} />
          </div>

          {/* Jobsite */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Jobsite & Lot</span>
            <MultiSelect label="Jobsite & Lot" icon={<MapPin className="h-3.5 w-3.5 shrink-0" />}
              options={jobsiteOptions} selected={jobsiteFilter} onChange={setJobsiteFilter} fitContent />
          </div>

          {/* Worktype */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Worktype</span>
            <MultiSelect label="Worktype" icon={<Wrench className="h-3.5 w-3.5 shrink-0" />}
              options={worktypeOptions} selected={worktypeFilter} onChange={setWorktypeFilter} />
          </div>

          {/* Changes */}
          {canManage && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Changes</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setManageOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Database className="h-3.5 w-3.5" />
                  Manage Data
                </button>
                {insights.triggerButton}
              </div>
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No data for the selected filters.</p>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">

            {/* ── KPI cards ── */}
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                { label: "Total Hours",   value: fmtHours(totalHours),     Icon: Clock      },
                { label: "Employees",     value: String(totalEmployees),    Icon: Users      },
                { label: "Job Sites",     value: String(totalJobsites),     Icon: MapPin     },
                { label: "Avg hrs / emp", value: fmtHours(avgHoursPerEmp), Icon: TrendingUp },
              ] as const).map(({ label, value, Icon }) => (
                <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted-foreground/60" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-2xl font-bold tracking-tight">{value}</span>
                </div>
              ))}
            </div>

            {isSingleProject ? (

              /* ═══════════════ SINGLE PROJECT VIEW ═══════════════ */
              <div className="flex min-h-0 flex-1 flex-col gap-4">

                {/* Row 1 — Chart #4 (2/3) + Chart #5 doughnut (1/3) */}
                <div className="grid min-h-0 flex-[3] grid-cols-3 gap-4">

                  {/* Chart #4 — Hours: Total vs Worktype */}
                  <div className="col-span-2 flex flex-col rounded-xl border border-border bg-card/60 p-4">
                    <span className="mb-2 shrink-0 text-sm font-semibold">
                      Hours by Month — {jobsiteFilter[0]}
                    </span>
                    <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={spMonthlyData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                          <defs>
                            {spWorktypes.map((wt, i) => {
                              const color = WORKTYPE_COLORS[i % WORKTYPE_COLORS.length]
                              return (
                                <linearGradient key={wt} id={`grad-wt-${i}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                                </linearGradient>
                              )
                            })}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
                          <YAxis tick={tick} axisLine={false} tickLine={false} width={44} />
                          <RechartsTooltip content={<ChartTooltip />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                          {spWorktypes.length > 1 && (
                            <Line dataKey="total" name="Total" stroke={cc.muted}
                              strokeWidth={2} strokeDasharray="6 3" dot={false} />
                          )}
                          {spWorktypes.map((wt, i) => {
                            const color = WORKTYPE_COLORS[i % WORKTYPE_COLORS.length]
                            return (
                              <Area key={wt} dataKey={wt} name={wt} type="monotone"
                                stroke={color} strokeWidth={2}
                                fill={`url(#grad-wt-${i})`}
                                dot={{ r: 3, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
                                activeDot={{ r: 5 }} />
                            )
                          })}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart #5 — Work Type Proportion */}
                  <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4">
                    <span className="mb-2 shrink-0 text-sm font-semibold">Work Type Proportion</span>
                    <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={spWorktypePie} dataKey="value" nameKey="name"
                            innerRadius="52%" outerRadius="78%" paddingAngle={2} stroke="none">
                            {spWorktypePie.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <RechartsTooltip content={<ChartTooltip />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Row 2 — Chart #6 (left) + Chart #7 (right) */}
                <div className="grid min-h-0 flex-[2] grid-cols-2 gap-4">

                  {/* Chart #6 — Hours per Employee */}
                  <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4">
                    <span className="mb-2 shrink-0 text-sm font-semibold">Hours per Employee</span>
                    <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={spHoursPerEmp} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                          <defs>
                            <linearGradient id="grad-hpe" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
                          <YAxis tick={tick} axisLine={false} tickLine={false} width={44} />
                          <RechartsTooltip content={<ChartTooltip />} />
                          <Area dataKey="hpe" name="Hrs / emp" type="monotone"
                            stroke="#f59e0b" strokeWidth={2} fill="url(#grad-hpe)"
                            dot={{ r: 4, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
                            activeDot={{ r: 6 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart #7 — Employee Count */}
                  <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4">
                    <span className="mb-2 shrink-0 text-sm font-semibold">Employee Count</span>
                    <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={spEmpCount} barSize={20} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
                          <YAxis tick={tick} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
                          <RechartsTooltip content={<ChartTooltip />} cursor={cursor} />
                          <Bar dataKey="count" name="Employees" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

            ) : (

              /* ═══════════════ GENERAL VIEW ═══════════════ */
              <div className="flex min-h-0 flex-1 flex-col gap-4">

                {/* Row 1 — Chart #1 + Chart #3 */}
                <div className="grid min-h-0 flex-[3] grid-cols-1 gap-4 lg:grid-cols-2">

                  {/* Chart #1 — Total Hours by Month */}
                  {hoursByMonth.length > 1 && (
                    <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4">
                      <span className="mb-2 shrink-0 text-sm font-semibold">Total Hours by Month</span>
                      <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hoursByMonth} barSize={24} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
                            <YAxis tick={tick} axisLine={false} tickLine={false} width={44} />
                            <RechartsTooltip content={<ChartTooltip />} cursor={cursor} />
                            <Bar dataKey="hours" fill={cc.primary} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Chart #3 — Hours by Service Type */}
                  {hoursByWorktype.length > 0 && (
                    <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4">
                      <span className="mb-2 shrink-0 text-sm font-semibold">Hours by Work Type</span>
                      <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hoursByWorktype} layout="vertical" barSize={14}
                            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" width={120} tick={tick} axisLine={false} tickLine={false} />
                            <RechartsTooltip content={<ChartTooltip />} cursor={cursor} />
                            <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                              {hoursByWorktype.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chart #2 — Hours by Project (Top N) */}
                {topJobsites.length > 0 && (
                  <div className="flex min-h-0 flex-[2] flex-col rounded-xl border border-border bg-card/60 p-4">
                    <div className="mb-3 flex shrink-0 items-center justify-between">
                      <span className="text-sm font-semibold">Hours by Project</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Top</span>
                        <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                          {TOP_N_OPTIONS.map(n => (
                            <button key={n} onClick={() => setTopN(n)}
                              className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                topN === n
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto [&_text]:fill-muted-foreground">
                      <div style={{ height: Math.max(topJobsites.length * 28 + 24, 80) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topJobsites} layout="vertical" barSize={14}
                            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" width={220} tick={tick} axisLine={false} tickLine={false} />
                            <RechartsTooltip content={<ChartTooltip />} cursor={cursor} />
                            <Bar dataKey="hours" fill={cc.primary} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {insights.panel}
        </div>
      )}

      {manageOpen && <WorkforceManageDataModal onClose={() => setManageOpen(false)} />}
    </div>
  )
}
