"use client"

import { useMemo, useState } from "react"
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Filter,
  FolderOpen,
  GanttChartSquare,
  Loader2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useBuildings, useBuildingSchedule } from "@/hooks/use-buildings"
import {
  hydrateSchedule,
  getVisibleRows,
  hasChildren,
  fmtDateShort,
  fmtDateFull,
  type ScheduleRow,
  type ParsedSchedule,
} from "@/lib/pdf-schedule-parser"

// ─── Resource colour mapping ──────────────────────────────────────────────────

const RESOURCE_COLORS: Record<string, string> = {
  framing:     "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  hvac:        "bg-blue-100  text-blue-800  dark:bg-blue-900/40  dark:text-blue-300",
  plumbing:    "bg-cyan-100  text-cyan-800  dark:bg-cyan-900/40  dark:text-cyan-300",
  electrical:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  sprinkler:   "bg-red-100   text-red-800   dark:bg-red-900/40   dark:text-red-300",
  drywall:     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  flooring:    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  paint:       "bg-pink-100  text-pink-800  dark:bg-pink-900/40  dark:text-pink-300",
  flatwork:    "bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300",
  tile:        "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
}

function resourceColor(r: string): string {
  const key = Object.keys(RESOURCE_COLORS).find(k => r.toLowerCase().includes(k))
  return key ? RESOURCE_COLORS[key] : "bg-muted text-muted-foreground"
}

// ─── Gantt bar ────────────────────────────────────────────────────────────────

