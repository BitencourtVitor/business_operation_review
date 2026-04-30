"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUpDown,
  Building2,
  CalendarDays,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Droplets,
  Flame,
  FolderOpen,
  GanttChartSquare,
  Hammer,
  Info,
  Layers,
  Loader2,
  Package2,
  PanelLeft,
  Triangle,
  Users2,
  Wind,
  X,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
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

// ─── Layout constants ─────────────────────────────────────────────────────────

const LEFT_W        = 240   // px – task label column (sticky left)
const ROW_H         = 34    // px – task row height
const YEAR_H        = 22    // px – year header row
const MONTH_H       = 24    // px – month header row
const PX_PER_DAY    = 3.5   // px per calendar day (~105 px/month)

// ─── Phase bar colours ────────────────────────────────────────────────────────

const PHASE_COLORS = [
  "#f59e0b","#ef4444","#a855f7","#3b82f6",
  "#06b6d4","#10b981","#f97316","#ec4899",
  "#84cc16","#6366f1","#14b8a6","#eab308",
]

// ─── Resource helpers ─────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  const l = s.replace(/[^a-zA-Z]/g, "")
  if (l.length > 1 && l === l.toUpperCase()) return s
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

const RES_COLORS: Array<{ match: RegExp; cls: string }> = [
  { match: /electrical|electric/i,           cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { match: /plumbing|plumb/i,                cls: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { match: /hvac|mechanical/i,               cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { match: /framing|framer/i,                cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { match: /drywall/i,                       cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { match: /sprinkler/i,                     cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { match: /fireproof|fire\s/i,              cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { match: /flatwork|concrete|foundation/i,  cls: "bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300" },
  { match: /tile|flooring/i,                 cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  { match: /paint/i,                         cls: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { match: /elevator/i,                      cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { match: /structural/i,                    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { match: /alum|door|window|glass/i,        cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  { match: /truss/i,                         cls: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300" },
  { match: /appliance/i,                     cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { match: /subs|subcontractor/i,            cls: "bg-muted text-muted-foreground" },
]
function resColor(r: string) {
  return RES_COLORS.find(e => e.match.test(r))?.cls ?? "bg-muted text-muted-foreground"
}

const RES_ICONS: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /electrical|electric/i,           icon: Zap },
  { match: /plumbing|plumb/i,                icon: Droplets },
  { match: /hvac|mechanical/i,               icon: Wind },
  { match: /framing|framer/i,                icon: Hammer },
  { match: /drywall/i,                       icon: Layers },
  { match: /sprinkler/i,                     icon: Droplets },
  { match: /fireproof|fire\s/i,              icon: Flame },
  { match: /flatwork|concrete|foundation/i,  icon: Layers },
  { match: /elevator/i,                      icon: ArrowUpDown },
  { match: /truss/i,                         icon: Triangle },
  { match: /appliance/i,                     icon: Package2 },
  { match: /alum|door|window/i,              icon: DoorOpen },
  { match: /structural/i,                    icon: Hammer },
  { match: /subs|subcontractor/i,            icon: Users2 },
  { match: /panel|insul/i,                   icon: PanelLeft },
]
function resIcon(r: string): LucideIcon | null {
  return RES_ICONS.find(e => e.match.test(r))?.icon ?? null
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// ─── Building dropdown ────────────────────────────────────────────────────────

type BuildingItem = { id: string; name: string; has_schedule?: boolean; task_count?: number | null; project_start?: string | null }

function BuildingDropdown({
  buildings, selectedId, onSelect, isLoading,
}: {
  buildings: BuildingItem[]
  selectedId: string | null
  onSelect:   (id: string) => void
  isLoading:  boolean
}) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)
  const selected        = buildings.find(b => b.id === selectedId)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background hover:bg-muted/40 transition-colors text-sm max-w-[220px]"
      >
        {isLoading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          : <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.name ?? "Select building"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] max-w-[280px] bg-popover border border-border rounded-md shadow-md z-50 py-1 max-h-64 overflow-y-auto">
          {buildings.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No buildings yet.</div>
          )}
          {buildings.map(b => (
            <button
              key={b.id}
              onClick={() => { onSelect(b.id); setOpen(false) }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                selectedId === b.id && "bg-primary/10 text-primary",
              )}
            >
              <div className="font-medium truncate">{b.name}</div>
              {b.has_schedule
                ? <div className="text-[11px] text-muted-foreground">{b.task_count ?? 0} tasks{b.project_start ? ` · ${b.project_start.slice(0,7)}` : ""}</div>
                : <div className="text-[11px] text-muted-foreground/50">No schedule</div>
              }
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Trades legend (icon + hover popover) ────────────────────────────────────

function TradesLegend({
  displayResources, resourceFilter, toggleResource, clearFilter,
}: {
  displayResources: string[]
  resourceFilter:   Set<string>
  toggleResource:   (r: string) => void
  clearFilter:      () => void
}) {
  const [open, setOpen] = useState(false)
  const active = resourceFilter.size > 0

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={cn(
          "relative flex items-center justify-center w-7 h-7 rounded-md border transition-colors",
          active
            ? "bg-primary/10 border-primary/40 text-primary"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40",
        )}
      >
        <Info className="h-3.5 w-3.5" />
        {active && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {resourceFilter.size}
          </span>
        )}
      </button>

      {open && displayResources.length > 0 && (
        <div className="absolute top-full right-0 mt-1.5 bg-popover border border-border rounded-lg shadow-xl z-50 p-3 w-[260px]">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Trades {active && `· ${resourceFilter.size} filtered`}
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            {displayResources.map(r => {
              const Icon   = resIcon(r)
              const isOn   = resourceFilter.has(r)
              return (
                <button
                  key={r}
                  onClick={() => toggleResource(r)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] transition-colors text-left",
                    isOn
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", resColor(r))}>
                    {Icon
                      ? <Icon className="h-3 w-3" />
                      : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0,2)}</span>
                    }
                  </span>
                  <span className="truncate">{toTitleCase(r)}</span>
                </button>
              )
            })}
          </div>
          {active && (
            <button
              onClick={clearFilter}
              className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border-t border-border pt-2"
            >
              <X className="h-3 w-3" /> Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Gantt viewer ─────────────────────────────────────────────────────────────

type MonthInfo = { label: string; year: number; startPx: number; pxWidth: number }

function GanttViewer({
  schedule,
  displayRows,
  visibleRows,
  hasKidsMap,
  expandedIds,
  toggleRow,
  rowPhaseIdx,
  resourceFilter,
}: {
  schedule:       ParsedSchedule
  displayRows:    ScheduleRow[]
  visibleRows:    ScheduleRow[]
  hasKidsMap:     Record<string, boolean>
  expandedIds:    Set<string>
  toggleRow:      (id: string) => void
  rowPhaseIdx:    Record<string, number>
  resourceFilter: Set<string>
}) {
  const ps = schedule.projectStart!
  const pf = schedule.projectFinish!

  // ── Drag-to-scroll ─────────────────────────────────────────────────────────
  const scrollRef  = useRef<HTMLDivElement>(null)
  const drag       = useRef({ on: false, startX: 0, scrollLeft: 0 })

  function onMouseDown(e: React.MouseEvent) {
    if (!scrollRef.current) return
    drag.current = { on: true, startX: e.pageX, scrollLeft: scrollRef.current.scrollLeft }
    scrollRef.current.style.cursor      = "grabbing"
    scrollRef.current.style.userSelect  = "none"
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current.on || !scrollRef.current) return
    scrollRef.current.scrollLeft = drag.current.scrollLeft - (e.pageX - drag.current.startX)
  }
  function onMouseUp() {
    drag.current.on = false
    if (scrollRef.current) {
      scrollRef.current.style.cursor     = "grab"
      scrollRef.current.style.userSelect = ""
    }
  }

  // ── Timeline geometry ──────────────────────────────────────────────────────
  const { months, yearGroups, timelineW } = useMemo(() => {
    const totalDays = Math.max(1, diffDays(ps, pf) + 1)
    const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    const mths: MonthInfo[] = []

    const cur = new Date(ps.getFullYear(), ps.getMonth(), 1)
    while (cur <= pf) {
      const next     = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const startDay = Math.max(0, diffDays(ps, cur))
      const endDay   = Math.min(totalDays, diffDays(ps, next))
      mths.push({
        label:   MO[cur.getMonth()],
        year:    cur.getFullYear(),
        startPx: startDay * PX_PER_DAY,
        pxWidth: Math.max(4, (endDay - startDay) * PX_PER_DAY),
      })
      cur.setMonth(cur.getMonth() + 1)
    }

    // Group by year
    const ygs: Array<{ year: number; startPx: number; pxWidth: number }> = []
    for (const m of mths) {
      const last = ygs[ygs.length - 1]
      if (!last || last.year !== m.year) ygs.push({ year: m.year, startPx: m.startPx, pxWidth: m.pxWidth })
      else last.pxWidth += m.pxWidth
    }

    return { months: mths, yearGroups: ygs, timelineW: totalDays * PX_PER_DAY }
  }, [ps, pf])

  const HEADER_H = YEAR_H + MONTH_H

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto cursor-grab select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="flex flex-col" style={{ minWidth: LEFT_W + timelineW }}>

        {/* ── Two-row sticky header ────────────────────────────────────────── */}
        <div className="sticky top-0 z-20">

          {/* Year row */}
          <div className="flex border-b border-border/60">
            <div
              className="sticky left-0 z-30 bg-background border-r border-border/60 shrink-0"
              style={{ width: LEFT_W, height: YEAR_H }}
            />
            {yearGroups.map((yg, i) => (
              <div
                key={i}
                className="shrink-0 flex items-center justify-center border-r border-border/40 bg-muted/30 text-[10px] font-semibold text-muted-foreground tracking-wide"
                style={{ width: yg.pxWidth, height: YEAR_H }}
              >
                {yg.pxWidth >= 40 ? yg.year : ""}
              </div>
            ))}
          </div>

          {/* Month row */}
          <div className="flex border-b border-border">
            <div
              className="sticky left-0 z-30 bg-background border-r border-border shrink-0 flex items-center px-3"
              style={{ width: LEFT_W, height: MONTH_H }}
            >
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Task</span>
            </div>
            {months.map((m, i) => (
              <div
                key={i}
                className="shrink-0 flex items-center justify-center border-r border-border/30 bg-muted/10 text-[10px] text-muted-foreground"
                style={{ width: m.pxWidth, height: MONTH_H }}
              >
                {m.pxWidth >= 26 ? m.label : m.label[0]}
              </div>
            ))}
          </div>
        </div>

        {/* ── Task rows ────────────────────────────────────────────────────── */}
        {visibleRows.map((row, i) => {
          const phaseColor = PHASE_COLORS[rowPhaseIdx[row.id] % PHASE_COLORS.length]
          const barAlpha   = row.isPhase ? 1 : row.level === 2 ? 0.85 : 0.65
          const barHPct    = row.isPhase ? 64 : row.level === 2 ? 50 : 38  // % of ROW_H
          const indent     = 8 + (row.level - 1) * 14

          const startPx = row.startDate
            ? Math.max(0, diffDays(ps, row.startDate) * PX_PER_DAY)
            : null
          const barW = row.startDate && row.finishDate
            ? Math.max(4, diffDays(row.startDate, row.finishDate) * PX_PER_DAY)
            : 0

          const TradeIcon = row.resources.length > 0 ? resIcon(row.resources[0]) : null

          // Dim rows whose trade is filtered-out
          const dimmed = resourceFilter.size > 0
            && !row.isPhase
            && row.resources.length > 0
            && !row.resources.some(r => resourceFilter.has(r))

          return (
            <div
              key={row.id}
              className={cn(
                "flex border-b border-border/20 transition-colors",
                i % 2 !== 0 && "bg-muted/[0.02]",
                "hover:bg-muted/[0.06]",
                dimmed && "opacity-25",
              )}
            >
              {/* Label — sticky left */}
              <div
                className="sticky left-0 z-10 bg-background border-r border-border/50 shrink-0 flex items-center gap-1 pr-2"
                style={{ width: LEFT_W, height: ROW_H, paddingLeft: indent }}
              >
                {hasKidsMap[row.id] ? (
                  <button
                    onClick={() => toggleRow(row.id)}
                    onMouseDown={e => e.stopPropagation()} // prevent drag hijack
                    className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {expandedIds.has(row.id)
                      ? <ChevronDown className="w-3 h-3" />
                      : <ChevronRight className="w-3 h-3" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="text-[10px] text-muted-foreground/40 font-mono w-5 text-right shrink-0">
                  {row.id}
                </span>
                <span
                  className={cn(
                    "text-[11px] truncate ml-1",
                    row.isPhase    && "font-semibold uppercase tracking-wide",
                    !row.isPhase && row.level === 2 && "font-medium",
                    row.isMilestone && "text-amber-500 dark:text-amber-400",
                  )}
                >
                  {row.isMilestone && <span className="mr-0.5">◆</span>}
                  {row.name}
                </span>
              </div>

              {/* Timeline area */}
              <div className="relative shrink-0" style={{ width: timelineW, height: ROW_H }}>

                {/* Month dividers */}
                {months.map((m, mi) => mi > 0 && (
                  <div
                    key={mi}
                    className="absolute top-0 bottom-0 w-px bg-border/15"
                    style={{ left: m.startPx }}
                  />
                ))}

                {/* Gantt bar */}
                {!row.isMilestone && startPx != null && barW > 0 && (
                  <div
                    className="absolute rounded-[3px] flex items-center overflow-hidden pointer-events-none"
                    style={{
                      left:            startPx,
                      top:             `${(100 - barHPct) / 2}%`,
                      width:           barW,
                      height:          `${barHPct}%`,
                      backgroundColor: phaseColor,
                      opacity:         barAlpha,
                      paddingLeft:     barW > 18 ? 5 : 0,
                      paddingRight:    barW > 18 ? 4 : 0,
                      gap:             3,
                    }}
                  >
                    {/* Name inside bar — phases + categories when wide enough */}
                    {(row.isPhase || row.level === 2) && barW > 52 && (
                      <span className="text-[10px] text-white font-semibold truncate flex-1 leading-none select-none">
                        {row.name}
                      </span>
                    )}
                    {/* Trade icon */}
                    {TradeIcon && barW > 20 && (
                      <TradeIcon className="h-2.5 w-2.5 text-white/80 shrink-0 ml-auto" />
                    )}
                  </div>
                )}

                {/* Milestone */}
                {row.isMilestone && startPx != null && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400 border border-amber-600 pointer-events-none"
                    style={{ left: startPx }}
                  />
                )}
              </div>
            </div>
          )
        })}

        {visibleRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No tasks match the current filter.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dates viewer (compact table, horizontal scroll) ─────────────────────────

function DatesViewer({
  visibleRows,
  hasKidsMap,
  expandedIds,
  toggleRow,
  rowPhaseIdx,
  resourceFilter,
}: {
  visibleRows:    ScheduleRow[]
  hasKidsMap:     Record<string, boolean>
  expandedIds:    Set<string>
  toggleRow:      (id: string) => void
  rowPhaseIdx:    Record<string, number>
  resourceFilter: Set<string>
}) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[640px] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center border-b border-border bg-muted/40 text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-[28px]">
          <div className="sticky left-0 z-20 bg-muted/40 border-r border-border/60 w-[280px] shrink-0 px-3">Task</div>
          <div className="w-[80px] shrink-0 text-center">Duration</div>
          <div className="w-[88px] shrink-0 text-center">Start</div>
          <div className="w-[88px] shrink-0 text-center">Finish</div>
          <div className="flex-1 min-w-[100px] pl-3">Trades</div>
        </div>

        {visibleRows.map((row, i) => {
          const phaseColor = PHASE_COLORS[rowPhaseIdx[row.id] % PHASE_COLORS.length]
          const indent     = 8 + (row.level - 1) * 14
          const dimmed     = resourceFilter.size > 0
            && !row.isPhase
            && row.resources.length > 0
            && !row.resources.some(r => resourceFilter.has(r))

          return (
            <div
              key={row.id}
              className={cn(
                "flex items-center border-b border-border/20 transition-colors min-h-[32px]",
                i % 2 !== 0 && "bg-muted/[0.02]",
                "hover:bg-muted/[0.06]",
                dimmed && "opacity-25",
              )}
            >
              <div
                className="sticky left-0 z-10 bg-background border-r border-border/50 w-[280px] shrink-0 flex items-center gap-1 py-1 pr-2"
                style={{ paddingLeft: indent }}
              >
                {row.isPhase && (
                  <span className="w-1 h-4 rounded-sm shrink-0 mr-0.5" style={{ backgroundColor: phaseColor }} />
                )}
                {hasKidsMap[row.id] ? (
                  <button onClick={() => toggleRow(row.id)}
                    className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground">
                    {expandedIds.has(row.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                ) : <span className="w-4 shrink-0" />}
                <span className="text-[10px] text-muted-foreground/40 font-mono w-5 text-right shrink-0">{row.id}</span>
                <span className={cn("text-[11px] truncate ml-1",
                  row.isPhase && "font-semibold uppercase tracking-wide",
                  !row.isPhase && row.level === 2 && "font-medium",
                  row.isMilestone && "text-amber-500")}>
                  {row.isMilestone && "◆ "}{row.name}
                </span>
              </div>
              <div className="w-[80px] shrink-0 text-center text-xs text-muted-foreground px-1">
                {row.isMilestone ? "◆" : row.durationText}
              </div>
              <div className="w-[88px] shrink-0 text-center text-xs text-muted-foreground">
                {fmtDateShort(row.startDate)}
              </div>
              <div className="w-[88px] shrink-0 text-center text-xs text-muted-foreground">
                {fmtDateShort(row.finishDate)}
              </div>
              <div className="flex-1 min-w-[100px] flex flex-wrap gap-0.5 px-3 py-1">
                {row.resources.slice(0, 5).map(r => {
                  const Icon = resIcon(r)
                  return (
                    <span key={r} title={toTitleCase(r)}
                      className={cn("flex items-center justify-center w-5 h-5 rounded", resColor(r))}>
                      {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0,2)}</span>}
                    </span>
                  )
                })}
                {row.resources.length > 5 && (
                  <span className="text-[9px] text-muted-foreground self-center">+{row.resources.length - 5}</span>
                )}
              </div>
            </div>
          )
        })}

        {visibleRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No tasks match the current filter.</div>
        )}
      </div>
    </div>
  )
}

// ─── Schedule viewer (shared state) ──────────────────────────────────────────

function ScheduleViewer({
  schedule,
  viewMode,
  displayResources: extDisplayResources,
  resourceFilter,
  toggleResource,
  clearFilter,
  controlsRef,
}: {
  schedule:          ParsedSchedule
  viewMode:          "gantt" | "dates"
  displayResources:  string[]
  resourceFilter:    Set<string>
  toggleResource:    (r: string) => void
  clearFilter:       () => void
  controlsRef?:      React.MutableRefObject<{ expandAll: () => void; collapseAll: () => void } | null>
}) {
  // Filter summary/rollup tasks (phases spanning >65% of project)
  const displayRows = useMemo(() => {
    const { projectStart: ps, projectFinish: pf } = schedule
    if (!ps || !pf) return schedule.rows
    const total = pf.getTime() - ps.getTime()
    if (total <= 0) return schedule.rows
    return schedule.rows.filter(r => {
      if (!r.isPhase || !r.startDate || !r.finishDate) return true
      return (r.finishDate.getTime() - r.startDate.getTime()) / total < 0.65
    })
  }, [schedule])

  const rowPhaseIdx = useMemo(() => {
    const map: Record<string, number> = {}
    let idx = -1
    for (const r of displayRows) { if (r.isPhase) idx++; map[r.id] = Math.max(0, idx) }
    return map
  }, [displayRows])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(displayRows.filter(r => r.isPhase || r.level === 1).map(r => r.id)),
  )

  // Expose controls to parent synchronously (safe: we only write, never read this ref for rendering)
  if (controlsRef) {
    controlsRef.current = {
      expandAll:   () => setExpandedIds(new Set(displayRows.map(r => r.id))),
      // empty set → getVisibleRows only shows level-1 (phase) rows since their children's
      // ancestors are not in expandedIds
      collapseAll: () => setExpandedIds(new Set()),
    }
  }

  function toggleRow(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const visibleRows = useMemo(
    () => getVisibleRows(displayRows, expandedIds, resourceFilter),
    [displayRows, expandedIds, resourceFilter],
  )
  const hasKidsMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    displayRows.forEach((_, i) => { m[displayRows[i].id] = hasChildren(displayRows, i) })
    return m
  }, [displayRows])

  const shared = { displayRows, visibleRows, hasKidsMap, expandedIds, toggleRow, rowPhaseIdx, resourceFilter }

  if (viewMode === "gantt" && schedule.projectStart && schedule.projectFinish) {
    return <GanttViewer schedule={schedule} {...shared} />
  }
  return <DatesViewer {...shared} />
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BuildingSchedulePage() {
  const { data: buildings = [], isLoading } = useBuildings()
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [viewMode, setViewMode]             = useState<"gantt" | "dates">("gantt")
  const [resourceFilter, setResourceFilter] = useState<Set<string>>(new Set())
  const scheduleControls = useRef<{ expandAll: () => void; collapseAll: () => void } | null>(null)

  const { data: scheduleResp, isLoading: loadingSchedule } = useBuildingSchedule(selectedId)

  const schedule = useMemo<ParsedSchedule | null>(() => {
    if (!scheduleResp?.schedule_data) return null
    return hydrateSchedule(scheduleResp.schedule_data)
  }, [scheduleResp])

  const selected = buildings.find(b => b.id === selectedId)

  // All unique resources from current schedule
  const displayResources = useMemo(
    () => schedule ? [...new Set(schedule.rows.flatMap(r => r.resources))].sort() : [],
    [schedule],
  )

  // Stats
  const stats = useMemo(() => {
    if (!schedule) return null
    const phases     = schedule.rows.filter(r => r.isPhase).length
    const milestones = schedule.rows.filter(r => r.isMilestone).length
    return { total: schedule.rows.length, phases, milestones }
  }, [schedule])

  function toggleResource(r: string) {
    setResourceFilter(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })
  }
  function clearFilter() { setResourceFilter(new Set()) }

  // Reset filter when building changes
  useEffect(() => { setResourceFilter(new Set()) }, [selectedId])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 pb-3">

        {/* Title */}
        <div>
          <h1 className="text-lg font-semibold leading-none">Building Schedule</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {selected && stats
              ? <>
                  {selected.name} · {stats.total} tasks · {stats.phases} phases
                  {schedule?.projectStart && schedule?.projectFinish && (
                    <> · {fmtDateFull(schedule.projectStart)} – {fmtDateFull(schedule.projectFinish)}</>
                  )}
                </>
              : "Track construction progress across all projects"
            }
          </p>
        </div>

        <div className="flex-1" />

        {/* ── All right-side controls — consistent h-7 ───────────────────── */}
        <div className="flex items-center gap-1.5">

          {/* Trades legend */}
          {schedule && displayResources.length > 0 && (
            <TradesLegend
              displayResources={displayResources}
              resourceFilter={resourceFilter}
              toggleResource={toggleResource}
              clearFilter={clearFilter}
            />
          )}

          {/* Gantt | Dates toggle */}
          {schedule && (
            <div className="flex items-center h-7 rounded-lg border border-border bg-muted/20 p-0.5">
              <button
                onClick={() => setViewMode("gantt")}
                className={cn(
                  "flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all",
                  viewMode === "gantt"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <GanttChartSquare className="h-3.5 w-3.5" />
                Gantt
              </button>
              <button
                onClick={() => setViewMode("dates")}
                className={cn(
                  "flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all",
                  viewMode === "dates"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Dates
              </button>
            </div>
          )}

          {/* Expand / Collapse */}
          {schedule && (
            <div className="flex items-center h-7 rounded-lg border border-border bg-muted/20 p-0.5">
              <button
                title="Expand all"
                onClick={() => scheduleControls.current?.expandAll()}
                className="flex items-center justify-center w-5 h-full rounded-md text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-sm transition-all"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </button>
              <button
                title="Collapse all"
                onClick={() => scheduleControls.current?.collapseAll()}
                className="flex items-center justify-center w-5 h-full rounded-md text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-sm transition-all"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Separator */}
          <div className="w-px h-5 bg-border/60" />

          {/* Building selector */}
          <BuildingDropdown
            buildings={buildings}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isLoading={isLoading}
          />

          {/* Manage — plain <a> to avoid asChild DOM prop warning */}
          <a
            href="/building-schedule/manage"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[min(var(--radius-md),12px)] bg-primary text-primary-foreground text-[0.8rem] font-medium hover:bg-primary/90 transition-colors shrink-0 select-none"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Manage
          </a>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border flex flex-col">

        {/* Empty — no building selected */}
        {!selectedId && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-10" />
              <p className="text-sm">Select a building to view its schedule</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {selectedId && loadingSchedule && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* No schedule */}
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

        {/* Schedule */}
        {schedule && (
          <ScheduleViewer
            schedule={schedule}
            viewMode={viewMode}
            displayResources={displayResources}
            resourceFilter={resourceFilter}
            toggleResource={toggleResource}
            clearFilter={clearFilter}
            controlsRef={scheduleControls}
          />
        )}
      </div>
    </div>
  )
}
