"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useOfi, useOfiLive } from "@/hooks/use-ofi"
import { useSidebar } from "@/components/ui/sidebar"
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import {
  ArrowUpDown, BarChart3, Calendar, ClipboardList,
  FileText, Info, Layers, Loader2, TableIcon, TrendingUp, Truck, X,
} from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function shortMonth(m: number) { return MONTH_NAMES[m - 1]?.slice(0, 3) ?? "" }
function fullMonth(m: number)  { return MONTH_NAMES[m - 1] ?? "" }
function round2(v: number)     { return Math.round(v * 100) / 100 }

function scoreColor(score: number, max: number, primaryAtMax = false) {
  const pct = max > 0 ? score / max : 0
  if (primaryAtMax) {
    if (pct >= 1.0)  return "text-primary"
    if (pct >= 0.65) return "text-amber-500"
    return "text-red-500"
  }
  if (pct >= 0.85) return "text-green-500"
  if (pct >= 0.65) return "text-amber-500"
  return "text-red-500"
}


// ─── Recharts tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label, unit = "",
}: {
  active?:  boolean
  payload?: { name: string; value: number; color?: string; stroke?: string; fill?: string }[]
  label?:   string
  unit?:    string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {label && <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.color ?? p.stroke ?? p.fill }}
            />
            <span className="text-xs text-muted-foreground">{p.name}</span>
            <span className="ml-auto pl-4 text-xs font-semibold tabular-nums text-foreground">
              {p.value}{unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SparklineCard ────────────────────────────────────────────────────────────

type TrendPoint = {
  month:     string
  total:     number
  fieldwire: number
  machines:  number
  contract:  number
  systems:   number
}

type SparklineKey = keyof Omit<TrendPoint, "month">

function SparklineCard({
  data, dataKey, name, max, score, label, tip, icon, primaryAtMax = false,
}: {
  data:          TrendPoint[]
  dataKey:       SparklineKey
  name:          string
  max:           number
  score:         number
  label:         string
  tip:           string
  icon:          React.ReactNode
  primaryAtMax?: boolean
}) {
  const [hover, setHover] = useState<{
    clientX: number; clientY: number; label: string; value: number
  } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!data.length || !ref.current) return
    const rect      = ref.current.getBoundingClientRect()
    const relX      = e.clientX - rect.left
    const plotWidth = rect.width - 16            // margin-left 8 + margin-right 8
    if (plotWidth <= 0) return
    const idx = Math.max(0, Math.min(
      data.length - 1,
      Math.round((relX - 8) / plotWidth * (data.length - 1)),
    ))
    const pt = data[idx]
    if (!pt) return
    setHover({ clientX: e.clientX, clientY: e.clientY, label: pt.month, value: pt[dataKey] })
  }

  return (
    <>
      <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-card/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Tooltip>
            <TooltipTrigger className="cursor-default text-muted-foreground/50 transition-colors hover:text-muted-foreground">
              {icon}
            </TooltipTrigger>
            <TooltipContent side="top">{tip}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tabular-nums leading-none ${scoreColor(score, max, primaryAtMax)}`}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground">/ {max}</span>
        </div>
        <div
          ref={ref}
          style={{ height: 44 }}
          className="[&_text]:fill-muted-foreground"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: 8 }}>
              <YAxis domain={[0, max]} hide />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {hover && createPortal(
        <div
          style={{
            position:      "fixed",
            left:          hover.clientX + 14 + 155 > window.innerWidth
                             ? hover.clientX - 169
                             : hover.clientX + 14,
            top:           Math.max(8, hover.clientY - 60),
            zIndex:        9999,
            pointerEvents: "none",
          }}
        >
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
            <p className="mb-1.5 text-xs font-semibold text-foreground">{hover.label}</p>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">{name}</span>
              <span className="ml-auto pl-4 text-xs font-semibold tabular-nums text-foreground">
                {hover.value}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | "projectName"
  | "totalScore"
  | "fieldwireScore"
  | "machinesScore"
  | "contractScore"
  | "systemsScore"

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OFIPage() {
  const now          = new Date()
  const currentYear  = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [year,      setYear]      = useState(String(currentYear))
  const [month,     setMonth]     = useState("")
  const [sortKey,   setSortKey]   = useState<SortKey>("totalScore")
  const [sortDir,   setSortDir]   = useState<"asc" | "desc">("desc")
  const [panelOpen, setPanelOpen] = useState(false)

  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar()
  const sidebarCollapsedByPanel = useRef(false)

  // When user manually re-expands the sidebar, close the panel (and forget the ref)
  useEffect(() => {
    if (sidebarOpen && panelOpen) {
      setPanelOpen(false)
      sidebarCollapsedByPanel.current = false
    }
  }, [sidebarOpen, panelOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function openPanel() {
    sidebarCollapsedByPanel.current = sidebarOpen // remember whether sidebar was open
    setSidebarOpen(false)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    if (sidebarCollapsedByPanel.current) {
      setSidebarOpen(true)
      sidebarCollapsedByPanel.current = false
    }
  }

  function togglePanel() {
    if (panelOpen) closePanel()
    else openPanel()
  }

  const { data: allData = [], isLoading } = useOfi(
    year ? { year: Number(year) } : undefined
  )

  // ── Current month live scoring ────────────────────────────────────────────
  // Fetch live whenever the current year is selected so sparklines and KPIs
  // are always consistent — no frozen DB snapshot mixed with real-time values.

  const isCurrentYear   = year === String(currentYear)
  const isCurrentPeriod = month === String(currentMonth) && isCurrentYear

  const { data: liveData } = useOfiLive(
    { month: currentMonth, year: currentYear },
    isCurrentYear,
  )

  // Replace the current month's DB records with live data so every downstream
  // computation (trend chart, KPIs, table) uses the same source of truth.
  const mergedData = useMemo(() => {
    if (!isCurrentYear || !liveData?.length) return allData
    return [
      ...allData.filter(r => r.referenceMonth !== currentMonth),
      ...liveData,
    ]
  }, [allData, isCurrentYear, currentMonth, liveData])

  // ── Filter options ────────────────────────────────────────────────────────

  const years = useMemo(() => {
    const set = new Set(allData.map(r => String(r.referenceYear)))
    set.add(String(currentYear))
    set.add(String(currentYear - 1))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [allData, currentYear])

  const availableMonths = useMemo(() => {
    const set = new Set(mergedData.map(r => r.referenceMonth))
    if (isCurrentYear) set.add(currentMonth)
    return Array.from(set).sort((a, b) => a - b)
  }, [mergedData, isCurrentYear, currentMonth])

  // ── Client-side month filter ──────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!month) return mergedData
    return mergedData.filter(r => r.referenceMonth === Number(month))
  }, [mergedData, month])

  const displayData = filtered

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!displayData.length)
      return { total: 0, fieldwire: 0, machines: 0, contract: 0, systems: 0 }
    const n = displayData.length
    return {
      total:     round2(displayData.reduce((s, r) => s + r.totalScore,     0) / n),
      fieldwire: round2(displayData.reduce((s, r) => s + r.fieldwireScore, 0) / n),
      machines:  round2(displayData.reduce((s, r) => s + r.machinesScore,  0) / n),
      contract:  round2(displayData.reduce((s, r) => s + r.contractScore,  0) / n),
      systems:   round2(displayData.reduce((s, r) => s + r.systemsScore,   0) / n),
    }
  }, [displayData])

  // ── Monthly trend ─────────────────────────────────────────────────────────

  const trendData = useMemo(() => {
    const map: Record<
      number,
      { sum: number; fw: number; mc: number; ct: number; sy: number; n: number }
    > = {}
    mergedData.forEach(r => {
      const m = r.referenceMonth
      if (!map[m]) map[m] = { sum: 0, fw: 0, mc: 0, ct: 0, sy: 0, n: 0 }
      map[m].sum += r.totalScore
      map[m].fw  += r.fieldwireScore
      map[m].mc  += r.machinesScore
      map[m].ct  += r.contractScore
      map[m].sy  += r.systemsScore
      map[m].n++
    })
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([m, v]) => ({
        month:     shortMonth(Number(m)),
        total:     round2(v.sum / v.n),
        fieldwire: round2(v.fw  / v.n),
        machines:  round2(v.mc  / v.n),
        contract:  round2(v.ct  / v.n),
        systems:   round2(v.sy  / v.n),
      }))
  }, [mergedData])

  // ── Aspect config ─────────────────────────────────────────────────────────

  const aspects: {
    key:   "fieldwire" | "machines" | "contract" | "systems"
    label: string
    color: string
    max:   number
    icon:  React.ReactNode
    tip:   string
  }[] = [
    {
      key: "fieldwire", label: "Fieldwire", color: "#3b82f6", max: 2,
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      tip:  "Task completion rate from Fieldwire checklists (max 2).",
    },
    {
      key: "machines", label: "Machines", color: "#10b981", max: 2,
      icon: <Truck className="h-3.5 w-3.5" />,
      tip:  "Proportion of equipment marked scheduled or dispensed (max 2).",
    },
    {
      key: "contract", label: "Contract", color: "#f59e0b", max: 2,
      icon: <FileText className="h-3.5 w-3.5" />,
      tip:  "Progress through required contract documentation steps (max 2).",
    },
    {
      key: "systems", label: "Systems", color: "#8b5cf6", max: 1,
      icon: <Layers className="h-3.5 w-3.5" />,
      tip:  "Systems readiness: Storage, QBTime and BuilderTrend (max 1).",
    },
  ]

  // ── Aspect bar data ───────────────────────────────────────────────────────

  const aspectData = [
    { name: "Fieldwire", pct: round2(kpis.fieldwire / 2 * 100) },
    { name: "Machines",  pct: round2(kpis.machines  / 2 * 100) },
    { name: "Contract",  pct: round2(kpis.contract  / 2 * 100) },
    { name: "Systems",   pct: round2(kpis.systems   / 1 * 100) },
  ]

  // ── Sorted table ──────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...displayData].sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number | string
      const bv = b[sortKey as keyof typeof b] as number | string
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ?  1 : -1
      return 0
    })
  }, [displayData, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const cursor = { fill: "currentColor", fillOpacity: 0.06 }
  const tick   = { fontSize: 11 }

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full flex-col gap-4">

        {/* ── Header ── */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Operational Forecast Index</h1>
              <p className="text-sm text-muted-foreground">
                Performance metrics across all forecast projects
              </p>
            </div>
            {isCurrentPeriod && (
              <span className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                Live
              </span>
            )}
          </div>

          <div className="flex items-end gap-3">

            {/* Period */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Period
              </span>
              <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
                <div className="flex items-center pl-2.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
                <Select
                  value={year}
                  onValueChange={v => { setYear(v ?? String(currentYear)); setMonth("") }}
                >
                  <SelectTrigger className="h-8 w-[68px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                    <span className="flex-1 truncate text-left text-sm">{year}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="h-5 w-px shrink-0 bg-border" />
                <Select
                  value={month || "all"}
                  onValueChange={v => setMonth(v === "all" ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="h-8 w-[130px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                    <span className="flex-1 truncate text-left text-sm">
                      {month ? fullMonth(Number(month)) : "All months"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={String(m)}>{fullMonth(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scores trigger */}
            <button
              onClick={togglePanel}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                panelOpen
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Project scores
            </button>
          </div>
        </div>

        {/* ── Body + score panel ── */}
        <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">

          {/* Scrollable content column */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">

            {/* ── Row 1: 5 metric cards side by side ── */}
            <div className="grid shrink-0 grid-cols-5 gap-3">
              <SparklineCard
                data={trendData}
                dataKey="total"
                name="OFI Total"
                max={7}
                score={kpis.total}
                label="OFI Total"
                tip="Average total score (max 7). Combines Fieldwire, Machines, Contract and Systems."
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                primaryAtMax
              />
              {aspects.map(a => (
                <SparklineCard
                  key={a.key}
                  data={trendData}
                  dataKey={a.key}
                  name={a.label}
                  max={a.max}
                  score={kpis[a.key]}
                  label={a.label}
                  tip={a.tip}
                  icon={a.icon}
                />
              ))}
            </div>

            {/* ── Row 2: OFI Score Trend (month by month) ── */}
            <div className="flex min-h-0 flex-[3] flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex shrink-0 items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">OFI Score Trend</span>
                <Tooltip>
                  <TooltipTrigger className="ml-auto cursor-default">
                    <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity hover:opacity-100" />
                  </TooltipTrigger>
                  <TooltipContent side="top">Average total OFI score per month (max 7).</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="ofiTotalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
                    <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 7]} ticks={[0, 1, 2, 3, 4, 5, 6, 7]} tick={tick} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<ChartTooltip />} cursor={cursor} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="OFI Total"
                      stroke="#3b82f6"
                      fill="url(#ofiTotalGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Row 3: Aspect comparison ── */}
            <div className="flex min-h-0 flex-[2] flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex shrink-0 items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Aspect Comparison</span>
                <Tooltip>
                  <TooltipTrigger className="ml-auto cursor-default">
                    <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity hover:opacity-100" />
                  </TooltipTrigger>
                  <TooltipContent side="top">Each aspect as % of its maximum score, all on the same scale.</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aspectData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
                    <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} tick={tick} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<ChartTooltip unit="%" />} cursor={cursor} />
                    <Bar dataKey="pct" name="Score" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* ── Project Scores Panel ── */}
          <div
            className={`flex shrink-0 flex-col overflow-hidden rounded-xl border transition-all duration-300 ease-in-out ${
              panelOpen
                ? "ml-4 max-w-[560px] border-border opacity-100"
                : "ml-0 max-w-0 border-transparent opacity-0"
            }`}
            style={{
              width: "max-content",
              backgroundColor: "color-mix(in oklab, var(--color-card) 60%, transparent)",
            }}
          >
            {/* Panel header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
              <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Project Scores</span>
              {displayData.length > 0 && (
                <span className="text-xs text-muted-foreground">· {displayData.length} projects</span>
              )}
              <button
                onClick={closePanel}
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Table: sticky header, full borders */}
            <div className="flex-1 overflow-y-auto">
              <Table className="[&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableHead
                      label="PROJECT"   sortKey="projectName"
                      current={sortKey} dir={sortDir} onSort={handleSort}
                    />
                    <SortableHead
                      label="TOT"       sortKey="totalScore"
                      current={sortKey} dir={sortDir} onSort={handleSort}
                      center tip="Combined OFI score (max 7)"
                    />
                    <SortableHead
                      label="FW"        sortKey="fieldwireScore"
                      current={sortKey} dir={sortDir} onSort={handleSort}
                      center tip="Fieldwire: task completion rate (max 2)"
                    />
                    <SortableHead
                      label="MC"        sortKey="machinesScore"
                      current={sortKey} dir={sortDir} onSort={handleSort}
                      center tip="Machines: equipment scheduling rate (max 2)"
                    />
                    <SortableHead
                      label="CT"        sortKey="contractScore"
                      current={sortKey} dir={sortDir} onSort={handleSort}
                      center tip="Contract: documentation steps completion (max 2)"
                    />
                    <SortableHead
                      label="SY"        sortKey="systemsScore"
                      current={sortKey} dir={sortDir} onSort={handleSort}
                      center tip="Systems: Storage, QBTime & BuilderTrend (max 1)"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">
                        No data for the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-[10px]">
                          {p.projectName}
                        </TableCell>
                        <TableCell className="px-1 text-center text-xs">
                          <span className={`font-semibold tabular-nums ${scoreColor(p.totalScore, 7, true)}`}>
                            {p.totalScore}
                          </span>
                        </TableCell>
                        <TableCell className="px-1 text-center text-xs">
                          <span className={scoreColor(p.fieldwireScore, 2)}>{p.fieldwireScore}</span>
                        </TableCell>
                        <TableCell className="px-1 text-center text-xs">
                          <span className={scoreColor(p.machinesScore, 2)}>{p.machinesScore}</span>
                        </TableCell>
                        <TableCell className="px-1 text-center text-xs">
                          <span className={scoreColor(p.contractScore, 2)}>{p.contractScore}</span>
                        </TableCell>
                        <TableCell className="px-1 text-center text-xs">
                          <span className={scoreColor(p.systemsScore, 1)}>{p.systemsScore}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

        </div>
      </div>
    </TooltipProvider>
  )
}

// ─── SortableHead ─────────────────────────────────────────────────────────────

function SortableHead({
  label, sortKey, current, dir, onSort, center = false, tip,
}: {
  label:   string
  sortKey: SortKey
  current: SortKey
  dir:     "asc" | "desc"
  onSort:  (k: SortKey) => void
  center?: boolean
  tip?:    string
}) {
  const inner = (
    <span className={`inline-flex items-center gap-1 ${center ? "justify-center" : ""}`}>
      {label}
      <ArrowUpDown
        className={`h-3 w-3 ${current === sortKey ? "text-foreground" : "text-muted-foreground/40"}`}
      />
    </span>
  )

  return (
    <TableHead
      className={`cursor-pointer select-none text-xs text-muted-foreground ${center ? "w-10 px-1 text-center" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      {tip ? (
        <Tooltip>
          <TooltipTrigger className={`inline-flex w-full items-center gap-1 ${center ? "justify-center" : ""}`}>
            {label}
            <ArrowUpDown
              className={`h-3 w-3 ${current === sortKey ? "text-foreground" : "text-muted-foreground/40"}`}
            />
          </TooltipTrigger>
          <TooltipContent side="top">{tip}</TooltipContent>
        </Tooltip>
      ) : inner}
    </TableHead>
  )
}
