"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowUpDown,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  DoorOpen,
  Send,
  Settings,
  X,
  CalendarX,
  CloudRain,
  Droplets,
  Flame,
  FolderOpen,
  GanttChartSquare,
  Hammer,
  Home,
  Info,
  LayoutGrid,
  Layers,
  Loader2,
  Logs,
  MessageSquare,
  Package2,
  Award,
  Compass,
  Gem,
  Pencil,
  Trash2,
  TrendingUp,
  User,
  PanelLeft,
  Triangle,
  TriangleAlert,
  Users2,
  UsersRound,
  Warehouse,
  Wind,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuildings, useBuildingSchedule, useBuildingEvents, useTradeOwnership, useUpsertTradeOwnership, useEventTypes, useEditBuildingEvent, useDeleteBuildingEvent } from "@/hooks/use-buildings"
import { Button } from "@/components/ui/button"
import { buildingsService, type RowComment, type ScheduleEvent } from "@/services/buildings.service"
import { useAuth } from "@/hooks/use-auth"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

// Light mode: darker shades → white text on top
const PHASE_COLORS_LIGHT = [
  "#d97706","#dc2626","#9333ea","#2563eb",
  "#0891b2","#059669","#ea580c","#db2777",
  "#65a30d","#4f46e5","#0d9488","#ca8a04",
]
// Dark mode: lighter/pastel shades → dark text on top
const PHASE_COLORS_DARK = [
  "#fbbf24","#f87171","#c084fc","#60a5fa",
  "#22d3ee","#34d399","#fb923c","#f472b6",
  "#a3e635","#818cf8","#2dd4bf","#facc15",
]

