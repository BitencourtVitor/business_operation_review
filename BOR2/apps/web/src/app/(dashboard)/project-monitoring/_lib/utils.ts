import {
  getISOWeek,
  endOfISOWeek,
  eachWeekOfInterval,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns"
import type { ProjectMonitoringEntry } from "@/services/project-monitoring.service"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectStatus = "completed" | "in_progress" | "no_started"
export type GroupBy        = "status" | "city_jobsite" | "stage"

export interface WeekOption {
  value: number
  label: string
}

export interface FilterConfig {
  year:             string
  month:            string
  week:             string
  dateType:         "startDate" | "finishDate"
  activeStatuses:   string[]
  selectedProjects: string[]
  selectedTeams:    string[]
}

// ── Status derivation ─────────────────────────────────────────────────────────

export function getStatus(p: ProjectMonitoringEntry): ProjectStatus {
  const stages = [p.s1Rough, p.s2Machines, p.s3Condenser, p.s4Finish]
  const completed = stages.filter(s => s === "Completed").length
  const noStarted = stages.filter(s => !s || s === "Not Started" || s === "No started").length
  if (completed === 4) return "completed"
  if (noStarted === 4) return "no_started"
  return "in_progress"
}

// Carousel cards use percent_completed (mirrors BOR1 carousel logic)
export function getStatusFromPercent(p: ProjectMonitoringEntry): ProjectStatus {
  const pct = p.percentCompleted ?? 0
  if (pct >= 100) return "completed"
  if (pct > 0)    return "in_progress"
  return "no_started"
}

export function getStageDate(p: ProjectMonitoringEntry, idx: number): string | null {
  return ([p.s1Date, p.s2Date, p.s3Date, p.s4Date])[idx] ?? null
}

// ── Filter option derivation ──────────────────────────────────────────────────

export function getAvailableYears(
  data: ProjectMonitoringEntry[],
  dateField: "startDate" | "finishDate",
): string[] {
  const years = new Set<string>()
  for (const p of data) {
    const d = p[dateField]
    if (d) years.add(String(new Date(d).getUTCFullYear()))
  }
  years.add(String(new Date().getFullYear()))
  return [...years].sort((a, b) => Number(b) - Number(a))
}

export function getAvailableMonths(
  data: ProjectMonitoringEntry[],
  dateField: "startDate" | "finishDate",
  year: string,
): number[] {
  const months = new Set<number>()
  for (const p of data) {
    const d = p[dateField]
    if (!d) continue
    const dt = new Date(d)
    if (String(dt.getUTCFullYear()) === year) months.add(dt.getUTCMonth() + 1)
  }
  const now = new Date()
  if (String(now.getFullYear()) === year) months.add(now.getMonth() + 1)
  return [...months].sort((a, b) => a - b)
}

export function getWeeksForPeriod(year: number, month?: number): WeekOption[] {
  const start = month ? startOfMonth(new Date(year, month - 1)) : startOfYear(new Date(year, 0))
  const end   = month ? endOfMonth(new Date(year, month - 1))   : endOfYear(new Date(year, 0))
  const weekStarts = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
  const unique = new Map<number, WeekOption>()
  for (const ws of weekStarts) {
    const wn = getISOWeek(ws)
    if (!unique.has(wn)) {
      const we = endOfISOWeek(ws)
      const range = month
        ? `${format(ws, "MMM d")}–${format(we, "d")}`
        : `${format(ws, "MMM d")}–${format(we, "MMM d")}`
      unique.set(wn, { value: wn, label: `Week ${wn} (${range})` })
    }
  }
  return [...unique.values()]
}

// ── Data filtering ────────────────────────────────────────────────────────────

export function filterData(
  data: ProjectMonitoringEntry[],
  cfg: FilterConfig,
): ProjectMonitoringEntry[] {
  const { year, month, week, dateType, activeStatuses, selectedProjects, selectedTeams } = cfg
  return data.filter(p => {
    if (year) {
      const d = p[dateType]
      if (!d) return false
      const dt = new Date(d)
      if (String(dt.getUTCFullYear()) !== year) return false
      if (month && String(dt.getUTCMonth() + 1) !== month) return false
      if (week && getISOWeek(dt) !== Number(week)) return false
    }
    if (activeStatuses.length > 0 && activeStatuses.length < 3) {
      if (!activeStatuses.includes(getStatus(p))) return false
    }
    if (selectedProjects.length > 0 && !selectedProjects.includes(p.jobSite)) return false
    if (selectedTeams.length > 0 && !selectedTeams.includes(p.team)) return false
    return true
  })
}

// ── Stage period check (for "stage" group-by in chart) ────────────────────────

export function isDateInPeriod(
  dateStr: string | null,
  year: string,
  month: string,
  week: string,
): boolean {
  if (!dateStr || !year) return false
  const d = new Date(dateStr)
  if (String(d.getUTCFullYear()) !== year) return false
  if (month && String(d.getUTCMonth() + 1) !== month) return false
  if (week && getISOWeek(d) !== Number(week)) return false
  return true
}

// ── Duration helpers ──────────────────────────────────────────────────────────

export function daysBetween(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  if (!a || !b) return null
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

export function todayISO(): string {
  return new Date().toISOString()
}

export function fmtDateUS(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  })
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export const STATUS_COLOR: Record<string, string> = {
  completed:   "#28a745",
  in_progress: "#ffc107",
  no_started:  "#dc3545",
}

export const STATUS_LABEL: Record<string, string> = {
  completed:   "Completed",
  in_progress: "In Progress",
  no_started:  "Not Started",
}

export const STAGE_META = [
  { idx: 0, field: "s1Rough"     as const, dateField: "s1Date" as const, label: "S1 Rough",     color: "#17a2b8" },
  { idx: 1, field: "s2Machines"  as const, dateField: "s2Date" as const, label: "S2 Machines",  color: "#6f42c1" },
  { idx: 2, field: "s3Condenser" as const, dateField: "s3Date" as const, label: "S3 Condenser", color: "#fd7e14" },
  { idx: 3, field: "s4Finish"    as const, dateField: "s4Date" as const, label: "S4 Finish",    color: "#28a745" },
]

export const CITY_JOBSITE_COLORS = [
  "#28a745", "#ffc107", "#dc3545", "#17a2b8", "#6f42c1",
  "#fd7e14", "#20c997", "#e83e8c", "#6c757d", "#495057",
]
