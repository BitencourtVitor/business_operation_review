"use client"

import { useMemo, useState } from "react"
import { useProjectMonitoring } from "@/hooks/use-project-monitoring"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { FiltersBar } from "./_components/filters-bar"
import { DistributionChart } from "./_components/distribution-chart"
import { ProjectCarousel } from "./_components/project-carousel"
import {
  filterData,
  getAvailableMonths,
  getAvailableYears,
  getWeeksForPeriod,
  type FilterConfig,
  type GroupBy,
} from "./_lib/utils"

export default function ProjectMonitoringPage() {
  const { data: allData = [], isLoading } = useProjectMonitoring()

  // ── Filter state ───────────────────────────────────────────────────────────
  const currentYear = String(new Date().getFullYear())
  const [filters, setFilters] = useState<FilterConfig>({
    year:             currentYear,
    month:            "",
    week:             "",
    dateType:         "startDate",
    activeStatuses:   ["completed", "in_progress", "no_started"],
    selectedProjects: [],
    selectedTeams:    [],
  })
  const [groupBy, setGroupBy] = useState<GroupBy>("status")

  function updateFilter<K extends keyof FilterConfig>(key: K, value: FilterConfig[K]) {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset cascading dependents
      ...(key === "year"     ? { month: "", week: "" } : {}),
      ...(key === "month"    ? { week: "" }            : {}),
      ...(key === "dateType" ? { month: "", week: "" } : {}),
    }))
  }

  // ── Derived filter options ─────────────────────────────────────────────────
  const availableYears  = useMemo(() => getAvailableYears(allData, filters.dateType), [allData, filters.dateType])
  const availableMonths = useMemo(
    () => filters.year ? getAvailableMonths(allData, filters.dateType, filters.year) : [],
    [allData, filters.dateType, filters.year],
  )
  const availableWeeks  = useMemo(
    () => filters.year ? getWeeksForPeriod(Number(filters.year), filters.month ? Number(filters.month) : undefined) : [],
    [filters.year, filters.month],
  )
  const allProjects = useMemo(() => {
    const map = new Map<string, { jobSite: string; city: string }>()
    for (const p of allData) if (p.jobSite) map.set(p.jobSite, { jobSite: p.jobSite, city: p.city })
    return [...map.values()].sort((a, b) => a.jobSite.localeCompare(b.jobSite))
  }, [allData])
  const allTeams = useMemo(() => {
    const s = new Set(allData.map(p => p.team).filter(Boolean))
    return [...s].sort()
  }, [allData])

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredData = useMemo(() => filterData(allData, filters), [allData, filters])

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sublogo_hvac.png" alt="HVAC" className="h-5 w-5 object-contain" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HVAC Projects</h1>
          <p className="text-sm text-muted-foreground">Stage tracking and completion overview</p>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <FiltersBar
        filters={filters}
        onFilterChange={updateFilter}
        availableYears={availableYears}
        availableMonths={availableMonths}
        availableWeeks={availableWeeks}
        allProjects={allProjects}
        allTeams={allTeams}
      />

      {/* ── Distribution chart (pie + works list + table) ── */}
      <DistributionChart
        filteredData={filteredData}
        allData={allData}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        year={filters.year}
        month={filters.month}
        week={filters.week}
      />

      {/* ── Project cards carousel ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ProjectCarousel
          data={filteredData}
          allData={allData}
          groupBy={groupBy}
          year={filters.year}
          month={filters.month}
          week={filters.week}
        />
      </div>

    </div>
  )
}