// ─── Resource helpers ─────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  const l = s.replace(/[^a-zA-Z]/g, "")
  if (l.length > 1 && l === l.toUpperCase()) return s
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// Single source of truth — same order in all three tables.
// Every trade has icon + color + bar-hex.
const TRADE_ENTRIES: Array<{
  match:    RegExp
  icon:     LucideIcon
  cls:      string          // badge bg + text (Tailwind)
}> = [
  { match: /electrical|electric/i,     icon: Zap,        cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { match: /plumbing|plumb/i,          icon: Droplets,   cls: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { match: /hvac|mechanical/i,         icon: Wind,       cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { match: /framer.*(ext|exterior)/i,  icon: Hammer,     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { match: /framer.*(int|interior)/i,  icon: PanelLeft,  cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { match: /framer.*shell/i,           icon: Building2,  cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200" },
  { match: /framing|framer/i,          icon: Hammer,     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { match: /drywall/i,                 icon: Layers,     cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { match: /sprinkler/i,               icon: Droplets,   cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { match: /fireproof|fire\s/i,        icon: Flame,      cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  { match: /flatwork|concrete|foundation/i, icon: Layers, cls: "bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300" },
  { match: /tile|flooring/i,           icon: Layers,     cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  { match: /paint/i,                   icon: Circle,     cls: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { match: /elevator/i,                icon: ArrowUpDown, cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { match: /structural/i,              icon: Triangle,   cls: "bg-stone-100 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300" },
  { match: /alum|door|window|glass/i,  icon: DoorOpen,   cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  { match: /truss/i,                   icon: Triangle,   cls: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300" },
  { match: /appliance/i,               icon: Package2,   cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { match: /panel|insul/i,             icon: PanelLeft,  cls: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300" },
  { match: /subs|subcontractor/i,      icon: Users2,     cls: "bg-muted text-muted-foreground" },
  { match: /lumber/i,                  icon: Logs,       cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" },
  { match: /pulte/i,                   icon: Home,       cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { match: /roof.shingle|shingle/i,    icon: Warehouse,  cls: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300" },
  { match: /\bscar\b/i,               icon: ClipboardList, cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  { match: /\bsales\b/i,              icon: TrendingUp, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { match: /\bunits?\b/i,             icon: LayoutGrid, cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { match: /client|owner/i,            icon: Briefcase,  cls: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
]
function resColor(r: string) {
  return TRADE_ENTRIES.find(e => e.match.test(r))?.cls ?? "bg-muted text-muted-foreground"
}
function resIcon(r: string): LucideIcon | null {
  return TRADE_ENTRIES.find(e => e.match.test(r))?.icon ?? null
}

// Bar fill colors — same order as TRADE_ENTRIES
const RES_BAR_HEX: Array<{ match: RegExp; dark: string; light: string }> = [
  { match: /electrical|electric/i,     dark: "#facc15", light: "#ca8a04" },
  { match: /plumbing|plumb/i,          dark: "#22d3ee", light: "#0891b2" },
  { match: /hvac|mechanical/i,         dark: "#60a5fa", light: "#2563eb" },
  { match: /framer.*(ext|exterior)/i,  dark: "#fbbf24", light: "#d97706" },
  { match: /framer.*(int|interior)/i,  dark: "#fb923c", light: "#ea580c" },
  { match: /framer.*shell/i,           dark: "#fde047", light: "#ca8a04" },
  { match: /framing|framer/i,          dark: "#fbbf24", light: "#d97706" },
  { match: /drywall/i,                 dark: "#4ade80", light: "#16a34a" },
  { match: /sprinkler/i,               dark: "#f87171", light: "#dc2626" },
  { match: /fireproof|fire\s/i,        dark: "#fda4af", light: "#e11d48" },
  { match: /flatwork|concrete|foundation/i, dark: "#a8a29e", light: "#78716c" },
  { match: /tile|flooring/i,           dark: "#c084fc", light: "#7c3aed" },
  { match: /paint/i,                   dark: "#f9a8d4", light: "#db2777" },
  { match: /elevator/i,                dark: "#818cf8", light: "#4f46e5" },
  { match: /structural/i,              dark: "#d6d3d1", light: "#57534e" },
  { match: /alum|door|window|glass/i,  dark: "#38bdf8", light: "#0284c7" },
  { match: /truss/i,                   dark: "#a3e635", light: "#65a30d" },
  { match: /appliance/i,               dark: "#34d399", light: "#059669" },
  { match: /panel|insul/i,             dark: "#94a3b8", light: "#475569" },
  { match: /subs|subcontractor/i,      dark: "#9ca3af", light: "#6b7280" },
  { match: /lumber/i,                  dark: "#d97706", light: "#b45309" },
  { match: /pulte/i,                   dark: "#818cf8", light: "#4f46e5" },
  { match: /roof.shingle|shingle/i,    dark: "#94a3b8", light: "#64748b" },
  { match: /\bscar\b/i,               dark: "#c084fc", light: "#9333ea" },
  { match: /\bsales\b/i,              dark: "#34d399", light: "#059669" },
  { match: /\bunits?\b/i,             dark: "#60a5fa", light: "#2563eb" },
  { match: /client|owner/i,            dark: "#2dd4bf", light: "#0d9488" },
]
function resBarColor(r: string, isDark: boolean): string | null {
  const entry = RES_BAR_HEX.find(e => e.match.test(r))
  return entry ? (isDark ? entry.dark : entry.light) : null
}

const TRADE_CATEGORIES: Array<{ label: string; match: RegExp }> = [
  { label: "Structure", match: /framing|framer|structural|truss|flatwork|concrete|foundation/i },
  { label: "MEP",       match: /electrical|electric|plumbing|plumb|hvac|mechanical|sprinkler|fireproof|fire\s|elevator/i },
  { label: "Finishing", match: /drywall|tile|flooring|paint|appliance/i },
  { label: "Envelope",  match: /alum|door|window|glass|panel|insul/i },
  { label: "Other",     match: /subs|subcontractor/i },
]
const CATEGORY_ORDER = TRADE_CATEGORIES.map(c => c.label)

function resCategory(r: string): string {
  return TRADE_CATEGORIES.find(c => c.match.test(r))?.label ?? "Other"
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function fmtDateNum(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ─── Event-based date adjustment ──────────────────────────────────────────────
//
// Rules (applied per event in chronological order):
//   - Task in progress (start < eventDate ≤ finish): only finish shifts
//   - Task not yet started (start ≥ eventDate):       both dates shift
//   - Task already finished (finish < eventDate):     no change
//
// Events before the schedule's uploaded_at are ignored — a new PDF upload
// is the source of truth; only events logged AFTER the upload apply.

function applyEventsToSchedule(
  schedule:   ParsedSchedule,
  events:     ScheduleEvent[],
  uploadedAt: string,
): ParsedSchedule {
  // Compare date-only (YYYY-MM-DD) to avoid timestamp precision issues:
  // uploaded_at is a full ISO timestamp; event_date is just a date string.
  const uploadDate = uploadedAt.slice(0, 10)

  const relevant = events
    .filter(ev => ev.days_delayed > 0 && ev.event_date >= uploadDate)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))

  if (relevant.length === 0) return schedule

  const rows = schedule.rows.map(r => ({ ...r }))

  for (const ev of relevant) {
    const eventDate = new Date(ev.event_date)
    const delayMs   = ev.days_delayed * 86_400_000

    for (const row of rows) {
      if (!row.startDate || !row.finishDate) continue

      if (row.startDate < eventDate && row.finishDate >= eventDate) {
        row.finishDate = new Date(row.finishDate.getTime() + delayMs)
      } else if (row.startDate >= eventDate) {
        row.startDate  = new Date(row.startDate.getTime()  + delayMs)
        row.finishDate = new Date(row.finishDate.getTime() + delayMs)
      }
    }
  }

  // Extend projectFinish to cover the latest adjusted finish
  let projectFinish = schedule.projectFinish
  for (const row of rows) {
    if (row.finishDate && (!projectFinish || row.finishDate > projectFinish)) {
      projectFinish = row.finishDate
    }
  }

  return { ...schedule, rows, projectFinish }
}

function commentRoleIcon(role: string): LucideIcon {
  if (role === "dev")                                               return Gem
  if (role === "owner")                                             return Compass
  if (role === "admin" || role === "manager" || role === "gestor")  return Award
  return User
}

function commentRoleColor(role: string): string {
  if (role === "dev")                                               return "text-yellow-400 dark:text-yellow-400"
  if (role === "owner")                                             return "text-emerald-500 dark:text-emerald-400"
  if (role === "admin" || role === "manager" || role === "gestor")  return "text-primary"
  return "text-muted-foreground"
}

function commentRoleBorder(role: string): string {
  if (role === "dev")                                               return "border-yellow-400/50"
  if (role === "owner")                                             return "border-emerald-400/50"
  if (role === "admin" || role === "manager" || role === "gestor")  return "border-primary/50"
  return "border-border"
}

function fmtCommentTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

// ─── Event row types & helpers ────────────────────────────────────────────────

type EventRow = ScheduleEvent & { _kind: "event" }
type ViewRow  = ScheduleRow   | EventRow

function isEventRow(r: ViewRow): r is EventRow { return "_kind" in r }

const EVENT_ROW_H = 24

const EV_ICON_MAP: Record<string, LucideIcon> = {
  "cloud-rain":     CloudRain,
  "snowflake":      Info,          // Snowflake not in lucide-react default set — fallback
  "calendar-x":     CalendarX,
  "wind":           Wind,
  "triangle-alert": TriangleAlert,
  "users-round":    UsersRound,
  "circle-help":    Info,
}

function EventTypeIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Icon = EV_ICON_MAP[name] ?? Info
  return <Icon className={className} style={style} />
}

// ─── Theme detection ─────────────────────────────────────────────────────────

function useIsDark() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  )
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"))
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return isDark
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
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-input bg-transparent dark:bg-input/30 hover:bg-muted/80 transition-colors text-sm max-w-[220px]"
      >
        {isLoading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          : <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.name ?? "Select building"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] max-w-[280px] bg-popover border border-border rounded-md shadow-md z-50 py-1.5 max-h-64 overflow-y-auto">
          {buildings.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No buildings yet.</div>
          )}
          {buildings.map(b => (
            <button
              key={b.id}
              onClick={() => { onSelect(b.id); setOpen(false) }}
              className={cn(
                "w-[calc(100%-12px)] text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors rounded-md mx-1.5",
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

function TradesLegend({ displayResources }: { displayResources: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors">
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && displayResources.length > 0 && (() => {
        const groupMap = new Map<string, string[]>()
        for (const r of displayResources) {
          const cat = resCategory(r)
          if (!groupMap.has(cat)) groupMap.set(cat, [])
          groupMap.get(cat)?.push(r)
        }
        const groups = CATEGORY_ORDER.filter(l => groupMap.has(l)).map(l => ({ label: l, items: groupMap.get(l)! }))
        return (
          <div className="absolute top-full right-0 mt-1.5 bg-popover border border-border rounded-lg shadow-xl z-50 p-4 w-[560px] max-h-[75vh] overflow-y-auto">
            {/* Chart indicators */}
            <div className="mb-4 pb-4 border-b border-border/50">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Chart</div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: "Project start", line: "#10b981" },
                  { label: "Project end",   line: "#f43f5e" },
                  { label: "Today",         line: "rgba(255,255,255,0.35)" },
                  { label: "Current month", bg: true },
                ].map(({ label, line, bg }) => (
                  <div key={label} className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                    <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-muted/30">
                      {bg
                        ? <span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/40" />
                        : <span className="h-3" style={{ borderLeft: `1px dashed ${line}` }} />
                      }
                    </span>
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Trades</div>
            <div className="flex flex-col gap-4">
              {groups.map(({ label, items }) => (
                <div key={label}>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5 px-1">{label}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {items.map(r => {
                      const Icon = resIcon(r)
                      return (
                        <div key={r} className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground min-w-0">
                          <span className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", resColor(r))}>
                            {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0, 2)}</span>}
                          </span>
                          <span className="truncate min-w-0 flex-1">{toTitleCase(r)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Row meta ─────────────────────────────────────────────────────────────────

type RowMeta = {
  status:      'pending' | 'done'
  observation: string
  real_start:  string | null
  real_finish: string | null
  is_finished: boolean
}

// ─── Gantt viewer ─────────────────────────────────────────────────────────────

type MonthInfo = { label: string; year: number; startPx: number; pxWidth: number }

function GanttViewer({
  schedule,
  displayRows,
  visibleRows,
  mergedRows,
  hasKidsMap,
  expandedIds,
  toggleRow,
  rowPhaseIdx,
  phaseColors,
  oursSet,
  rowMetas,
  onMetaChange,
  buildingId,
  currentUserName,
  commentsMap,
  setCommentsMap,
  filterYear,
  filterMonth,
  onEditEvent,
  onDeleteEvent,
}: {
  schedule:       ParsedSchedule
  displayRows:    ScheduleRow[]
  visibleRows:    ScheduleRow[]
  mergedRows:     ViewRow[]
  hasKidsMap:     Record<string, boolean>
  expandedIds:    Set<string>
  toggleRow:      (id: string) => void
  rowPhaseIdx:    Record<string, number>
  phaseColors:    string[]
  oursSet:         Set<string>
  rowMetas:        Map<string, RowMeta>
  onMetaChange:    (rowId: string, patch: Partial<RowMeta>) => void
  buildingId:      string
  currentUserName: string
  commentsMap:     Map<string, RowComment[]>
  setCommentsMap:  React.Dispatch<React.SetStateAction<Map<string, RowComment[]>>>
  filterYear:      number | null
  filterMonth:     number | null
  onEditEvent:     (ev: ScheduleEvent) => void
  onDeleteEvent:   (ev: ScheduleEvent) => void
}) {
  const { user: currentUser } = useAuth()

  const ps     = schedule.projectStart!
  const pf     = schedule.projectFinish!
  const isDark = useIsDark()

  // ── Row hover + lock ───────────────────────────────────────────────────────
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [lockedRowId,  setLockedRowId]  = useState<string | null>(null)

  // ── Comments ────────────────────────────────────────────────────────────────
  const [commentsRowId,    setCommentsRowId]    = useState<string | null>(null)
  const [newComment,       setNewComment]       = useState("")
  const [submitting,       setSubmitting]       = useState(false)
  const [editingCommentId,   setEditingCommentId]   = useState<string | null>(null)
  const [editBody,           setEditBody]           = useState("")
  const [deletingCommentId,  setDeletingCommentId]  = useState<string | null>(null)
  const commentsButtonsRef = useRef<HTMLDivElement>(null)
  const commentsPopupRef   = useRef<HTMLDivElement>(null)
  const newCommentRef      = useRef<HTMLTextAreaElement>(null)
  const [popupPos, setPopupPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  useEffect(() => {
    if (!commentsRowId) return
    const handler = (e: MouseEvent) => {
      if (
        !commentsButtonsRef.current?.contains(e.target as Node) &&
        !commentsPopupRef.current?.contains(e.target as Node)
      ) {
        setCommentsRowId(null)
        setLockedRowId(null)
        setNewComment("")
        setDeletingCommentId(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [commentsRowId])

  useLayoutEffect(() => {
    if (!commentsRowId || !commentsButtonsRef.current) { setPopupPos(null); return }
    const rect    = commentsButtonsRef.current.getBoundingClientRect()
    const POPUP_H = 320
    const GAP     = 12
    const MARGIN  = 8
    const midY    = rect.top + rect.height / 2
    const centered = midY - POPUP_H / 2
    const right   = window.innerWidth - rect.left + GAP

    if (centered >= MARGIN && centered + POPUP_H <= window.innerHeight - MARGIN) {
      setPopupPos({ top: centered, right })                           // centered fits — use top
    } else if (midY >= window.innerHeight / 2) {
      setPopupPos({ bottom: window.innerHeight - rect.bottom, right }) // lower half — CSS bottom anchors popup-bottom to button-bottom
    } else {
      setPopupPos({ top: Math.min(rect.top, window.innerHeight - POPUP_H - MARGIN), right }) // upper half — top anchored
    }
  }, [commentsRowId])

  function openComments(rowId: string) {
    setCommentsRowId(rowId)
    setLockedRowId(rowId)
    setNewComment("")
  }

  async function submitComment(rowId: string) {
    const text = newComment.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const comment = await buildingsService.addRowComment(buildingId, rowId, text, currentUserName, currentUser?.role ?? "")
      setCommentsMap(prev => {
        const next = new Map(prev)
        const list = next.get(rowId) ?? []
        next.set(rowId, [...list, comment!])
        return next
      })
      setNewComment("")
      if (newCommentRef.current) newCommentRef.current.style.height = "auto"
    } catch {}
    setSubmitting(false)
  }

  async function saveEditComment(rowId: string, commentId: string) {
    const text = editBody.trim()
    if (!text) return
    try {
      const updated = await buildingsService.editRowComment(buildingId, commentId, text)
      setCommentsMap(prev => {
        const next = new Map(prev)
        next.set(rowId, (next.get(rowId) ?? []).map(c => c.id === commentId ? { ...c, body: updated?.body } : c))
        return next
      })
    } catch {}
    setEditingCommentId(null)
    setEditBody("")
  }

  async function removeComment(rowId: string, commentId: string) {
    // Optimistic removal
    setCommentsMap(prev => {
      const next = new Map(prev)
      next.set(rowId, (next.get(rowId) ?? []).filter(c => c.id !== commentId))
      return next
    })
    try {
      await buildingsService.deleteRowComment(buildingId, commentId)
    } catch {
      // Rollback not implemented — re-fetch on next open
    }
  }

  // ── Drag-to-scroll ─────────────────────────────────────────────────────────
  const scrollRef  = useRef<HTMLDivElement>(null)
  const drag       = useRef({ on: false, startX: 0, scrollLeft: 0 })

  // ── Container width (for dynamic px/day when filtered) ─────────────────────
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerW(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Row virtualizer ─────────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count:            mergedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     (i) => isEventRow(mergedRows[i]) ? EVENT_ROW_H : ROW_H,
    overscan:         10,
  })
  const [scrollLeft, setScrollLeft] = useState(0)

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
  const { months, yearGroups, timelineW, timelineStart, pxPerDay } = useMemo(() => {
    const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

    const tStart = filterYear != null
      ? filterMonth != null
        ? new Date(filterYear, filterMonth, 1)
        : new Date(filterYear, 0, 1)
      : new Date(ps.getFullYear(), ps.getMonth(), 1)

    const tEnd = filterYear != null
      ? filterMonth != null
        ? new Date(filterYear, filterMonth + 1, 0)
        : new Date(filterYear, 11, 31)
      : new Date(pf.getFullYear(), pf.getMonth() + 1, 0)

    const totalDays = Math.max(1, diffDays(tStart, tEnd) + 1)
    const availableW = containerW - LEFT_W
    const ppd = (filterYear != null && containerW > 0)
      ? Math.max(PX_PER_DAY, availableW / totalDays)
      : PX_PER_DAY

    const mths: MonthInfo[] = []
    const cur = new Date(tStart)
    while (cur <= tEnd) {
      const next      = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const startDay  = diffDays(tStart, cur)
      const daysInMth = diffDays(cur, next)
      mths.push({
        label:   MO[cur.getMonth()],
        year:    cur.getFullYear(),
        startPx: startDay * ppd,
        pxWidth: Math.max(4, daysInMth * ppd),
      })
      cur.setMonth(cur.getMonth() + 1)
    }

    const ygs: Array<{ year: number; startPx: number; pxWidth: number }> = []
    for (const m of mths) {
      const last = ygs[ygs.length - 1]
      if (!last || last.year !== m.year) ygs.push({ year: m.year, startPx: m.startPx, pxWidth: m.pxWidth })
      else last.pxWidth += m.pxWidth
    }

    return { months: mths, yearGroups: ygs, timelineW: totalDays * ppd, timelineStart: tStart, pxPerDay: ppd }
  }, [ps, pf, filterYear, filterMonth, containerW])

  const _HEADER_H    = YEAR_H + MONTH_H
  const startLinePx = diffDays(timelineStart, ps) * pxPerDay
  const endLinePx   = diffDays(timelineStart, pf) * pxPerDay
  const today       = new Date(); today.setHours(0,0,0,0)
  const todayPx     = diffDays(timelineStart, today) * pxPerDay
  const todayInRange = today >= timelineStart && today <= pf
  const _MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const currentMonthInfo = months.find(m => m.year === today.getFullYear() && m.label === _MO[today.getMonth()])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto cursor-grab select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)}
    >
      <div className="relative flex flex-col" style={{ minWidth: LEFT_W + timelineW }}>

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
            {months.map((m, i) => {
              const isCurrentMonth = m.year === today.getFullYear() && m.label === ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]
              return (
                <div
                  key={i}
                  className={cn(
                    "shrink-0 flex items-center justify-center border-r border-border/30 text-[10px]",
                    isCurrentMonth
                      ? "bg-primary/10 text-primary font-semibold"
                      : "bg-muted/10 text-muted-foreground",
                  )}
                  style={{ width: m.pxWidth, height: MONTH_H }}
                >
                  {m.pxWidth >= 26 ? m.label : m.label[0]}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Task rows ────────────────────────────────────────────────────── */}
        <TooltipProvider>
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>

        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const item = mergedRows[virtualRow.index]

          // ── Event row (thinner, colored) ──────────────────────────────────
          if (isEventRow(item)) {
            const evDatePx = Math.max(0, diffDays(timelineStart, new Date(item.event_date + "T12:00:00")) * pxPerDay)
            const label = item.notes
              ? item.notes
              : new Date(item.event_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
            const evBg     = item.type_color + (isDark ? "0d" : "18")
            const evBgStrip = item.type_color + (isDark ? "08" : "0d")
            return (
              <div
                key={`ev-${item.id}`}
                className="group/evrow"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: EVENT_ROW_H, transform: `translateY(${virtualRow.start}px)` }}
              >
                {/* Left sticky label */}
                <div
                  className="sticky left-0 z-30 border-r border-border/30 shrink-0 flex items-center gap-1.5 pl-2 pr-1 overflow-hidden"
                  style={{ width: LEFT_W, height: EVENT_ROW_H, backgroundColor: evBg, borderLeftColor: item.type_color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
                >
                  <EventTypeIcon name={item.type_icon} className="h-3 w-3 shrink-0" style={{ color: item.type_color }} />
                  {item.type_name !== "Other" && (
                    <span className="text-[10px] font-semibold shrink-0" style={{ color: item.type_color }}>{item.type_name}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">{label}</span>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/evrow:opacity-100 transition-opacity">
                    <button onClick={() => onEditEvent(item)} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={() => onDeleteEvent(item)} className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
                {/* Timeline: tinted strip + marker at event date */}
                <div className="absolute inset-0 overflow-hidden" style={{ left: LEFT_W }}>
                  <div className="absolute inset-0" style={{ backgroundColor: evBgStrip }} />
                  <div className="absolute top-0 bottom-0 w-px" style={{ left: evDatePx, backgroundColor: item.type_color, opacity: 0.55 }} />
                </div>
              </div>
            )
          }

          const row = item
          const phaseColor = phaseColors[rowPhaseIdx[row.id] % phaseColors.length]
          const barColor   = row.resources.length > 0
            ? (resBarColor(row.resources[0], isDark) ?? phaseColor)
            : phaseColor
          const barAlpha   = row.isPhase ? 1 : row.level === 2 ? 0.85 : 0.65
          const barHPct    = row.isPhase ? 64 : row.level === 2 ? 50 : 38
          const indent     = 8 + (row.level - 1) * 14

          const startPx = row.startDate
            ? Math.max(0, diffDays(timelineStart, row.startDate) * pxPerDay)
            : null
          const barW = row.startDate && row.finishDate
            ? Math.max(4, diffDays(row.startDate, row.finishDate) * pxPerDay)
            : 0

          const TradeIcon = row.resources.length > 0 ? resIcon(row.resources[0]) : null

          const meta           = rowMetas.get(row.id)
          const isDone         = meta?.status === 'done'
          const isOurs         = !isDone && row.resources.some(r => oursSet.has(r))
          const isRowActive    = hoveredRowId === row.id || lockedRowId === row.id
          const isCommentsOpen = commentsRowId === row.id
          const rowComments    = commentsMap.get(row.id) ?? []
          const hasComments    = commentsMap.has(row.id) && rowComments.length > 0

          return (
            <div
              key={row.id}
              className={cn(
                "group flex border-b border-border/20 transition-colors",
                isDone
                  ? "bg-green-500/[0.05] hover:bg-green-500/[0.09]"
                  : isOurs
                    ? "bg-foreground/[0.09] hover:bg-foreground/[0.14]"
                    : cn(virtualRow.index % 2 !== 0 && "bg-muted/[0.02]", "hover:bg-muted/[0.06]"),
              )}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: ROW_H, transform: `translateY(${virtualRow.start}px)` }}
              onMouseEnter={() => setHoveredRowId(row.id)}
              onMouseLeave={() => setHoveredRowId(null)}
            >
              {/* ── Label — sticky left ─────────────────────────────────── */}
              <div
                className={cn(
                  "sticky left-0 z-30 border-r border-border/50 shrink-0 flex items-center gap-1 pr-1 overflow-hidden group-hover:overflow-visible",
                  (isDone || isOurs) ? "bg-transparent" : "bg-background",
                  isOurs && "border-l-2 border-l-foreground/50",
                )}
                style={{ width: LEFT_W, height: ROW_H, paddingLeft: isOurs ? Math.max(0, indent - 2) : indent }}
              >
                {hasKidsMap[row.id] ? (
                  <button
                    onClick={() => toggleRow(row.id)}
                    onMouseDown={e => e.stopPropagation()}
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
                {isOurs && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_black.png" alt="" aria-hidden className="shrink-0 h-3 w-3 object-contain opacity-60 dark:hidden" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_white.png" alt="" aria-hidden className="hidden shrink-0 h-3 w-3 object-contain opacity-60 dark:block" />
                  </>
                )}

                <span
                  className={cn(
                    "text-[11px] ml-1 whitespace-nowrap",
                    isRowActive
                      ? cn("relative z-10 pr-1 overflow-visible", !isDone && "bg-background")
                      : "overflow-hidden text-ellipsis flex-1 min-w-0",
                    row.isPhase     && "font-semibold uppercase tracking-wide",
                    !row.isPhase && row.level === 2 && "font-medium",
                    row.isMilestone && "text-amber-500 dark:text-amber-400",
                  )}
                >
                  {row.isMilestone && <span className="mr-0.5">◆</span>}
                  {row.name}
                </span>
              </div>

              {/* ── Timeline area ──────────────────────────────────────── */}
              <div className="relative shrink-0" style={{ width: timelineW, height: ROW_H }}>

                {currentMonthInfo && (
                  <div
                    className="absolute top-0 bottom-0 bg-primary/[0.08] pointer-events-none"
                    style={{ left: currentMonthInfo.startPx, width: currentMonthInfo.pxWidth }}
                  />
                )}

                {months.map((m, mi) => mi > 0 && (
                  <div key={mi} className="absolute top-0 bottom-0 w-px bg-border/15" style={{ left: m.startPx }} />
                ))}

                {/* Gantt bar */}
                {!row.isMilestone && startPx != null && barW > 0 && (
                  <div
                    className="absolute rounded-[3px] overflow-hidden pointer-events-none"
                    style={{
                      left:            startPx,
                      top:             `${(100 - barHPct) / 2}%`,
                      width:           barW,
                      height:          `${barHPct}%`,
                      backgroundColor: barColor,
                      opacity:         barAlpha,
                    }}
                  >
                    {(row.isPhase || row.level === 2) && barW > 52 && (() => {
                      const PAD = 5
                      const textLeft = Math.min(Math.max(PAD, scrollLeft - startPx + PAD), barW - 40)
                      return (
                        <span
                          className="absolute top-1/2 -translate-y-1/2 text-[10px] text-white dark:text-gray-900 font-semibold leading-none select-none overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ left: textLeft, right: TradeIcon && barW > 20 ? 18 : PAD }}
                        >
                          {row.name}
                        </span>
                      )
                    })()}
                    {TradeIcon && barW > 20 && !row.isPhase && (
                      <TradeIcon className="absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-white/80 dark:text-gray-900/80 shrink-0" />
                    )}
                  </div>
                )}

                {/* Trade label — trade stays fixed, dates reveal left-to-right on hover */}
                {!row.isPhase && !row.isMilestone && startPx != null && barW > 0 && TradeIcon && row.resources.length > 0 && (() => {
                  const GAP        = 6
                  const MIN        = 38
                  const leftSpace  = startPx - GAP
                  const rightSpace = timelineW - startPx - barW - GAP
                  if (leftSpace < MIN && rightSpace < MIN) return null
                  const showLeft   = leftSpace > rightSpace && leftSpace >= MIN
                  const trade      = toTitleCase(row.resources[0])

                  const s = row.startDate  ? fmtDateShort(row.startDate)  ?? "" : ""
                  const f = row.finishDate ? fmtDateShort(row.finishDate) ?? "" : ""
                  const datePart   = s && f ? (s === f ? ` · ${s}` : ` · ${s} – ${f}`) : ""

                  return (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 flex items-center pointer-events-none select-none leading-none"
                      style={showLeft
                        ? { right: timelineW - startPx + GAP }
                        : { left: startPx + barW + GAP }
                      }
                    >
                      <span className={cn(
                        "whitespace-nowrap transition-colors duration-150",
                        isRowActive ? "text-[9px] text-foreground/80" : "text-[9px] text-muted-foreground",
                      )}>
                        {trade}
                      </span>
                      <span
                        className="overflow-hidden whitespace-nowrap text-[9px] text-muted-foreground/70"
                        style={{
                          maxWidth:   isRowActive ? `${datePart.length * 6.5}px` : '0px',
                          opacity:    isRowActive ? 1 : 0,
                          transition: 'max-width 280ms ease-out, opacity 200ms ease-out',
                        }}
                      >
                        {datePart}
                      </span>
                    </span>
                  )
                })()}

                {/* Milestone */}
                {row.isMilestone && startPx != null && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400 border border-amber-600 pointer-events-none"
                    style={{ left: startPx }}
                  />
                )}
              </div>

              {/* ── Floating action buttons (zero-width sticky anchor) ─── */}
              <div
                className="sticky right-0 z-30 shrink-0 overflow-visible"
                style={{ width: 0, height: ROW_H }}
              >
                {/* Buttons float to the left of the right edge */}
                <div
                  ref={isCommentsOpen ? commentsButtonsRef : undefined}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background rounded-md px-0.5 shadow-sm transition-opacity",
                    (hasComments || isRowActive) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {/* Check button */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => onMetaChange(row.id, { status: isDone ? 'pending' : 'done' })}
                          className={cn(
                            "flex items-center justify-center w-5 h-5 rounded transition-colors",
                            isDone
                              ? "text-green-500 hover:bg-green-500/10"
                              : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/80",
                          )}
                        />
                      }
                    >
                      <Check className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isDone ? "Mark as pending" : "Mark as done"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Comments button */}
                  <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                              if (isCommentsOpen) {
                                setCommentsRowId(null)
                                setLockedRowId(null)
                              } else {
                                openComments(row.id)
                              }
                            }}
                            className={cn(
                              "relative flex items-center justify-center w-5 h-5 rounded transition-colors",
                              isCommentsOpen
                                ? "text-primary bg-primary/10"
                                : hasComments
                                  ? "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                                  : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/80",
                            )}
                          />
                        }
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {hasComments && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary text-[7px] text-primary-foreground flex items-center justify-center leading-none font-bold pointer-events-none">
                            {rowComments.length > 9 ? "9+" : rowComments.length}
                          </span>
                        )}
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {hasComments
                          ? `${rowComments.length} comment${rowComments.length > 1 ? 's' : ''}`
                          : "Add comment"
                        }
                      </TooltipContent>
                    </Tooltip>

                </div>
              </div>
            </div>
          )
        })}

          {/* Date labels overlay — above rows, no bleeding */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
            {todayInRange && (
              <div className="absolute top-0 bottom-0" style={{ left: LEFT_W + todayPx, borderLeft: "1px dashed rgba(255,255,255,0.25)" }} />
            )}
            {!(filterYear != null && filterMonth != null) && (
              <div className="absolute top-0 bottom-0" style={{ left: LEFT_W + startLinePx, borderLeft: "1px dashed #10b981" }}>
                <span
                  className="absolute text-[9px] font-mono font-semibold bg-background/90 rounded whitespace-nowrap leading-none"
                  style={{ bottom: 8, left: 4, writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "4px 2px", color: "#10b981" }}
                >
                  {fmtDateNum(ps)}
                </span>
              </div>
            )}
            {!(filterYear != null && filterMonth != null) && (
              <div className="absolute top-0 bottom-0" style={{ left: LEFT_W + endLinePx, borderLeft: "1px dashed #f43f5e" }}>
                <span
                  className="absolute text-[9px] font-mono font-semibold bg-background/90 rounded whitespace-nowrap leading-none"
                  style={{ top: 8, left: -4, transform: "translateX(-100%) rotate(180deg)", writingMode: "vertical-rl", padding: "4px 2px", color: "#f43f5e" }}
                >
                  {fmtDateNum(pf)}
                </span>
              </div>
            )}
          </div>

        </div>{/* end rows wrapper */}
        </TooltipProvider>

        {visibleRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No tasks match the current filter.
          </div>
        )}
      </div>

      {/* Comment popup portal — fixed position, avoids overflow clipping + cursor-grab */}
      {commentsRowId && popupPos && typeof window !== "undefined" && createPortal(
        (() => {
          const commentsOpenRow = visibleRows.find(r => r.id === commentsRowId)
          if (!commentsOpenRow) return null
          const portalComments = commentsMap.get(commentsRowId) ?? []
          return (
            <div
              ref={commentsPopupRef}
              className="w-72 bg-popover border border-border rounded-lg shadow-xl flex flex-col cursor-default"
              style={{
                position: "fixed",
                ...(popupPos.bottom !== undefined ? { bottom: popupPos.bottom } : { top: popupPos.top }),
                right: popupPos.right,
                maxHeight: 320,
                zIndex: 9999,
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="px-3 pt-2.5 pb-2 border-b border-border/50 shrink-0">
                <p className="text-[11px] font-semibold text-foreground truncate">{commentsOpenRow.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {portalComments.length === 0 ? "No comments yet" : `${portalComments.length} comment${portalComments.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2.5 min-h-0">
                {portalComments.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 text-center py-3">Be the first to comment.</p>
                ) : portalComments.map(c => {
                  const isOwn     = !!c.created_by_id && c.created_by_id === currentUser?.id
                  const isEditing = editingCommentId === c.id
                  return (
                    <div key={c.id} className="group/comment flex gap-2">
                      {(() => { const Icon = commentRoleIcon(c.user_role); return (
                        <div className={cn("w-6 h-6 rounded-full bg-muted/60 border flex items-center justify-center shrink-0 mt-0.5", commentRoleBorder(c.user_role))}>
                          <Icon className={cn("w-3 h-3", commentRoleColor(c.user_role))} />
                        </div>
                      ) })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[11px] font-medium text-foreground truncate">{c.user_name || "Unknown"}</span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{fmtCommentTime(c.created_at)}</span>
                          {isOwn && !isEditing && (
                            deletingCommentId === c.id ? (
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-muted-foreground">Sure?</span>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setDeletingCommentId(null); removeComment(commentsRowId!, c.id) }}
                                  className="flex items-center justify-center w-4 h-4 rounded bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => setDeletingCommentId(null)}
                                  className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">No</button>
                              </div>
                            ) : (
                              <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity shrink-0">
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setEditingCommentId(c.id); setEditBody(c.body) }}
                                  className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors">
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => setDeletingCommentId(c.id)}
                                  className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditComment(commentsRowId!, c.id) }
                                if (e.key === 'Escape') { setEditingCommentId(null); setEditBody("") }
                              }}
                              rows={2} className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 resize-none text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                            <div className="flex gap-1">
                              <button onMouseDown={e => e.stopPropagation()} onClick={() => saveEditComment(commentsRowId!, c.id)}
                                className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Save</button>
                              <button onMouseDown={e => e.stopPropagation()} onClick={() => { setEditingCommentId(null); setEditBody("") }}
                                className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-foreground/80 break-words leading-snug">{c.body}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-border/50 p-2 shrink-0">
                <div className="flex gap-1.5 items-end">
                  <textarea ref={newCommentRef} value={newComment}
                    onChange={e => { setNewComment(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px` }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(commentsRowId!) } }}
                    placeholder="Write a comment… (Enter to send)" rows={1}
                    className="flex-1 text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 leading-normal resize-none overflow-hidden max-h-28 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button onMouseDown={e => e.stopPropagation()} onClick={() => submitComment(commentsRowId!)}
                    disabled={!newComment.trim() || submitting}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0">
                    {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body,
      )}
    </div>
  )
}

// ─── Dates viewer (compact table, horizontal scroll) ─────────────────────────

function DatesViewer({
  visibleRows,
  mergedRows,
  hasKidsMap,
  expandedIds,
  toggleRow,
  rowPhaseIdx,
  phaseColors,
  oursSet,
  rowMetas,
  onMetaChange,
  buildingId,
  currentUserName,
  commentsMap,
  setCommentsMap,
  onEditEvent,
  onDeleteEvent,
}: {
  visibleRows:     ScheduleRow[]
  mergedRows:      ViewRow[]
  hasKidsMap:      Record<string, boolean>
  expandedIds:     Set<string>
  toggleRow:       (id: string) => void
  rowPhaseIdx:     Record<string, number>
  phaseColors:     string[]
  oursSet:         Set<string>
  rowMetas:        Map<string, RowMeta>
  onMetaChange:    (rowId: string, patch: Partial<RowMeta>) => void
  buildingId:      string
  currentUserName: string
  commentsMap:     Map<string, RowComment[]>
  setCommentsMap:  React.Dispatch<React.SetStateAction<Map<string, RowComment[]>>>
  onEditEvent:     (ev: ScheduleEvent) => void
  onDeleteEvent:   (ev: ScheduleEvent) => void
}) {
  const { user: currentUser } = useAuth()
  const isDark = useIsDark()

  const [hoveredRowId,      setHoveredRowId]      = useState<string | null>(null)
  const [lockedRowId,       setLockedRowId]       = useState<string | null>(null)
  const [commentsRowId,     setCommentsRowId]     = useState<string | null>(null)
  const [newComment,        setNewComment]        = useState("")
  const [submitting,        setSubmitting]        = useState(false)
  const [editingCommentId,  setEditingCommentId]  = useState<string | null>(null)
  const [editBody,          setEditBody]          = useState("")
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const commentsButtonsRef = useRef<HTMLDivElement>(null)
  const commentsPopupRef   = useRef<HTMLDivElement>(null)
  const newCommentRef      = useRef<HTMLTextAreaElement>(null)
  const [popupPos, setPopupPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  useEffect(() => {
    if (!commentsRowId) return
    const handler = (e: MouseEvent) => {
      if (
        !commentsButtonsRef.current?.contains(e.target as Node) &&
        !commentsPopupRef.current?.contains(e.target as Node)
      ) {
        setCommentsRowId(null)
        setLockedRowId(null)
        setNewComment("")
        setDeletingCommentId(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [commentsRowId])

  useLayoutEffect(() => {
    if (!commentsRowId || !commentsButtonsRef.current) { setPopupPos(null); return }
    const rect    = commentsButtonsRef.current.getBoundingClientRect()
    const POPUP_H = 320
    const GAP     = 12
    const MARGIN  = 8
    const midY    = rect.top + rect.height / 2
    const centered = midY - POPUP_H / 2
    const right   = window.innerWidth - rect.left + GAP

    if (centered >= MARGIN && centered + POPUP_H <= window.innerHeight - MARGIN) {
      setPopupPos({ top: centered, right })
    } else if (midY >= window.innerHeight / 2) {
      setPopupPos({ bottom: window.innerHeight - rect.bottom, right })
    } else {
      setPopupPos({ top: Math.min(rect.top, window.innerHeight - POPUP_H - MARGIN), right })
    }
  }, [commentsRowId])

  function openComments(rowId: string) {
    setCommentsRowId(rowId)
    setLockedRowId(rowId)
    setNewComment("")
  }

  async function submitComment(rowId: string) {
    const text = newComment.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const comment = await buildingsService.addRowComment(buildingId, rowId, text, currentUserName, currentUser?.role ?? "")
      setCommentsMap(prev => {
        const next = new Map(prev)
        next.set(rowId, [...(next.get(rowId) ?? []), comment!])
        return next
      })
      setNewComment("")
      if (newCommentRef.current) newCommentRef.current.style.height = "auto"
    } catch {}
    setSubmitting(false)
  }

  async function saveEditComment(rowId: string, commentId: string) {
    const text = editBody.trim()
    if (!text) return
    try {
      const updated = await buildingsService.editRowComment(buildingId, commentId, text)
      setCommentsMap(prev => {
        const next = new Map(prev)
        next.set(rowId, (next.get(rowId) ?? []).map(c => c.id === commentId ? { ...c, body: updated?.body } : c))
        return next
      })
    } catch {}
    setEditingCommentId(null)
    setEditBody("")
  }

  async function removeComment(rowId: string, commentId: string) {
    setCommentsMap(prev => {
      const next = new Map(prev)
      next.set(rowId, (next.get(rowId) ?? []).filter(c => c.id !== commentId))
      return next
    })
    try { await buildingsService.deleteRowComment(buildingId, commentId) } catch {}
  }

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const [dateEditState, setDateEditState] = useState<{
    rowId:      string
    realStart:  string   // draft value while editing
    realFinish: string
  } | null>(null)

  return (
    <div className="flex-1 overflow-auto">
      <TooltipProvider>
      <div className="min-w-[840px] flex flex-col">

        {/* Header */}
        <div className="sticky top-0 z-30 flex border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-[28px]">
          <div className="sticky left-0 z-20 bg-muted/90 border-r border-border/50 w-[280px] shrink-0 self-stretch flex items-center px-3">Task</div>
          <div className="sticky left-[280px] z-20 bg-muted/90 w-[80px] shrink-0 self-stretch flex items-center justify-center">Duration</div>
          <div className="sticky left-[360px] z-20 bg-muted/90 w-[88px] shrink-0 self-stretch flex items-center justify-center">Start</div>
          <div className="sticky left-[448px] z-20 bg-muted/90 w-[88px] shrink-0 self-stretch flex items-center justify-center">Finish</div>
          <div className="bg-muted/90 w-[100px] shrink-0 self-stretch flex items-center justify-center">Real Start</div>
          <div className="bg-muted/90 border-r border-border/50 w-[100px] shrink-0 self-stretch flex items-center justify-center">Real Finish</div>
          <div className="bg-muted/90 flex-1 min-w-[160px] flex items-center pl-3">Trades</div>
        </div>

        {mergedRows.map((item, i) => {
          // ── Event row ────────────────────────────────────────────────────
          if (isEventRow(item)) {
            const label = item.notes
              ? item.notes
              : new Date(item.event_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
            const evBg    = item.type_color + (isDark ? "0d" : "18")
            const evStart  = new Date(item.event_date + "T12:00:00")
            const evFinish = item.days_delayed > 0
              ? new Date(evStart.getTime() + item.days_delayed * 86_400_000)
              : null
            const evDuration = item.days_delayed === 0
              ? "1 day"
              : `${item.days_delayed} day${item.days_delayed !== 1 ? "s" : ""}`
            return (
              <div
                key={`ev-${item.id}`}
                className="group/evrow flex items-center border-b border-border/20"
                style={{ height: EVENT_ROW_H, backgroundColor: evBg, borderLeftColor: item.type_color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
              >
                {/* Label column */}
                <div className="sticky left-0 z-10 w-[280px] shrink-0 self-stretch flex items-center gap-1.5 pl-2 pr-1 overflow-hidden"
                  style={{ backgroundColor: evBg }}>
                  <EventTypeIcon name={item.type_icon} className="h-3 w-3 shrink-0" style={{ color: item.type_color }} />
                  {item.type_name !== "Other" && (
                    <span className="text-[10px] font-semibold shrink-0" style={{ color: item.type_color }}>{item.type_name}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">{label}</span>
                </div>
                {/* Duration */}
                <div className="sticky left-[280px] z-10 w-[80px] shrink-0 self-stretch flex items-center justify-center text-[10px]" style={{ color: item.type_color, backgroundColor: evBg }}>
                  {evDuration}
                </div>
                {/* Start — event date */}
                <div className="sticky left-[360px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-[10px] font-medium" style={{ color: item.type_color, backgroundColor: evBg }}>
                  {evStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                {/* Finish — event_date + days_delayed, or "—" for same-day events */}
                <div className="sticky left-[448px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-[10px] font-medium" style={{ color: item.type_color, backgroundColor: evBg }}>
                  {evFinish ? evFinish.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </div>
                {/* Filler + action buttons */}
                <div className="flex-1 self-stretch flex items-center justify-end pr-2" style={{ backgroundColor: evBg }}>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/evrow:opacity-100 transition-opacity">
                    <button onClick={() => onEditEvent(item)} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={() => onDeleteEvent(item)} className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          const row = item
          const phaseColor      = phaseColors[rowPhaseIdx[row.id] % phaseColors.length]
          const indent          = 8 + (row.level - 1) * 14
          const meta            = rowMetas.get(row.id)
          const isDone          = meta?.status === 'done'
          const isOurs          = !isDone && row.resources.some(r => oursSet.has(r))
          const isStartOverdue  = !isDone && !!row.startDate  && row.startDate  < today
          const isFinishOverdue = !isDone && !!row.finishDate && row.finishDate < today
          const isRowActive     = hoveredRowId === row.id || lockedRowId === row.id
          const isCommentsOpen = commentsRowId === row.id
          const rowComments    = commentsMap.get(row.id) ?? []
          const hasComments    = commentsMap.has(row.id) && rowComments.length > 0

          return (
            <div
              key={row.id}
              className={cn(
                "group flex items-center border-b border-border/20 transition-colors min-h-[32px]",
                isDone
                  ? "bg-green-500/[0.05] hover:bg-green-500/[0.09]"
                  : isOurs
                    ? "bg-foreground/[0.09] hover:bg-foreground/[0.14]"
                    : cn(i % 2 !== 0 && "bg-muted/[0.02]", "hover:bg-muted/[0.06]"),
              )}
              onMouseEnter={() => setHoveredRowId(row.id)}
              onMouseLeave={() => setHoveredRowId(null)}
            >
              {/* Task label */}
              <div
                className={cn(
                  "sticky left-0 z-10 border-r border-border/50 w-[280px] shrink-0 self-stretch flex items-center gap-1 pr-2",
                  (isDone || isOurs) ? "bg-transparent" : "bg-background",
                  isOurs && "border-l-2 border-l-foreground/50",
                )}
                style={{ paddingLeft: isOurs ? Math.max(0, indent - 2) : indent }}
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
                {isOurs && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_black.png" alt="" aria-hidden className="shrink-0 h-3 w-3 object-contain opacity-60 dark:hidden" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/minilogo_white.png" alt="" aria-hidden className="hidden shrink-0 h-3 w-3 object-contain opacity-60 dark:block" />
                  </>
                )}
                <span className={cn("text-[11px] truncate ml-1",
                  row.isPhase && "font-semibold uppercase tracking-wide",
                  !row.isPhase && row.level === 2 && "font-medium",
                  row.isMilestone && "text-amber-500")}>
                  {row.isMilestone && "◆ "}{row.name}
                </span>
              </div>

              {/* Duration */}
              <div className={cn(
                "sticky left-[280px] z-10 w-[80px] shrink-0 self-stretch flex items-center justify-center text-xs text-muted-foreground",
                (isDone || isOurs) ? "bg-transparent" : "bg-background",
              )}>
                {row.isMilestone ? "◆" : row.durationText}
              </div>

              {/* Start */}
              <div className={cn(
                "sticky left-[360px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-xs",
                (isDone || isOurs) ? "bg-transparent" : "bg-background",
                isStartOverdue ? "text-red-500 font-medium" : "text-muted-foreground",
              )}>
                {fmtDateShort(row.startDate)}
              </div>

              {/* Finish */}
              <div className={cn(
                "sticky left-[448px] z-10 w-[88px] shrink-0 self-stretch flex items-center justify-center text-xs",
                (isDone || isOurs) ? "bg-transparent" : "bg-background",
                isFinishOverdue ? "text-red-500 font-medium" : "text-muted-foreground",
              )}>
                {fmtDateShort(row.finishDate)}
              </div>

              {/* Real Start */}
              {(() => {
                const isEditing = dateEditState?.rowId === row.id
                const rsDate = isEditing
                  ? (dateEditState!.realStart ? new Date(dateEditState!.realStart + "T00:00:00") : undefined)
                  : (meta?.real_start ? new Date(meta.real_start + "T00:00:00") : undefined)
                return (
                  <div className="w-[100px] shrink-0 self-stretch flex items-center justify-center text-xs">
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger className={cn(
                          "w-[88px] text-[11px] text-center border border-primary rounded px-1 py-0.5 hover:bg-muted/50 transition-colors truncate",
                          dateEditState!.realStart ? "text-foreground" : "text-muted-foreground",
                        )}>
                          {dateEditState!.realStart
                            ? new Date(dateEditState!.realStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "Start…"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="bottom" align="center">
                          <CalendarPicker
                            mode="single"
                            selected={rsDate}
                            defaultMonth={rsDate}
                            onSelect={d => setDateEditState(s => s && ({ ...s, realStart: d ? isoDate(d) : "" }))}
                          />
                          {dateEditState!.realStart && (
                            <div className="border-t border-border px-3 py-2">
                              <button
                                onClick={() => setDateEditState(s => s && ({ ...s, realStart: "" }))}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className={cn("text-[11px]", meta?.real_start ? "text-foreground" : "text-muted-foreground/30")}>
                        {meta?.real_start
                          ? new Date(meta.real_start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "—"}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Real Finish */}
              {(() => {
                const isEditing = dateEditState?.rowId === row.id
                const rfDate = isEditing
                  ? (dateEditState!.realFinish ? new Date(dateEditState!.realFinish + "T00:00:00") : undefined)
                  : (meta?.real_finish ? new Date(meta.real_finish + "T00:00:00") : undefined)
                return (
                  <div className="border-r border-border/50 w-[100px] shrink-0 self-stretch flex items-center justify-center text-xs">
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger className={cn(
                          "w-[88px] text-[11px] text-center border border-primary rounded px-1 py-0.5 hover:bg-muted/50 transition-colors truncate",
                          dateEditState!.realFinish ? "text-foreground" : "text-muted-foreground",
                        )}>
                          {dateEditState!.realFinish
                            ? new Date(dateEditState!.realFinish + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "Finish…"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="bottom" align="center">
                          <CalendarPicker
                            mode="single"
                            selected={rfDate}
                            defaultMonth={rfDate}
                            onSelect={d => setDateEditState(s => s && ({ ...s, realFinish: d ? isoDate(d) : "" }))}
                          />
                          {dateEditState!.realFinish && (
                            <div className="border-t border-border px-3 py-2">
                              <button
                                onClick={() => setDateEditState(s => s && ({ ...s, realFinish: "" }))}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className={cn("text-[11px]", meta?.real_finish ? "text-foreground" : "text-muted-foreground/30")}>
                        {meta?.real_finish
                          ? new Date(meta.real_finish + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "—"}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Trades — icon badge + plain text (matches Trades popover) */}
              <div className="flex-1 min-w-[160px] flex flex-wrap gap-x-3 gap-y-1 px-3 py-1 items-center">
                {row.resources.map(r => {
                  const Icon = resIcon(r)
                  return (
                    <span key={r} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", resColor(r))}>
                        {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0, 2)}</span>}
                      </span>
                      <span>{toTitleCase(r)}</span>
                    </span>
                  )
                })}
              </div>

              {/* ── Floating action buttons (zero-width sticky anchor) ─── */}
              <div className="sticky right-0 z-20 shrink-0 overflow-visible" style={{ width: 0, alignSelf: 'stretch' }}>
                <div
                  ref={isCommentsOpen ? commentsButtonsRef : undefined}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background rounded-md px-0.5 shadow-sm transition-opacity",
                    (hasComments || isRowActive || dateEditState?.rowId === row.id)
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {dateEditState?.rowId === row.id ? (
                    /* ── Edit mode: Confirm + Cancel ─────────────────── */
<>
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                              onMetaChange(row.id, {
                                real_start:  dateEditState.realStart  || null,
                                real_finish: dateEditState.realFinish || null,
                              })
                              setDateEditState(null)
                            }}
                            className="flex items-center justify-center w-5 h-5 rounded text-green-500 hover:bg-green-500/10 transition-colors"
                          />
                        }>
                          <Check className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Confirm</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setDateEditState(null)}
                            className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          />
                        }>
                          <X className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Cancel</TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    /* ── Normal mode: Edit real dates + Check + Comments ─ */
                    <>
                      {/* Edit real dates */}
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setDateEditState({
                              rowId:      row.id,
                              realStart:  meta?.real_start  ?? "",
                              realFinish: meta?.real_finish ?? "",
                            })}
                            className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/80 transition-colors"
                          />
                        }>
                          <Pencil className="w-3 h-3" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Edit real dates</TooltipContent>
                      </Tooltip>

                      {/* Check */}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={() => onMetaChange(row.id, { status: isDone ? 'pending' : 'done' })}
                              className={cn(
                                "flex items-center justify-center w-5 h-5 rounded transition-colors",
                                isDone
                                  ? "text-green-500 hover:bg-green-500/10"
                                  : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/80",
                              )}
                            />
                          }
                        >
                          <Check className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">{isDone ? "Mark as pending" : "Mark as done"}</TooltipContent>
                      </Tooltip>
                    </>
                  )}

                  {/* Comments */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => {
                            if (isCommentsOpen) { setCommentsRowId(null); setLockedRowId(null) }
                            else openComments(row.id)
                          }}
                          className={cn(
                            "relative flex items-center justify-center w-5 h-5 rounded transition-colors",
                            isCommentsOpen
                              ? "text-primary bg-primary/10"
                              : hasComments
                                ? "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                                : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/80",
                          )}
                        />
                      }
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {hasComments && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary text-[7px] text-primary-foreground flex items-center justify-center leading-none font-bold pointer-events-none">
                          {rowComments.length > 9 ? "9+" : rowComments.length}
                        </span>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {hasComments ? `${rowComments.length} comment${rowComments.length > 1 ? 's' : ''}` : "Add comment"}
                    </TooltipContent>
                  </Tooltip>

                </div>
              </div>
            </div>
          )
        })}

        {visibleRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No tasks match the current filter.</div>
        )}
      </div>
      </TooltipProvider>

      {/* Comment popup portal — fixed position, avoids overflow clipping */}
      {commentsRowId && popupPos && typeof window !== "undefined" && createPortal(
        (() => {
          const commentsOpenRow = visibleRows.find(r => r.id === commentsRowId)
          if (!commentsOpenRow) return null
          const portalComments = commentsMap.get(commentsRowId) ?? []
          return (
            <div
              ref={commentsPopupRef}
              className="w-72 bg-popover border border-border rounded-lg shadow-xl flex flex-col cursor-default"
              style={{
                position: "fixed",
                ...(popupPos.bottom !== undefined ? { bottom: popupPos.bottom } : { top: popupPos.top }),
                right: popupPos.right,
                maxHeight: 320,
                zIndex: 9999,
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="px-3 pt-2.5 pb-2 border-b border-border/50 shrink-0">
                <p className="text-[11px] font-semibold text-foreground truncate">{commentsOpenRow.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {portalComments.length === 0 ? "No comments yet" : `${portalComments.length} comment${portalComments.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2.5 min-h-0">
                {portalComments.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 text-center py-3">Be the first to comment.</p>
                ) : portalComments.map(c => {
                  const isOwn     = !!c.created_by_id && c.created_by_id === currentUser?.id
                  const isEditing = editingCommentId === c.id
                  return (
                    <div key={c.id} className="group/comment flex gap-2">
                      {(() => { const Icon = commentRoleIcon(c.user_role); return (
                        <div className={cn("w-6 h-6 rounded-full bg-muted/60 border flex items-center justify-center shrink-0 mt-0.5", commentRoleBorder(c.user_role))}>
                          <Icon className={cn("w-3 h-3", commentRoleColor(c.user_role))} />
                        </div>
                      )})()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[11px] font-medium text-foreground truncate">{c.user_name || "Unknown"}</span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{fmtCommentTime(c.created_at)}</span>
                          {isOwn && !isEditing && (
                            deletingCommentId === c.id ? (
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-muted-foreground">Sure?</span>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setDeletingCommentId(null); removeComment(commentsRowId!, c.id) }}
                                  className="flex items-center justify-center w-4 h-4 rounded bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => setDeletingCommentId(null)}
                                  className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">No</button>
                              </div>
                            ) : (
                              <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity shrink-0">
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setEditingCommentId(c.id); setEditBody(c.body) }}
                                  className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors">
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                                <button onMouseDown={e => e.stopPropagation()} onClick={() => setDeletingCommentId(c.id)}
                                  className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditComment(commentsRowId!, c.id) }
                                if (e.key === 'Escape') { setEditingCommentId(null); setEditBody("") }
                              }}
                              rows={2} className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 resize-none text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                            <div className="flex gap-1">
                              <button onMouseDown={e => e.stopPropagation()} onClick={() => saveEditComment(commentsRowId!, c.id)}
                                className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Save</button>
                              <button onMouseDown={e => e.stopPropagation()} onClick={() => { setEditingCommentId(null); setEditBody("") }}
                                className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-foreground/80 break-words leading-snug">{c.body}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-border/50 p-2 shrink-0">
                <div className="flex gap-1.5 items-end">
                  <textarea ref={newCommentRef} value={newComment}
                    onChange={e => { setNewComment(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px` }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(commentsRowId!) } }}
                    placeholder="Write a comment… (Enter to send)" rows={1}
                    className="flex-1 text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 leading-normal resize-none overflow-hidden max-h-28 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button onMouseDown={e => e.stopPropagation()} onClick={() => submitComment(commentsRowId!)}
                    disabled={!newComment.trim() || submitting}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0">
                    {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body,
      )}
    </div>
  )
}

// ─── Schedule viewer (shared state) ──────────────────────────────────────────

function ScheduleViewer({
  schedule,
  buildingId,
  viewMode,
  displayResources: extDisplayResources,
  filterYear,
  filterMonth,
  controlsRef,
  activeEvents = [],
}: {
  schedule:          ParsedSchedule
  buildingId:        string
  viewMode:          "gantt" | "dates"
  displayResources:  string[]
  filterYear:        number | null
  filterMonth:       number | null
  controlsRef?:      React.MutableRefObject<{ expandAll: () => void; collapseAll: () => void } | null>
  activeEvents?:     ScheduleEvent[]
}) {
  const displayRows = useMemo(() => {
    const { projectStart: ps, projectFinish: pf } = schedule
    if (!ps || !pf) return schedule.rows
    const total = pf.getTime() - ps.getTime()

    let rows = total <= 0 ? schedule.rows : schedule.rows.filter(r => {
      if (!r.isPhase || !r.startDate || !r.finishDate) return true
      return (r.finishDate.getTime() - r.startDate.getTime()) / total < 0.65
    })

    if (filterYear != null) {
      const mStart = filterMonth != null ? new Date(filterYear, filterMonth, 1) : new Date(filterYear, 0, 1)
      const mEnd   = filterMonth != null ? new Date(filterYear, filterMonth + 1, 0) : new Date(filterYear, 11, 31)
      rows = rows.filter(r => {
        if (!r.startDate || !r.finishDate) return true
        return r.startDate <= mEnd && r.finishDate >= mStart
      })
    }

    return rows
  }, [schedule, filterYear, filterMonth])

  const rowPhaseIdx = useMemo(() => {
    const map: Record<string, number> = {}
    let idx = -1
    for (const r of displayRows) { if (r.isPhase) idx++; map[r.id] = Math.max(0, idx) }
    return map
  }, [displayRows])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

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
    () => getVisibleRows(displayRows, expandedIds, new Set()),
    [displayRows, expandedIds],
  )
  const hasKidsMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    displayRows.forEach((_, i) => { m[displayRows[i].id] = hasChildren(displayRows, i) })
    return m
  }, [displayRows])

  const isDark = useIsDark()
  const phaseColors = isDark ? PHASE_COLORS_DARK : PHASE_COLORS_LIGHT

  const { data: ownershipData = [] } = useTradeOwnership(buildingId)
  const oursSet = useMemo(
    () => new Set(ownershipData.filter(o => o.is_ours).map(o => o.trade_name)),
    [ownershipData],
  )

  const { user: currentUser } = useAuth()
  const currentUserName = currentUser?.name || currentUser?.email || "Unknown"

  // ── Comments map (shared between Gantt and Dates views) ────────────────────
  const [editingEvent,  setEditingEvent]  = useState<ScheduleEvent | null>(null)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)

  const [commentsMap, setCommentsMap] = useState<Map<string, RowComment[]>>(new Map())

  useEffect(() => {
    if (!buildingId) return
    setCommentsMap(new Map())
    buildingsService.getAllRowComments(buildingId)
      .then(items => {
        const map = new Map<string, RowComment[]>()
        for (const c of (items ?? [])) {
          const key = String(c.row_id)
          if (!map.has(key)) map.set(key, [])
          map.get(key)?.push(c)
        }
        setCommentsMap(map)
      })
      .catch(() => {})
  }, [buildingId])

  // ── Row metas ───────────────────────────────────────────────────────────────
  const [rowMetas, setRowMetas] = useState<Map<string, RowMeta>>(new Map())

  useEffect(() => {
    if (!buildingId) return
    buildingsService.getScheduleRowMeta(buildingId)
      .then(items => {
        const map = new Map<string, RowMeta>()
        for (const item of (items ?? [])) {
          map.set(String(item.row_id), {
            status:      item.status,
            observation: item.observation,
            real_start:  item.real_start  ?? null,
            real_finish: item.real_finish ?? null,
            is_finished: item.is_finished ?? false,
          })
        }
        setRowMetas(map)
      })
      .catch(() => {})
  }, [buildingId])

  const onMetaChange = useCallback((rowId: string, patch: Partial<RowMeta>) => {
    setRowMetas(prev => {
      const next    = new Map(prev)
      const current = next.get(rowId) ?? { status: 'pending', observation: '', real_start: null, real_finish: null, is_finished: false }
      next.set(rowId, { ...current, ...patch })
      return next
    })
    buildingsService.upsertScheduleRowMeta(buildingId, rowId, patch).catch(() => {})
  }, [buildingId])

  const mergedRows = useMemo<ViewRow[]>(() => {
    if (!activeEvents.length) return visibleRows
    const queue = [...activeEvents].sort((a, b) => a.event_date.localeCompare(b.event_date))
    const result: ViewRow[] = []
    let qi = 0
    for (const row of visibleRows) {
      const rowDate = row.startDate?.toISOString().slice(0, 10) ?? null
      while (qi < queue.length && rowDate && queue[qi].event_date <= rowDate) {
        result.push({ ...queue[qi++], _kind: "event" })
      }
      result.push(row)
    }
    while (qi < queue.length) result.push({ ...queue[qi++], _kind: "event" })
    return result
  }, [visibleRows, activeEvents])

  const shared = { displayRows, visibleRows, mergedRows, hasKidsMap, expandedIds, toggleRow, rowPhaseIdx, phaseColors, oursSet }

  const evCallbacks = {
    onEditEvent:   (ev: ScheduleEvent) => setEditingEvent(ev),
    onDeleteEvent: (ev: ScheduleEvent) => setDeletingEvent(ev),
  }

  return (
    <>
      {editingEvent && (
        <EditEventModal buildingId={buildingId} event={editingEvent} onClose={() => setEditingEvent(null)} />
      )}
      {deletingEvent && (
        <DeleteEventModal buildingId={buildingId} event={deletingEvent} onClose={() => setDeletingEvent(null)} />
      )}
      {viewMode === "gantt" && schedule.projectStart && schedule.projectFinish
        ? <GanttViewer schedule={schedule} {...shared} rowMetas={rowMetas} onMetaChange={onMetaChange} buildingId={buildingId} currentUserName={currentUserName} commentsMap={commentsMap} setCommentsMap={setCommentsMap} filterYear={filterYear} filterMonth={filterMonth} {...evCallbacks} />
        : <DatesViewer {...shared} rowMetas={rowMetas} onMetaChange={onMetaChange} buildingId={buildingId} currentUserName={currentUserName} commentsMap={commentsMap} setCommentsMap={setCommentsMap} {...evCallbacks} />
      }
    </>
  )
}

// ─── Event modals (edit + delete confirm) ─────────────────────────────────────

function fmtDateStr(s: string): string {
  if (!s) return ""
  const datePart = s.split("T")[0].split(" ")[0]
  const [y, m, d] = datePart.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function EditEventModal({
  buildingId, event, onClose,
}: {
  buildingId: string
  event:      ScheduleEvent
  onClose:    () => void
}) {
  const { data: eventTypes = [], isLoading: typesLoading } = useEventTypes()
  const editEvent = useEditBuildingEvent(buildingId)

  const [typeId, setTypeId] = useState<number | null>(event.event_type_id)
  const [date,   setDate]   = useState(event.event_date)
  const [days,   setDays]   = useState(event.days_delayed)
  const [notes,  setNotes]  = useState(event.notes)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const canSave = typeId !== null && date !== "" && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true); setError(null)
    try {
      await editEvent.mutateAsync({ eventId: event.id, body: { event_type_id: typeId!, event_date: date, days_delayed: days, notes: notes.trim() } })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Edit Event</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Event Type *</label>
            {typesLoading
              ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
              : (
                <div className="grid grid-cols-2 gap-1.5">
                  {eventTypes.map(et => (
                    <button key={et.id} type="button" onClick={() => setTypeId(et.id)}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors text-left"
                      style={typeId === et.id ? { borderColor: et.color, backgroundColor: et.color + "26", color: et.color } : undefined}>
                      <EventTypeIcon name={et.icon} className="h-3.5 w-3.5 shrink-0" style={{ color: et.color }} />
                      {et.name}
                    </button>
                  ))}
                </div>
              )}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Event Date *</label>
              <Popover>
                <PopoverTrigger className={cn("w-full flex items-center gap-2 text-sm rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted/50 transition-colors text-left", !date && "text-muted-foreground")}>
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {date ? fmtDateStr(date) : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={date ? new Date(date + "T12:00:00") : undefined}
                    onSelect={d => { if (!d) return; const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0"); setDate(`${y}-${m}-${day}`) }} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Days Delayed</label>
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-1 py-1 h-[34px] gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setDays(d => Math.max(0, d - 1))}>−</Button>
                <span className="min-w-[3ch] text-center text-sm font-bold tabular-nums">{days}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setDays(d => d + 1)}>+</Button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional description…"
              className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <Check className="h-3.5 w-3.5 mr-1.5" />Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}

function DeleteEventModal({
  buildingId, event, onClose,
}: {
  buildingId: string
  event:      ScheduleEvent
  onClose:    () => void
}) {
  const deleteEvent = useDeleteBuildingEvent(buildingId)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try { await deleteEvent.mutateAsync(event.id); onClose() }
    catch { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm text-destructive">Delete Event?</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 mb-4">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: event.type_color + "22" }}>
              <EventTypeIcon name={event.type_icon} className="h-3.5 w-3.5" style={{ color: event.type_color }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{event.type_name}</span>
                {event.days_delayed > 0 && (
                  <span className="text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                    +{event.days_delayed}d
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtDateStr(event.event_date)}</p>
              {event.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{event.notes}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">This event and its schedule impact will be permanently removed.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Trade control modal ──────────────────────────────────────────────────────

function TradeControlModal({
  buildingId,
  allResources,
  onClose,
}: {
  buildingId:   string
  allResources: string[]
  onClose:      () => void
}) {
  const { data: ownership = [], isLoading } = useTradeOwnership(buildingId)
  const upsert = useUpsertTradeOwnership(buildingId)

  const [localTrades, setLocalTrades] = useState<Record<string, boolean>>({})
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (isLoading || initialized) return
    const map: Record<string, boolean> = {}
    for (const t of allResources) {
      const existing = ownership.find(o => o.trade_name === t)
      map[t] = existing?.is_ours ?? true
    }
    setLocalTrades(map)
    setInitialized(true)
  }, [ownership, allResources, isLoading, initialized])

  async function handleSave() {
    await upsert.mutateAsync(
      Object.entries(localTrades).map(([trade_name, is_ours]) => ({ trade_name, is_ours }))
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-sm mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Trade Control</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Which trades does our team perform?</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && allResources.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No trades found in this schedule.</p>
          )}
          {!isLoading && allResources.map(trade => {
            const isOurs = localTrades[trade] ?? true
            const Icon   = resIcon(trade)
            return (
              <button
                key={trade}
                type="button"
                onClick={() => setLocalTrades(prev => ({ ...prev, [trade]: !prev[trade] }))}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
                  isOurs
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/30",
                )}
              >
                <span className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", resColor(trade))}>
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-[9px] font-bold">{toTitleCase(trade).slice(0, 2)}</span>}
                </span>
                <span className="flex-1 text-[11px] font-medium truncate">{toTitleCase(trade)}</span>
                <span className={cn(
                  "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full",
                  isOurs ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  {isOurs ? "Our team" : "Subcontractor"}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border shrink-0">
          {/* Select / Deselect All */}
          <button
            type="button"
            disabled={allResources.length === 0 || isLoading}
            onClick={() => {
              const allOurs = allResources.every(t => localTrades[t] ?? true)
              setLocalTrades(Object.fromEntries(allResources.map(t => [t, !allOurs])))
            }}
            className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-40"
          >
            {allResources.every(t => localTrades[t] ?? true) ? "Deselect All" : "Select All"}
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={upsert.isPending || isLoading}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {upsert.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

export default function BuildingSchedulePage() {
  const { data: buildings = [], isLoading } = useBuildings()
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [viewMode, setViewMode]             = useState<"gantt" | "dates">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bs:viewMode")
      if (saved === "gantt" || saved === "dates") return saved
    }
    return "gantt"
  })
  const [filterYear, setFilterYear]         = useState<number | null>(null)
  const [filterMonth, setFilterMonth]       = useState<number | null>(null)
  const [controlOpen, setControlOpen]       = useState(false)
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

  // Reset filters when building changes
  useEffect(() => { setFilterYear(null); setFilterMonth(null) }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col pb-2">

        {/* Row 1: Title + right controls */}
        <div className="flex items-end gap-2">

          {/* Title */}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Building Schedule</h1>
            <p className="text-sm text-muted-foreground">Track construction progress across all projects</p>
          </div>

          <div className="flex-1" />

          {/* Building selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Building</span>
            <BuildingDropdown
              buildings={buildings}
              selectedId={selectedId}
              onSelect={setSelectedId}
              isLoading={isLoading}
            />
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

          {/* Manage */}
          <a
            href="/building-schedule/manage"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[min(var(--radius-md),12px)] bg-primary text-primary-foreground text-[0.8rem] font-medium hover:bg-primary/90 transition-colors shrink-0 select-none"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Manage
          </a>
        </div>

        {/* Trade control modal */}
        {controlOpen && selectedId && schedule && (
          <TradeControlModal
            buildingId={selectedId}
            allResources={displayResources}
            onClose={() => setControlOpen(false)}
          />
        )}

        {/* Row 2: Display controls (only when schedule loaded) */}
        {schedule && (
          <div className="flex items-center gap-2 mt-2 rounded-lg border border-border px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {stats && <>{stats.total} tasks · {stats.phases} phases</>}
              {schedule?.projectStart && schedule?.projectFinish && (
                <> · {fmtDateFull(schedule.projectStart)} – {fmtDateFull(schedule.projectFinish)}</>
              )}
            </span>

            <div className="flex-1" />

            {/* Trades legend */}
            {displayResources.length > 0 && (
              <TradesLegend displayResources={displayResources} />
            )}

            {/* Gantt | Dates toggle */}
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

            {/* Expand / Collapse */}
            <div className="flex items-center h-7 rounded-lg border border-border bg-muted/20 p-0.5">
              <button
                onClick={() => scheduleControls.current?.expandAll()}
                className="flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                Expand
              </button>
              <button
                onClick={() => scheduleControls.current?.collapseAll()}
                className="flex items-center gap-1.5 px-2 h-full rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
                Collapse
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border flex flex-col"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-background) 75%, transparent)" }}
      >

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
