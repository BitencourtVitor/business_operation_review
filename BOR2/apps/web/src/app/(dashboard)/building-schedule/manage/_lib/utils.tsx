import type { CSSProperties } from "react"
import {
  CalendarX,
  CircleHelp,
  CloudRain,
  Snowflake,
  TriangleAlert,
  UsersRound,
  Wind,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ScheduleEvent, ScheduleHistoryItem } from "@/services/buildings.service"

// ─── Event icon map ───────────────────────────────────────────────────────────

export const EVENT_ICON_MAP: Record<string, LucideIcon> = {
  "cloud-rain":     CloudRain,
  "snowflake":      Snowflake,
  "calendar-x":     CalendarX,
  "wind":           Wind,
  "triangle-alert": TriangleAlert,
  "users-round":    UsersRound,
  "circle-help":    CircleHelp,
}

export function EventIcon({ name, className, style }: {
  name:       string
  className?: string
  style?:     CSSProperties
}) {
  const Icon = EVENT_ICON_MAP[name] ?? CircleHelp
  return <Icon className={className} style={style} />
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function fmtDateStr(s: string): string {
  if (!s) return ""
  const datePart = s.split("T")[0].split(" ")[0]
  const [y, m, d] = datePart.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ─── Timeline types ───────────────────────────────────────────────────────────

export type TimelineItem =
  | { kind: "upload"; item: ScheduleHistoryItem; date: string }
  | { kind: "event";  item: ScheduleEvent;       date: string }
