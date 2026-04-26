"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useWorkforceData } from "@/hooks/use-workforce"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { useInsights } from "@/components/insights/insights-panel"
import { ManageDataModal as WorkforceManageDataModal } from "./manage-data-modal"
import { Calendar, Clock, Database, Loader2, MapPin, TrendingUp, Users } from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts"

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkforceProductivityPage() {
  const searchParams       = useSearchParams()
  const company            = searchParams.get("company") ?? undefined
  const { user }           = useAuth()
  const { data: myPerms }  = useMyPermissions()
  const canManage          = (user?.role as string) === "dev" || myPerms?.permissions?.["workforce-productivity"] === "write"
  const [manageOpen, setManageOpen] = useState(false)
  const [year,  setYear]   = useState(String(new Date().getFullYear()))
  const [month, setMonth]  = useState("")

  // Reactive chart colors — MutationObserver on <html class> like service-requests
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

  useEffect(() => { setYear(String(new Date().getFullYear())); setMonth("") }, [company])

  const { data: allRows = [], isLoading } = useWorkforceData({ company })

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
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allRows, year])

  const rows = useMemo(() => allRows.filter(r => {
    if (year  && !r.referenceMonth.startsWith(year)) return false
    if (month && r.referenceMonth !== month)          return false
    return true
  }), [allRows, year, month])

  // ── Metrics ───────────────────────────────────────────────────────────────

  const totalHours     = useMemo(() => rows.reduce((s, r) => s + r.regularHours, 0), [rows])
  const totalEmployees = useMemo(() => new Set(rows.map(r => r.employeeName)).size, [rows])
  const totalJobsites  = useMemo(() => new Set(rows.map(r => r.jobsite).filter(Boolean)).size, [rows])
  const avgHoursPerEmp = totalEmployees > 0 ? totalHours / totalEmployees : 0

  // ── Chart data ────────────────────────────────────────────────────────────

  const hoursByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { map[r.referenceMonth] = (map[r.referenceMonth] ?? 0) + r.regularHours })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, h]) => ({ month: formatMonth(m), hours: Math.round(h) }))
  }, [rows])

  const hoursByWorktype = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const wt = r.worktype || "Unclassified"
      map[wt] = (map[wt] ?? 0) + r.regularHours
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, hours]) => ({ name, hours: Math.round(hours) }))
  }, [rows])

  const topJobsites = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      if (!r.jobsite) return
      map[r.jobsite] = (map[r.jobsite] ?? 0) + r.regularHours
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, hours]) => ({ name, hours: Math.round(hours) }))
  }, [rows])

  // Shared chart props
  const tooltipStyle = { backgroundColor: cc.card, borderColor: cc.border, borderRadius: 8, fontSize: 12 }
  const labelStyle   = { color: cc.muted }
  const cursor       = { fill: cc.muted, fillOpacity: 0.12 }
  const tick         = { fontSize: 11 }

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
  // Mirrors service-requests: flex h-full flex-col, fixed rows shrink-0,
  // middle section min-h-0 flex-1 so charts fill remaining viewport height.

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

        {/* Changes — Manage Data + Insights */}
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
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          {/* ── Metrics ── */}
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Total Hours",   value: fmtHours(totalHours),     Icon: Clock      },
              { label: "Employees",     value: String(totalEmployees),    Icon: Users      },
              { label: "Job Sites",     value: String(totalJobsites),     Icon: MapPin     },
              { label: "Avg hrs / emp", value: fmtHours(avgHoursPerEmp), Icon: TrendingUp },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3 text-muted-foreground/60" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                </div>
                <span className="text-2xl font-bold tracking-tight">{value}</span>
              </div>
            ))}
          </div>

          {/* ── Top charts row — grows to fill remaining height ── */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Hours by month */}
            {hoursByMonth.length > 1 && (
              <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card/60 p-4">
                <span className="mb-2 shrink-0 text-sm font-semibold">Hours by Month</span>
                <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoursByMonth} barSize={24} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
                      <YAxis tick={tick} axisLine={false} tickLine={false} width={40} />
                      <RechartsTooltip contentStyle={tooltipStyle} labelStyle={labelStyle} cursor={cursor}
                        formatter={(v: any) => [fmtHours(Number(v)) + " hrs", "Hours"]} />
                      <Bar dataKey="hours" fill={cc.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Hours by work type */}
            {hoursByWorktype.length > 0 && (
              <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card/60 p-4">
                <span className="mb-2 shrink-0 text-sm font-semibold">Hours by Work Type</span>
                <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoursByWorktype} layout="vertical" barSize={14} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={120} tick={tick} axisLine={false} tickLine={false} />
                      <RechartsTooltip contentStyle={tooltipStyle} labelStyle={labelStyle} cursor={cursor}
                        formatter={(v: any) => [fmtHours(Number(v)) + " hrs", "Hours"]} />
                      <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                        {hoursByWorktype.map((_, i) => (
                          <Cell key={i} fill={cc.primary} fillOpacity={1 - i * 0.07} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* ── Top job sites — fixed height at bottom ── */}
          {topJobsites.length > 0 && (
            <div className="flex shrink-0 flex-col rounded-xl border border-border bg-card/60 p-4">
              <span className="mb-2 shrink-0 text-sm font-semibold">Top Job Sites by Hours</span>
              <div className="[&_text]:fill-muted-foreground">
                <ResponsiveContainer width="100%" height={topJobsites.length * 28 + 24}>
                  <BarChart data={topJobsites} layout="vertical" barSize={14} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={210} tick={tick} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={tooltipStyle} labelStyle={labelStyle} cursor={cursor}
                      formatter={(v: any) => [fmtHours(Number(v)) + " hrs", "Hours"]} />
                    <Bar dataKey="hours" fill={cc.primary} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
