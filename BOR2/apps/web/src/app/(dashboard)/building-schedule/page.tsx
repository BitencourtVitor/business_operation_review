"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  GanttChartSquare,
  Loader2,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuildings, useBuildingSchedule, useBuildingEvents } from "@/hooks/use-buildings"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { hydrateSchedule, fmtDateFull, type ParsedSchedule } from "@/lib/pdf-schedule-parser"
import type { ScheduleEvent } from "@/services/buildings.service"
import { applyEventsToSchedule } from "./_lib/schedule-utils"
import { BuildingDropdown } from "./_components/building-dropdown"
import { TradesLegend } from "./_components/trades-legend"
import { TradeControlModal } from "./_components/trade-control-modal"
import { AddEventModal } from "./_components/event-modals"
import { ScheduleViewer } from "./_components/schedule-viewer"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

export default function BuildingSchedulePage() {
  const { data: buildings = [], isLoading } = useBuildings()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"gantt" | "dates">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bs:viewMode")
      if (saved === "gantt" || saved === "dates") return saved
    }
    return "gantt"
  })
  const [filterYear,  setFilterYear]  = useState<number | null>(null)
  const [filterMonth, setFilterMonth] = useState<number | null>(null)
  const [controlOpen, setControlOpen] = useState(false)
  const [addingEvent, setAddingEvent] = useState(false)
  const scheduleControls = useRef<{ expandAll: () => void; collapseAll: () => void } | null>(null)

  useEffect(() => { localStorage.setItem("bs:viewMode", viewMode) }, [viewMode])

  const { data: scheduleResp, isLoading: loadingSchedule } = useBuildingSchedule(selectedId)
  const { data: buildingEvents = [] }                      = useBuildingEvents(selectedId)

  const activeEvents = useMemo<ScheduleEvent[]>(() => {
    if (!scheduleResp?.uploaded_at || !buildingEvents.length) return []
    const uploadDate = scheduleResp.uploaded_at.slice(0, 10)
    return buildingEvents.filter(ev => ev.days_delayed > 0 && ev.event_date >= uploadDate)
  }, [buildingEvents, scheduleResp?.uploaded_at])

  const schedule = useMemo<ParsedSchedule | null>(() => {
    if (!scheduleResp?.schedule_data) return null
    const raw = hydrateSchedule(scheduleResp.schedule_data)
    if (!scheduleResp.uploaded_at || buildingEvents.length === 0) return raw
    return applyEventsToSchedule(raw, buildingEvents, scheduleResp.uploaded_at)
  }, [scheduleResp, buildingEvents])

  const selected = buildings.find(b => b.id === selectedId)

  const displayResources = useMemo(
    () => schedule ? [...new Set(schedule.rows.flatMap(r => r.resources))].sort() : [],
    [schedule],
  )

  const stats = useMemo(() => {
    if (!schedule) return null
    const phases     = schedule.rows.filter(r => r.isPhase).length
    const milestones = schedule.rows.filter(r => r.isMilestone).length
    return { total: schedule.rows.length, phases, milestones }
  }, [schedule])

  const scheduleDateMap = useMemo(() => {
    if (!schedule) return { years: [] as number[], monthsByYear: {} as Record<number, number[]> }
    const yearSet = new Set<number>()
    const monthMap: Record<number, Set<number>> = {}
    for (const r of schedule.rows) {
      if (!r.startDate || !r.finishDate) continue
      const cur = new Date(r.startDate.getFullYear(), r.startDate.getMonth(), 1)
      const end = new Date(r.finishDate.getFullYear(), r.finishDate.getMonth(), 1)
      while (cur <= end) {
        const y = cur.getFullYear()
        const m = cur.getMonth()
        yearSet.add(y)
        if (!monthMap[y]) monthMap[y] = new Set()
        monthMap[y].add(m)
        cur.setMonth(cur.getMonth() + 1)
      }
    }
    const years = [...yearSet].sort((a, b) => a - b)
    const monthsByYear: Record<number, number[]> = {}
    for (const y of years) monthsByYear[y] = [...monthMap[y]].sort((a, b) => a - b)
    return { years, monthsByYear }
  }, [schedule])

  useEffect(() => { setFilterYear(null); setFilterMonth(null) }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="shrink-0 flex flex-col pb-2">

        {/* Row 1: Title + right controls */}
        <div className="flex items-end gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Building Schedule</h1>
            <p className="text-sm text-muted-foreground">Track construction progress across all projects</p>
          </div>

          <div className="flex-1" />

          {/* Building selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Building</span>
            <BuildingDropdown buildings={buildings} selectedId={selectedId} onSelect={setSelectedId} isLoading={isLoading} />
          </div>

          {/* Period filter */}
          {schedule && scheduleDateMap.years.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
              <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
                <div className="flex items-center pl-2.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <Select
                  value={filterYear != null ? String(filterYear) : "all"}
                  onValueChange={v => { setFilterYear(v === "all" ? null : Number(v)); setFilterMonth(null) }}
                >
                  <SelectTrigger className="h-8 w-[72px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                    <span className="flex-1 truncate text-left text-sm">{filterYear ?? "All"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {scheduleDateMap.years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="h-4 w-px bg-border" />
                <Select
                  value={filterMonth != null ? String(filterMonth) : "all"}
                  onValueChange={v => setFilterMonth(v === "all" ? null : Number(v))}
                  disabled={filterYear === null}
                >
                  <SelectTrigger className="h-8 w-[110px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                    <span className="flex-1 truncate text-left text-sm">
                      {filterMonth != null ? MONTHS[filterMonth] : "All months"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {(filterYear != null ? (scheduleDateMap.monthsByYear[filterYear] ?? []) : [])
                      .map(m => <SelectItem key={m} value={String(m)}>{MONTHS[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Our Work */}
          {schedule && (
            <button
              onClick={() => setControlOpen(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-input bg-transparent dark:bg-input/30 hover:bg-muted/80 transition-colors text-sm self-end"
            >
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">Our Work</span>
            </button>
          )}

          {/* + Event */}
          {selectedId && schedule && (
            <button
              onClick={() => setAddingEvent(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-input bg-transparent dark:bg-input/30 hover:bg-muted/80 transition-colors text-sm"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">Event</span>
            </button>
          )}

          {/* Manage */}
          <a
            href="/building-schedule/manage"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[min(var(--radius-md),12px)] bg-primary text-primary-foreground text-[0.8rem] font-medium hover:bg-primary/90 transition-colors shrink-0 select-none"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Manage
          </a>
        </div>

        {/* Modals */}
        {controlOpen && selectedId && schedule && (
          <TradeControlModal buildingId={selectedId} allResources={displayResources} onClose={() => setControlOpen(false)} />
        )}
        {addingEvent && selectedId && selected && (
          <AddEventModal buildingId={selectedId} buildingName={selected.name} onClose={() => setAddingEvent(false)} />
        )}

        {/* Row 2: Display controls */}
        {schedule && (
          <div className="flex items-center gap-2 mt-2 rounded-lg border border-border px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {stats && <>{stats.total} tasks · {stats.phases} phases</>}
              {schedule?.projectStart && schedule?.projectFinish && (
                <> · {fmtDateFull(schedule.projectStart)} – {fmtDateFull(schedule.projectFinish)}</>
              )}
            </span>

            <div className="flex-1" />

            {displayResources.length > 0 && (
              <TradesLegend displayResources={displayResources} />
            )}

            {/* Gantt | Dates toggle */}
            <div className="flex items-center h-7 rounded-lg border border-border bg-muted/20 p-0.5">
              <button
                onClick={() => setViewMode("gantt")}
                className={cn("flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all",
                  viewMode === "gantt" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <GanttChartSquare className="h-3.5 w-3.5" />Gantt
              </button>
              <button
                onClick={() => setViewMode("dates")}
                className={cn("flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all",
                  viewMode === "dates" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <CalendarDays className="h-3.5 w-3.5" />Dates
              </button>
            </div>

            {/* Expand / Collapse */}
            <div className="flex items-center h-7 rounded-lg border border-border bg-muted/20 p-0.5">
              <button
                onClick={() => scheduleControls.current?.expandAll()}
                className="flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />Expand
              </button>
              <button
                onClick={() => scheduleControls.current?.collapseAll()}
                className="flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />Collapse
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border flex flex-col"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-background) 75%, transparent)" }}
      >
        {!selectedId && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-10" />
              <p className="text-sm">Select a building to view its schedule</p>
            </div>
          </div>
        )}

        {selectedId && loadingSchedule && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {selectedId && !loadingSchedule && !schedule && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-sm mb-3">No schedule uploaded for {selected?.name}.</p>
              <a
                href="/building-schedule/manage"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[min(var(--radius-md),12px)] border border-input bg-background text-[0.8rem] font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Upload PDF in Manage
              </a>
            </div>
          </div>
        )}

        {schedule && (
          <ScheduleViewer
            schedule={schedule}
            buildingId={selectedId!}
            viewMode={viewMode}
            displayResources={displayResources}
            filterYear={filterYear}
            filterMonth={filterMonth}
            controlsRef={scheduleControls}
            activeEvents={activeEvents}
          />
        )}
      </div>
    </div>
  )
}
