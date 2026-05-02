"use client"

import { useEffect, useState } from "react"
import {
  Award,
  CalendarX,
  CloudRain,
  Compass,
  Gem,
  Info,
  Snowflake,
  TriangleAlert,
  User,
  UsersRound,
  Wind,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ScheduleEvent } from "@/services/buildings.service"
import type { ParsedSchedule, ScheduleRow } from "@/lib/pdf-schedule-parser"

// ─── Layout constants ─────────────────────────────────────────────────────────

export const LEFT_W      = 240
export const ROW_H       = 34
export const YEAR_H      = 22
export const MONTH_H     = 24
export const PX_PER_DAY  = 3.5
export const EVENT_ROW_H = 24

// ─── Row meta type ────────────────────────────────────────────────────────────

export type RowMeta = {
  status:      "pending" | "done"
  observation: string
  real_start:  string | null
  real_finish: string | null
  is_finished: boolean
}

// ─── Event row types ──────────────────────────────────────────────────────────

export type EventRow = ScheduleEvent & { _kind: "event" }
export type ViewRow  = ScheduleRow | EventRow

export function isEventRow(r: ViewRow): r is EventRow { return "_kind" in r }

// ─── Month info type ──────────────────────────────────────────────────────────

export type MonthInfo = { label: string; year: number; startPx: number; pxWidth: number }

// ─── Date utilities ───────────────────────────────────────────────────────────

export function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function fmtDateNum(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function fmtDateStr(s: string): string {
  if (!s) return ""
  const datePart = s.split("T")[0].split(" ")[0]
  const [y, m, d] = datePart.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ─── Event-based date adjustment ──────────────────────────────────────────────

export function applyEventsToSchedule(
  schedule:   ParsedSchedule,
  events:     ScheduleEvent[],
  uploadedAt: string,
): ParsedSchedule {
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

  let projectFinish = schedule.projectFinish
  for (const row of rows) {
    if (row.finishDate && (!projectFinish || row.finishDate > projectFinish)) {
      projectFinish = row.finishDate
    }
  }

  return { ...schedule, rows, projectFinish }
}

// ─── Comment role helpers ─────────────────────────────────────────────────────

export function commentRoleIcon(role: string): LucideIcon {
  if (role === "dev")                                              return Gem
  if (role === "owner")                                            return Compass
  if (role === "admin" || role === "manager" || role === "gestor") return Award
  return User
}

export function commentRoleColor(role: string): string {
  if (role === "dev")                                              return "text-yellow-400 dark:text-yellow-400"
  if (role === "owner")                                            return "text-emerald-500 dark:text-emerald-400"
  if (role === "admin" || role === "manager" || role === "gestor") return "text-primary"
  return "text-muted-foreground"
}

export function commentRoleBorder(role: string): string {
  if (role === "dev")                                              return "border-yellow-400/50"
  if (role === "owner")                                            return "border-emerald-400/50"
  if (role === "admin" || role === "manager" || role === "gestor") return "border-primary/50"
  return "border-border"
}

export function fmtCommentTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
    if (diffMin < 1)  return "just now"
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24)   return `${diffH}h ago`
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch { return "" }
}

// ─── Event type icon map ──────────────────────────────────────────────────────

export const EV_ICON_MAP: Record<string, LucideIcon> = {
  "cloud-rain":     CloudRain,
  "snowflake":      Snowflake,
  "calendar-x":     CalendarX,
  "wind":           Wind,
  "triangle-alert": TriangleAlert,
  "users-round":    UsersRound,
  "circle-help":    Info,
}

export function EventTypeIcon({ name, className, style }: {
  name:       string
  className?: string
  style?:     React.CSSProperties
}) {
  const Icon = EV_ICON_MAP[name] ?? Info
  return <Icon className={className} style={style} />
}

// ─── Theme detection ──────────────────────────────────────────────────────────

export function useIsDark() {
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
