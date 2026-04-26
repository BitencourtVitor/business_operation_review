"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BarChartCard, DonutChartCard, LineChartCard, CHART_COLORS } from "@/components/charts"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { SearchableSelect } from "@/components/common/searchable-select"
import { useWorkforceData } from "@/hooks/use-workforce"
import type { WorkforceRow } from "@/services/workforce.service"
import { Calendar, MapPin, Users2, Wrench } from "lucide-react"
import { useMemo, useState } from "react"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const

const COMPANY_OPTIONS = [
  { value: "all", label: "All Companies" },
  { value: "Framing", label: "Framing" },
  { value: "PCG", label: "PCG" },
  { value: "HVAC", label: "HVAC" },
] as const

const TOP_N_OPTIONS = [5, 10, 15, 20] as const

const MONTH_SHORT: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHours(n: number | undefined | null): string {
  return (n ?? 0).toFixed(2)
}

function formatCurrency(n: number | undefined | null): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0)
}

/** Pretty-print a YYYY-MM key as "Oct 2025" */
function prettyMonth(ym: string): string {
  const [y, m] = ym.split("-")
  return `${MONTH_SHORT[m] ?? m} ${y}`
}

/**
 * Normalise referenceMonth coming from the API into YYYY-MM.
 * Accepts "2025-10", "October 2025", "Oct 2025", etc.
 */
