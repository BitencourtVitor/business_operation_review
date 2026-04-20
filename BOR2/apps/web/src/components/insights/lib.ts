'use client'

import { Circle, Clock, CheckCircle2 } from "lucide-react"

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—"
  const d = new Date(s)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export const STATUS_CONFIG = {
  pending:     { label: "Pending",     icon: Circle,       color: "text-muted-foreground"                },
  in_progress: { label: "In progress", icon: Clock,        color: "text-yellow-500 dark:text-yellow-300" },
  done:        { label: "Done",        icon: CheckCircle2, color: "text-primary"                         },
} as const