function GanttBar({
  row, projectStart, projectFinish,
}: {
  row: ScheduleRow; projectStart: Date; projectFinish: Date
}) {
  const totalMs = projectFinish.getTime() - projectStart.getTime()
  if (totalMs <= 0 || !row.startDate || !row.finishDate) return null

  const startPct = Math.max(0, (row.startDate.getTime() - projectStart.getTime()) / totalMs * 100)
  const endPct   = Math.min(100, (row.finishDate.getTime() - projectStart.getTime()) / totalMs * 100)
  const widthPct = Math.max(0.4, endPct - startPct)

  if (row.isMilestone) {
    return (
      <div className="relative h-full" style={{ marginLeft: `${startPct}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-amber-400 border border-amber-600" />
      </div>
    )
  }

  const barColor = row.isPhase
    ? "bg-indigo-500 dark:bg-indigo-600"
    : row.level === 2
    ? "bg-violet-400 dark:bg-violet-500"
    : "bg-sky-400 dark:bg-sky-500"

  return (
    <div className="relative h-full">
      <div
        className={cn("absolute top-1/2 -translate-y-1/2 rounded-[2px]", barColor)}
        style={{ left: `${startPct}%`, width: `${widthPct}%`, height: row.isPhase ? "55%" : "35%" }}
      />
    </div>
  )
}

// Month labels for the Gantt header
function GanttHeader({ projectStart, projectFinish }: { projectStart: Date; projectFinish: Date }) {
  const totalMs = projectFinish.getTime() - projectStart.getTime()
  if (totalMs <= 0) return null

  const months: { label: string; pct: number }[] = []
  const cursor = new Date(projectStart)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + 1)

  const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  while (cursor <= projectFinish) {
    const pct = (cursor.getTime() - projectStart.getTime()) / totalMs * 100
    months.push({ label: `${MO[cursor.getMonth()]} '${String(cursor.getFullYear()).slice(2)}`, pct })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return (
    <div className="relative h-full">
      {months.map((m, i) => (
        <span
          key={i}
          className="absolute text-[9px] text-muted-foreground -translate-x-1/2 top-0"
          style={{ left: `${m.pct}%` }}
        >
          {m.label}
        </span>
      ))}
    </div>
  )
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({
  row, hasKids, isExpanded, onToggle, projectStart, projectFinish, showGantt,
}: {
  row: ScheduleRow
  hasKids: boolean
  isExpanded: boolean
  onToggle: () => void
  projectStart: Date | null
  projectFinish: Date | null
  showGantt: boolean
}) {
  const indent = (row.level - 1) * 18

  const rowBg = row.isPhase
    ? "bg-muted/50 hover:bg-muted/70"
    : row.level === 2
    ? "bg-muted/20 hover:bg-muted/40"
    : "hover:bg-muted/30"

  return (
    <div className={cn("flex items-center border-b border-border text-sm transition-colors min-h-[34px]", rowBg)}>
      {/* Toggle + ID + Name */}
      <div
        className="flex items-center gap-1 min-w-0 flex-[2] py-1"
        style={{ paddingLeft: `${10 + indent}px`, paddingRight: "8px" }}
      >
        {hasKids ? (
          <button
            onClick={onToggle}
            className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="shrink-0 w-4" />
        )}
        <span className="shrink-0 text-muted-foreground/70 text-[11px] w-7 text-right mr-1.5 font-mono">
          {row.id}
        </span>
        <span
          className={cn(
            "truncate",
            row.isPhase && "font-semibold text-[11px] uppercase tracking-wide",
            row.level === 2 && "font-medium",
            row.isMilestone && "text-amber-600 dark:text-amber-400",
          )}
        >
          {row.isMilestone && <span className="mr-1 text-amber-500">◆</span>}
          {row.name}
        </span>
      </div>

      {/* Duration */}
      <div className="w-[76px] shrink-0 text-center text-xs text-muted-foreground px-1">
        {row.isMilestone ? <span className="text-amber-600 dark:text-amber-400">Milestone</span> : row.durationText}
      </div>

      {/* Start */}
      <div className="w-[84px] shrink-0 text-center text-xs text-muted-foreground">
        {fmtDateShort(row.startDate)}
      </div>

      {/* Finish */}
      <div className="w-[84px] shrink-0 text-center text-xs text-muted-foreground">
        {fmtDateShort(row.finishDate)}
      </div>

      {/* Resources */}
      <div className="w-[160px] shrink-0 flex flex-wrap gap-0.5 px-2 py-1">
        {row.resources.slice(0, 2).map(r => (
          <span key={r} className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium truncate max-w-[70px]", resourceColor(r))}>
            {r}
          </span>
        ))}
        {row.resources.length > 2 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
            +{row.resources.length - 2}
          </span>
        )}
      </div>

      {/* Gantt */}
      {showGantt && projectStart && projectFinish && (
        <div className="flex-1 min-w-0 h-[34px] relative px-1 border-l border-border/60">
          <GanttBar row={row} projectStart={projectStart} projectFinish={projectFinish} />
        </div>
      )}
    </div>
  )
}

// ─── Schedule viewer ──────────────────────────────────────────────────────────

function ScheduleViewer({ schedule }: { schedule: ParsedSchedule }) {
  const [expandedIds, setExpandedIds]       = useState<Set<string>>(() => {
    // Start with phase rows expanded
    return new Set(schedule.rows.filter(r => r.isPhase || r.level === 1).map(r => r.id))
  })
  const [resourceFilter, setResourceFilter] = useState<Set<string>>(new Set())
  const [showGantt, setShowGantt]           = useState(true)

  function toggleRow(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleResource(r: string) {
    setResourceFilter(prev => {
      const next = new Set(prev)
      next.has(r) ? next.delete(r) : next.add(r)
      return next
    })
  }

  const visibleRows = useMemo(
    () => getVisibleRows(schedule.rows, expandedIds, resourceFilter),
    [schedule.rows, expandedIds, resourceFilter],
  )

  const hasKidsMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    schedule.rows.forEach((_, i) => { m[schedule.rows[i].id] = hasChildren(schedule.rows, i) })
    return m
  }, [schedule.rows])

  const stats = useMemo(() => {
    const phases    = schedule.rows.filter(r => r.isPhase).length
    const milestones = schedule.rows.filter(r => r.isMilestone).length
    const tasks     = schedule.rows.length - phases - milestones
    return { total: schedule.rows.length, phases, milestones, tasks }
  }, [schedule.rows])

  function expandAll() {
    setExpandedIds(new Set(schedule.rows.filter(r => hasChildren(schedule.rows, schedule.rows.indexOf(r))).map(r => r.id)))
  }
  function collapseAll() {
    setExpandedIds(new Set(schedule.rows.filter(r => r.isPhase || r.level === 1).map(r => r.id)))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/10 text-xs text-muted-foreground shrink-0">
        <span>{stats.total} tasks total</span>
        <span>{stats.phases} phases</span>
        <span>{stats.milestones} milestones</span>
        {schedule.projectStart && schedule.projectFinish && (
          <span className="ml-auto">
            {fmtDateFull(schedule.projectStart)} → {fmtDateFull(schedule.projectFinish)}
          </span>
        )}
      </div>

      {/* Filter + controls bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/5 overflow-x-auto shrink-0">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground shrink-0">Trades:</span>
        {schedule.allResources.map(r => (
          <button
            key={r}
            onClick={() => toggleResource(r)}
            className={cn(
              "shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors",
              resourceFilter.has(r)
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
        {resourceFilter.size > 0 && (
          <button
            onClick={() => setResourceFilter(new Set())}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button onClick={expandAll}   className="text-xs text-muted-foreground hover:text-foreground">Expand all</button>
          <span className="text-border">|</span>
          <button onClick={collapseAll} className="text-xs text-muted-foreground hover:text-foreground">Collapse</button>
          <button
            onClick={() => setShowGantt(g => !g)}
            className={cn("ml-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors",
              showGantt ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
          >
            <GanttChartSquare className="w-3 h-3" />
            Timeline
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground shrink-0 min-h-[28px]">
        <div className="flex-[2] min-w-0 px-3">Task</div>
        <div className="w-[76px] shrink-0 text-center">Duration</div>
        <div className="w-[84px] shrink-0 text-center">Start</div>
        <div className="w-[84px] shrink-0 text-center">Finish</div>
        <div className="w-[160px] shrink-0 pl-2">Resources</div>
        {showGantt && (
          <div className="flex-1 min-w-0 pl-1 border-l border-border/60 h-full relative overflow-hidden">
            {schedule.projectStart && schedule.projectFinish && (
              <GanttHeader
                projectStart={schedule.projectStart}
                projectFinish={schedule.projectFinish}
              />
            )}
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {visibleRows.map(row => (
          <TaskRow
            key={row.id}
            row={row}
            hasKids={hasKidsMap[row.id] ?? false}
            isExpanded={expandedIds.has(row.id)}
            onToggle={() => toggleRow(row.id)}
            projectStart={schedule.projectStart}
            projectFinish={schedule.projectFinish}
            showGantt={showGantt}
          />
        ))}
        {visibleRows.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No tasks match the current filter.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BuildingSchedulePage() {
  const { data: buildings = [], isLoading } = useBuildings()
  const [selectedId, setSelectedId]         = useState<string | null>(null)

  const { data: scheduleResp, isLoading: loadingSchedule } =
    useBuildingSchedule(selectedId)

  const schedule = useMemo<ParsedSchedule | null>(() => {
    if (!scheduleResp?.schedule_data) return null
    return hydrateSchedule(scheduleResp.schedule_data)
  }, [scheduleResp])

  const selected = buildings.find(b => b.id === selectedId)

  return (
    <div className="flex h-full gap-0 overflow-hidden rounded-lg border border-border">
      {/* ── Building list ──────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 flex flex-col border-r border-border bg-muted/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border shrink-0">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Buildings</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && buildings.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No buildings yet.
              <br />
              <a href="/building-schedule/manage" className="text-primary hover:underline mt-1 block">
                Add one in Manage
              </a>
            </div>
          )}

          {buildings.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors text-sm",
                selectedId === b.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted/40 text-foreground",
              )}
            >
              <div className="font-medium truncate">{b.name}</div>
              {b.has_schedule ? (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {b.task_count ?? 0} tasks
                  {b.project_start && ` · ${b.project_start.slice(0, 7)}`}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground/60 mt-0.5">No schedule</div>
              )}
            </button>
          ))}
        </div>

        <div className="p-2 border-t border-border shrink-0">
          <a href="/building-schedule/manage">
            <Button variant="outline" size="sm" className="w-full text-xs">
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Manage
            </Button>
          </a>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          {selected ? (
            <>
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <h1 className="text-sm font-semibold">{selected.name}</h1>
                {selected.address && (
                  <p className="text-xs text-muted-foreground">{selected.address}</p>
                )}
              </div>
              {scheduleResp?.pdf_filename && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {scheduleResp.pdf_filename}
                </span>
              )}
            </>
          ) : (
            <h1 className="text-sm font-semibold text-muted-foreground">
              Select a building to view its schedule
            </h1>
          )}
        </div>

        {/* Content */}
        {!selectedId && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Choose a building from the list</p>
            </div>
          </div>
        )}

        {selectedId && loadingSchedule && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {selectedId && !loadingSchedule && !schedule && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="text-sm mb-2">No schedule uploaded yet.</p>
              <a href="/building-schedule/manage">
                <Button variant="outline" size="sm">Upload PDF in Manage</Button>
              </a>
            </div>
          </div>
        )}

        {schedule && <ScheduleViewer schedule={schedule} />}
      </div>
    </div>
  )
}
