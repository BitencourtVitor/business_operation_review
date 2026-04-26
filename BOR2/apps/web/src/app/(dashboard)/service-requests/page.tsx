"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { SearchableSelect } from "@/components/common/searchable-select"
import { useServiceRequests } from "@/hooks/use-service-requests"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { useInsights } from "@/components/insights/insights-panel"
import { ManageDataModal } from "./manage-data-modal"
import type { ServiceRequest } from "@/services/service-request.service"
import {
  BarChart2, Building2, Calendar, GalleryHorizontal, Info,
  MapPin, Search, ShieldCheck, Database, Wrench,
} from "lucide-react"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"

function InfoBtn({ title, description }: { title: string; description: string }) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default" />}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity hover:opacity-100" />
        </TooltipTrigger>
        <TooltipContent className="flex flex-col gap-1 max-w-[220px]">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
import { MONTHS_SHORT, MONTHS_FULL } from "./types"
import { parseDate, getResolutionInfo, buildTopList } from "./lib"
import { ServiceCard } from "./components/service-card"
import { DetailModal } from "./components/detail-modal"
import { TopMetricCard } from "./components/top-metric-card"

export default function ServiceRequestsPage() {
  const { data: allData = [], isLoading, isError } = useServiceRequests()
  const { user }         = useAuth()
  const { data: myPerms } = useMyPermissions()

  const canManage = (user?.role as string) === 'dev' || myPerms?.permissions?.['service-requests'] === 'write'

  // Filter state
  const [year,       setYear]       = useState(String(new Date().getFullYear()))
  const [month,      setMonth]      = useState("All")
  const [contractor, setContractor] = useState("All")
  const [jobSite,    setJobSite]    = useState("All")
  const [city,       setCity]       = useState("All")
  const [warranty,   setWarranty]   = useState<"all" | "warranty" | "non-warranty">("all")

  // Chart state
  const [chartMode, setChartMode] = useState<"received" | "completed">("received")

  // Carousel
  const [addressSearch, setAddressSearch] = useState("")
  const [resFilter,     setResFilter]     = useState<"all" | "on-time" | "exceeded">("all")
  const carouselRef = useRef<HTMLDivElement>(null)
  const drag        = useRef({ x: 0, scroll: 0, active: false })

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!drag.current.active || !carouselRef.current) return
      carouselRef.current.scrollLeft = drag.current.scroll + (drag.current.x - e.clientX)
    }
    function onUp() { drag.current.active = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
  }, [])

  // ── Chart theme colors (resolved from CSS vars, reactive to dark/light) ──────
  const [chartColors, setChartColors] = useState({
    border:  "oklch(0.922 0 0)",
    muted:   "oklch(0.556 0 0)",
    primary: "oklch(0.53 0.19 260)",
    card:    "oklch(1 0 0)",
  })
  useEffect(() => {
    function resolve() {
      const s = getComputedStyle(document.documentElement)
      setChartColors({
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

  // Modal
  const [selected,   setSelected]   = useState<ServiceRequest | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const insights = useInsights({ pageKey: "Service Requests", mes: month !== "All" ? parseInt(month) : new Date().getMonth() + 1, ano: year !== "All" ? parseInt(year) : new Date().getFullYear(), userId: user?.id ?? "", canWrite: canManage })

  // ── Derived filter options ──────────────────────────────────────────────────
  const years = useMemo(() => {
    const s = new Set<string>()
    allData.forEach(r => {
      const d = parseDate(r.dateReceived)
      if (d) s.add(String(d.getUTCFullYear()))
    })
    return Array.from(s).sort((a, b) => Number(b) - Number(a))
  }, [allData])

  const months = useMemo(() => {
    if (year === "All") return []
    const s = new Set<string>()
    allData.forEach(r => {
      const d = parseDate(r.dateReceived)
      if (d && String(d.getUTCFullYear()) === year)
        s.add(String(d.getUTCMonth() + 1).padStart(2, "0"))
    })
    return Array.from(s).sort()
  }, [allData, year])

  const contractors = useMemo(() => [...new Set(allData.map(r => r.contractor).filter(Boolean))].sort(), [allData])
  const jobSites    = useMemo(() => [...new Set(allData.map(r => r.jobSite).filter(Boolean))].sort(),    [allData])
  const cities      = useMemo(() => [...new Set(allData.map(r => r.city).filter(Boolean))].sort(),      [allData])

  // ── Filtered data ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allData.filter(r => {
      const d = parseDate(r.dateReceived)
      if (year !== "All" && (!d || String(d.getUTCFullYear()) !== year)) return false
      if (month !== "All" && (!d || String(d.getUTCMonth() + 1).padStart(2, "0") !== month)) return false
      if (contractor !== "All" && r.contractor !== contractor) return false
      if (jobSite    !== "All" && r.jobSite    !== jobSite)    return false
      if (city       !== "All" && r.city       !== city)       return false
      if (warranty === "warranty"     && !r.warranty) return false
      if (warranty === "non-warranty" &&  r.warranty) return false
      return true
    })
  }, [allData, year, month, contractor, jobSite, city, warranty])

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total            = filtered.length
    const materialWait     = filtered.filter(r => !!r.materialAvailableDate).length
    const residentWait     = filtered.filter(r => !!r.residentAvailableDate).length
    const additionalVisits = filtered.filter(r => (r.additionalVisits ?? []).length > 0).length
    const completed        = filtered.filter(r => !!r.dateCompleted)
    const avgResolution    = completed.length > 0
      ? Math.round(completed.reduce((s, r) => s + getResolutionInfo(r).days, 0) / completed.length)
      : 0

    let avgPerPeriod = 0
    let avgLabel = "Avg/Period"
    if (month !== "All" && year !== "All") {
      const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
      const workdays = Math.max(1, Math.floor(daysInMonth * 5 / 7))
      avgPerPeriod = Math.round((total / workdays) * 10) / 10
      avgLabel = "Avg/Day"
    } else if (year !== "All") {
      const monthSet = new Set(filtered.map(r => parseDate(r.dateReceived)?.getUTCMonth()).filter(m => m !== undefined))
      avgPerPeriod = monthSet.size > 0 ? Math.round((total / monthSet.size) * 10) / 10 : 0
      avgLabel = "Avg/Month"
    }

    return { total, materialWait, residentWait, additionalVisits, avgPerPeriod, avgLabel, avgResolution }
  }, [filtered, year, month])

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const dateField = chartMode === "received" ? "dateReceived" : "dateCompleted"
    const map = new Map<string, number>()

    const isMonthView = month !== "All" && year !== "All"
    if (isMonthView) {
      const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) map.set(String(d), 0)
      filtered.forEach(r => {
        const d = parseDate(r[dateField])
        if (d && String(d.getUTCFullYear()) === year && String(d.getUTCMonth() + 1).padStart(2, "0") === month)
          map.set(String(d.getUTCDate()), (map.get(String(d.getUTCDate())) ?? 0) + 1)
      })
    } else {
      for (let m = 1; m <= 12; m++) map.set(String(m).padStart(2, "0"), 0)
      filtered.forEach(r => {
        const d = parseDate(r[dateField])
        if (d) {
          const key = String(d.getUTCMonth() + 1).padStart(2, "0")
          map.set(key, (map.get(key) ?? 0) + 1)
        }
      })
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => Number(a) - Number(b))
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        name: isMonthView ? key : MONTHS_SHORT[Number(key) - 1],
        value,
      }))
  }, [filtered, chartMode, year, month])

  // ── Top-4 lists ────────────────────────────────────────────────────────────
  const topContractors = useMemo(() => buildTopList(filtered, r => r.contractor), [filtered])
  const topJobSites    = useMemo(() => buildTopList(filtered, r => r.jobSite),    [filtered])
  const topIssues      = useMemo(() => buildTopList(filtered, r => r.issue),      [filtered])
  const topTechs       = useMemo(() => buildTopList(filtered, r => r.tech),       [filtered])

  // ── Carousel cards ─────────────────────────────────────────────────────────
  const carouselCards = useMemo(() => {
    return filtered
      .filter(r => {
        const addr = (r.address || r.jobSite || "").toLowerCase()
        if (addressSearch && !addr.includes(addressSearch.toLowerCase())) return false
        if (resFilter !== "all") {
          const { onTime } = getResolutionInfo(r)
          if (resFilter === "on-time"  && !onTime) return false
          if (resFilter === "exceeded" &&  onTime) return false
        }
        return true
      })
      .sort((a, b) => {
        if (a.warranty && !b.warranty) return -1
        if (!a.warranty && b.warranty) return 1
        return (parseDate(b.dateReceived)?.getTime() ?? 0) - (parseDate(a.dateReceived)?.getTime() ?? 0)
      })
  }, [filtered, addressSearch, resFilter])

  if (isLoading) return <PageSkeleton />
  if (isError) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Wrench className="h-8 w-8 opacity-20" />
      <p className="text-sm font-medium">Could not load service requests</p>
      <p className="text-xs opacity-60">Check your connection or try refreshing the page</p>
    </div>
  )
  if (allData.length === 0) return (
    <>
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldCheck className="h-10 w-10 opacity-10" />
        <p className="text-sm font-medium">No service requests yet</p>
        <p className="text-xs opacity-60">Once requests are uploaded they'll appear here</p>
        {canManage && (
          <button
            onClick={() => setManageOpen(true)}
            className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Database className="h-3.5 w-3.5" />
            Manage Data
          </button>
        )}
      </div>
      {manageOpen && <ManageDataModal onClose={() => setManageOpen(false)} />}
    </>
  )

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── Header + Filters ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Service Requests</h1>
          <p className="text-sm text-muted-foreground">Service and warranty request tracking</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">

          {/* Period — Year + Month in one box, same as Permit Control */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center gap-0.5 pl-2.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <Select value={year} onValueChange={v => { if (v) { setYear(v); setMonth("All") } }}>
                <SelectTrigger className="h-8 w-[68px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{year === "All" ? "All" : year}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="h-5 w-px shrink-0 bg-border" />
              <Select value={month} onValueChange={v => { if (v) setMonth(v) }}>
                <SelectTrigger className="h-8 w-[120px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">
                    {month === "All" ? "All months" : MONTHS_FULL.find(m => m.value === month)?.label ?? "All"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All months</SelectItem>
                  {months.map(m => (
                    <SelectItem key={m} value={m}>{MONTHS_FULL.find(f => f.value === m)?.label ?? m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contractor · Job Site · City — grouped pill */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Location</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <SearchableSelect
                value={contractor}
                onValueChange={v => setContractor(v)}
                options={contractors.map(c => ({ value: c, label: c }))}
                icon={Wrench}
                iconOnly inline
              />
              <div className="h-5 w-px shrink-0 bg-border" />
              <SearchableSelect
                value={jobSite}
                onValueChange={v => setJobSite(v)}
                options={jobSites.map(j => ({ value: j, label: j }))}
                icon={MapPin}
                iconOnly inline
              />
              <div className="h-5 w-px shrink-0 bg-border" />
              <SearchableSelect
                value={city}
                onValueChange={v => setCity(v)}
                options={cities.map(c => ({ value: c, label: c }))}
                icon={Building2}
                iconOnly inline
              />
            </div>
          </div>

          {/* Warranty toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Warranty</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
              {(["all", "warranty", "non-warranty"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setWarranty(v)}
                  className={`flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors ${
                    warranty === v
                      ? v === "warranty"     ? "bg-orange-500 text-white"
                      : v === "non-warranty" ? "bg-green-600 text-white"
                      :                        "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "all" ? "All" : v === "warranty" ? "Yes" : "No"}
                </button>
              ))}
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

      {/* ── Body (metrics + chart + carousel + insights panel) ── */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">

          {/* ── Metrics bar ── */}
          <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: "Total",           value: metrics.total,               color: undefined,  info: "Total number of service requests matching the current filters." },
              { label: "Material Wait",   value: metrics.materialWait,        color: "#FF8C00",  info: "Requests where material availability was recorded. Indicates procurement dependency before work could begin." },
              { label: "Resident Wait",   value: metrics.residentWait,        color: "#FF8C00",  info: "Requests requiring resident availability confirmation before scheduling. Common in warranty and occupied-unit work." },
              { label: "Add. Visits",     value: metrics.additionalVisits,    color: "#dc3545",  info: "Requests that required more than one visit to be resolved. A signal of incomplete diagnosis or parts unavailability on the first visit." },
              { label: metrics.avgLabel,  value: metrics.avgPerPeriod,        color: undefined,  info: "Average number of requests received per day (month view) or per month (year view) within the selected period." },
              { label: "Avg Resolution",  value: `${metrics.avgResolution}d`, color: undefined,  info: "Average number of days to resolve a completed request. Counted from resident availability date when present, otherwise from received date. Target: 14 days or fewer." },
            ].map(m => (
              <div key={m.label} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</span>
                  <InfoBtn title={m.label} description={m.info} />
                </div>
                <span className="text-lg font-bold" style={m.color ? { color: m.color } : undefined}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>

          {/* Chart — fills all remaining height after fixed-size elements */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card/60 p-4">
            <div className="mb-2 flex shrink-0 items-center gap-2">
              <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Requests Over Time</span>
              <div className="ml-auto flex items-center gap-2">
                <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
                  {(["received", "completed"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setChartMode(m)}
                      className={`flex h-7 items-center rounded-md px-2.5 text-xs font-medium capitalize transition-colors ${
                        chartMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <InfoBtn title="Requests Over Time" description="Volume of service requests grouped by day (month view) or by month (year view), based on the selected date mode. Received counts when the request was logged. Completed counts when it was resolved." />
              </div>
            </div>
            <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="srGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={chartColors.primary} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: chartColors.card,
                      borderColor: chartColors.border,
                      borderRadius: 8,
                      fontSize: 12,
                      color: "inherit",
                    }}
                    labelStyle={{ color: chartColors.muted }}
                  />
                  <Area
                    type="monotone" dataKey="value" name="Requests"
                    stroke={chartColors.primary} strokeWidth={2}
                    fill="url(#srGrad)"
                    dot={{ r: 3, fill: chartColors.primary }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top-4 row — 4 columns below chart */}
          <div className="grid shrink-0 grid-cols-4 gap-2">
            <TopMetricCard label="Top Contractor" items={topContractors} />
            <TopMetricCard label="Top Job Site"   items={topJobSites}    />
            <TopMetricCard label="Top Issue"       items={topIssues}      />
            <TopMetricCard label="Top Tech"        items={topTechs}       />
          </div>

          {/* Carousel — shrinks to card height, chart above absorbs remaining space */}
          <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/60">

            {/* Controls bar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <div className="flex items-center gap-2">
                <GalleryHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">Request Cards</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Address search */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={addressSearch}
                    onChange={e => setAddressSearch(e.target.value)}
                    placeholder="Search…"
                    className="h-7 w-40 rounded-md border border-input bg-transparent pl-7 pr-6 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30"
                  />
                </div>
                {/* Resolution filter */}
                <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
                  {(["all", "on-time", "exceeded"] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setResFilter(v)}
                      className={`flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors ${
                        resFilter === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v === "all" ? "All" : v === "on-time" ? "On Time" : "Exceeded"}
                    </button>
                  ))}
                </div>
                <InfoBtn title="Request Cards" description="Individual request cards filtered and sorted by warranty status first, then by received date (newest first). Drag horizontally to browse. Click any card to see the full timeline and details." />
                <span className="text-xs text-muted-foreground">{carouselCards.length} showing</span>
              </div>
            </div>

            {/* Cards */}
            {carouselCards.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm italic text-muted-foreground">
                No requests match the current filters.
              </div>
            ) : (
              <div
                ref={carouselRef}
                className="flex cursor-grab items-start gap-3 overflow-x-auto overflow-y-hidden p-3 select-none active:cursor-grabbing [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
                onMouseDown={e => { drag.current = { x: e.clientX, scroll: carouselRef.current?.scrollLeft ?? 0, active: true } }}
              >
                {carouselCards.map(r => (
                  <ServiceCard key={r.id} r={r} onClick={() => setSelected(r)} />
                ))}
              </div>
            )}

          </div>

        </div>

        {/* Insights panel — slides in, compresses main content */}
        {insights.panel}
      </div>

      {/* Detail modal */}
      {selected && <DetailModal r={selected} onClose={() => setSelected(null)} />}

      {/* Manage Data */}
      {manageOpen && <ManageDataModal onClose={() => setManageOpen(false)} />}
    </div>
  )
}