function normaliseRefMonth(ref: string): string | null {
  if (!ref) return null
  // Already YYYY-MM
  const isoMatch = ref.match(/^(\d{4})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`

  // "Month(full/abbrev) Year"
  const monthNames = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
  ]
  const lower = ref.toLowerCase()
  for (let i = 0; i < monthNames.length; i++) {
    const full = monthNames[i]
    const abbr = full.slice(0, 3)
    if (lower.includes(full) || lower.startsWith(abbr)) {
      const yearMatch = ref.match(/\d{4}/)
      if (yearMatch) {
        return `${yearMatch[0]}-${String(i + 1).padStart(2, "0")}`
      }
    }
  }
  return null
}

/**
 * Derive the effective worktype for Chart 3.
 * - If worktype exists, use it.
 * - If no jobsite AND no lotBuilding, use client as worktype.
 * - Else "Normal Labor".
 */
function getWorktype(row: WorkforceRow): string {
  if (row.worktype) return row.worktype
  if (!row.jobsite && !row.lotBuilding) return row.client || "Normal Labor"
  return "Normal Labor"
}

// ---------------------------------------------------------------------------
// Custom Recharts tooltip
// ---------------------------------------------------------------------------

const hoursFormatter = (v: number) => formatHours(v)

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function WorkforcePage() {
  const [year, setYear] = useState<string>(String(CURRENT_YEAR))
  const [month, setMonth] = useState<string>("All")
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [selectedJobsites, setSelectedJobsites] = useState<string[]>([])
  const [selectedWorktypes, setSelectedWorktypes] = useState<string[]>([])
  const [topN, setTopN] = useState<number>(10)

  const { data: rawTimesheets, isLoading } = useWorkforceData()

  // ---- Available years derived from actual data ----
  const availableYears = useMemo(() => {
    if (!rawTimesheets) return [CURRENT_YEAR]
    const set = new Set<number>()
    rawTimesheets.forEach((r) => {
      const norm = normaliseRefMonth(r.referenceMonth)
      if (norm) set.add(parseInt(norm.split("-")[0]))
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [rawTimesheets])

  // ---- Available filter options (derived from data for the selected year) ----
  const yearFiltered = useMemo(() => {
    if (!rawTimesheets) return []
    return rawTimesheets.filter((row) => {
      if (row.worktype?.toLowerCase() === "service call") return false
      if (row.company?.toLowerCase() === "pcg" && row.client !== "Callahan") return false
      const norm = normaliseRefMonth(row.referenceMonth)
      if (norm && year !== "All" && !norm.startsWith(year)) return false
      return true
    })
  }, [rawTimesheets, year])

  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    yearFiltered.forEach((r) => {
      const norm = normaliseRefMonth(r.referenceMonth)
      if (norm) set.add(norm.split("-")[1])
    })
    return Array.from(set).sort()
  }, [yearFiltered])

  const availableClients = useMemo(() => {
    return [...new Set(yearFiltered.map((r) => r.client).filter(Boolean))].sort()
  }, [yearFiltered])

  const availableJobsites = useMemo(() => {
    return [...new Set(yearFiltered.map((r) => {
      if (r.jobsite && r.lotBuilding) return `${r.jobsite} - ${r.lotBuilding}`
      return r.jobsite || ""
    }).filter(Boolean))].sort()
  }, [yearFiltered])

  const availableWorktypes = useMemo(() => {
    return [...new Set(yearFiltered.map((r) => getWorktype(r)).filter(Boolean))].sort()
  }, [yearFiltered])

  // ---- Filtered data ----
  const filteredData = useMemo(() => {
    return yearFiltered.filter((row: WorkforceRow) => {
      // Month filter
      if (month !== "All") {
        const norm = normaliseRefMonth(row.referenceMonth)
        if (norm && !norm.endsWith(`-${month}`)) return false
      }
      // Client filter
      if (selectedClients.length > 0 && !selectedClients.includes(row.client)) return false
      // Jobsite filter
      if (selectedJobsites.length > 0) {
        const label = row.jobsite && row.lotBuilding ? `${row.jobsite} - ${row.lotBuilding}` : (row.jobsite || "")
        if (!selectedJobsites.includes(label)) return false
      }
      // Worktype filter
      if (selectedWorktypes.length > 0 && !selectedWorktypes.includes(getWorktype(row))) return false
      return true
    })
  }, [yearFiltered, month, selectedClients, selectedJobsites, selectedWorktypes])


  // ---- Chart 1: Total Hours by Month/Year ----
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of filteredData) {
      const key = normaliseRefMonth(row.referenceMonth) ?? "unknown"
      map.set(key, (map.get(key) ?? 0) + (row.regularHours ?? 0))
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, hours]) => ({ name: prettyMonth(key), value: hours }))
  }, [filteredData])

  // ---- Chart 2: Hours by Project ----
  const projectData = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of filteredData) {
      const project =
        row.jobsite && row.lotBuilding
          ? `${row.jobsite} - ${row.lotBuilding}`
          : row.jobsite || row.lotBuilding || row.client || "Unknown"
      map.set(project, (map.get(project) ?? 0) + (row.regularHours ?? 0))
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([name, hours]) => ({ name, value: hours }))
  }, [filteredData, topN])

  // ---- Chart 3: Hours by Service Type ----
  const worktypeData = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of filteredData) {
      const wt = getWorktype(row)
      map.set(wt, (map.get(wt) ?? 0) + (row.regularHours ?? 0))
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, hours]) => ({ name, value: hours }))
  }, [filteredData])

  // ---- Single project detection ----
  const isSingleProject = selectedJobsites.length === 1
  const activeProject = isSingleProject ? selectedJobsites[0] : null

  // ---- Single project: monthly data by worktype ----
  const projectMonthlyByWorktype = useMemo(() => {
    if (!isSingleProject) return []
    const map = new Map<string, { total: number; worktypes: Record<string, number>; employees: Set<string> }>()
    for (const row of filteredData) {
      const key = normaliseRefMonth(row.referenceMonth) ?? "unknown"
      if (!map.has(key)) map.set(key, { total: 0, worktypes: {}, employees: new Set() })
      const entry = map.get(key)!
      const hrs = row.regularHours ?? 0
      entry.total += hrs
      const wt = getWorktype(row)
      entry.worktypes[wt] = (entry.worktypes[wt] ?? 0) + hrs
      if (row.employeeName) entry.employees.add(row.employeeName)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ month: prettyMonth(key), total: v.total, ...v.worktypes, employeeCount: v.employees.size }))
  }, [filteredData, isSingleProject])

  const singleWorktypes = useMemo(() => {
    if (!isSingleProject) return []
    return [...new Set(filteredData.map((r) => getWorktype(r)))].sort()
  }, [filteredData, isSingleProject])

  // ---- Single project: worktype proportion (pie) ----
  const worktypePieData = useMemo(() => {
    if (!isSingleProject) return []
    const map = new Map<string, number>()
    for (const row of filteredData) {
      const wt = getWorktype(row)
      map.set(wt, (map.get(wt) ?? 0) + (row.regularHours ?? 0))
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
  }, [filteredData, isSingleProject])

  // ---- Single project: hours per employee ----
  const employeeMonthlyData = useMemo(() => {
    if (!isSingleProject) return { data: [] as any[], topEmployees: [] as string[] }
    const empTotals = new Map<string, number>()
    for (const row of filteredData) {
      if (!row.employeeName) continue
      empTotals.set(row.employeeName, (empTotals.get(row.employeeName) ?? 0) + (row.regularHours ?? 0))
    }
    const top5 = Array.from(empTotals.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name)
    const monthMap = new Map<string, Record<string, number>>()
    for (const row of filteredData) {
      if (!row.employeeName || !top5.includes(row.employeeName)) continue
      const key = normaliseRefMonth(row.referenceMonth) ?? "unknown"
      if (!monthMap.has(key)) monthMap.set(key, {})
      const entry = monthMap.get(key)!
      entry[row.employeeName] = (entry[row.employeeName] ?? 0) + (row.regularHours ?? 0)
    }
    const data = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, emps]) => ({ month: prettyMonth(key), ...emps }))
    return { data, topEmployees: top5 }
  }, [filteredData, isSingleProject])

  // ---- Loading state ----
  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ================================================================ */}
      {/* Title row: heading left, filters right                          */}
      {/* ================================================================ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workforce Productivity</h1>
          <p className="text-sm text-muted-foreground">Timesheet analysis and labor cost tracking</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Period */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Select value={year} onValueChange={(v) => { if (v) { setYear(v); setMonth("All") } }}>
                <SelectTrigger className="h-8 w-[72px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border" />
              <Select value={month} onValueChange={(v) => v && setMonth(v)}>
                <SelectTrigger className="h-8 w-[88px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  {availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>{MONTHS.find((x) => x.value === m)?.label ?? m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Client</span>
            <SearchableSelect
              value={selectedClients[0] ?? "All"}
              onValueChange={(v) => setSelectedClients(v === "All" ? [] : [v])}
              options={availableClients.map((c) => ({ value: c, label: c }))}
              icon={Users2}
              className=""
            />
          </div>

          {/* Jobsite */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Jobsite</span>
            <SearchableSelect
              value={selectedJobsites[0] ?? "All"}
              onValueChange={(v) => setSelectedJobsites(v === "All" ? [] : [v])}
              options={availableJobsites.map((j) => ({ value: j, label: j }))}
              icon={MapPin}
              className=""
            />
          </div>

          {/* Worktype */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Worktype</span>
            <SearchableSelect
              value={selectedWorktypes[0] ?? "All"}
              onValueChange={(v) => setSelectedWorktypes(v === "All" ? [] : [v])}
              options={availableWorktypes.map((w) => ({ value: w, label: w }))}
              icon={Wrench}
              className=""
            />
          </div>
        </div>
      </div>

      {isSingleProject ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LineChartCard
                title={`Hours: Total vs Worktype — ${activeProject}`}
                data={projectMonthlyByWorktype}
                lines={[
                  ...(singleWorktypes.length > 1 ? [{ dataKey: "total", color: "hsl(var(--foreground))", dashed: true }] : []),
                  ...singleWorktypes.map((wt, i) => ({ dataKey: wt, color: CHART_COLORS[i % CHART_COLORS.length] })),
                ]}
                valueFormatter={hoursFormatter}
              />
            </div>
            <DonutChartCard
              title="Work Type Proportion"
              data={worktypePieData}
              valueFormatter={hoursFormatter}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <LineChartCard
              title="Hours per Employee (Top 5)"
              data={employeeMonthlyData.data}
              lines={employeeMonthlyData.topEmployees.map((emp, i) => ({ dataKey: emp, color: CHART_COLORS[i % CHART_COLORS.length] }))}
              valueFormatter={hoursFormatter}
            />
            <BarChartCard
              title="Employee Count"
              data={projectMonthlyByWorktype.map((d) => ({ name: d.month, value: d.employeeCount }))}
              color="#10b981"
              valueFormatter={(v) => String(Math.round(v))}
            />
          </div>
        </>
      ) : (
        <>
          <BarChartCard
            title="Total Hours by Month/Year"
            data={monthlyData}
            valueFormatter={hoursFormatter}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChartCard
              title="Hours by Project"
              data={projectData}
              rotateLabels
              valueFormatter={hoursFormatter}
              header={
                <Select value={String(topN)} onValueChange={(v) => v && setTopN(Number(v))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue>{`Top ${topN}`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TOP_N_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <BarChartCard
              title="Hours by Service Type"
              data={worktypeData}
              multiColor
              rotateLabels
              valueFormatter={hoursFormatter}
            />
          </div>
        </>
      )}

      {/* No data table — BOR1 shows charts only */}
    </div>
  )
}
