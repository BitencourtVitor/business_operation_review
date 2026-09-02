'use client'

import { Circle, Clock, CheckCircle2 } from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export const MONTHS_FULL = [
  { value: "01", label: "January"   }, { value: "02", label: "February"  },
  { value: "03", label: "March"     }, { value: "04", label: "April"     },
  { value: "05", label: "May"       }, { value: "06", label: "June"      },
  { value: "07", label: "July"      }, { value: "08", label: "August"    },
  { value: "09", label: "September" }, { value: "10", label: "October"   },
  { value: "11", label: "November"  }, { value: "12", label: "December"  },
]

export const RESOLUTION_THRESHOLD = 14

// ── Types ─────────────────────────────────────────────────────────────────────

export type Status = "open" | "in_progress" | "completed"

export interface TopItem {
  name: string
  count: number
  pct: number
}

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CFG = {
  open:        { label: "Open",        color: "#dc3545", Icon: Circle       },
  in_progress: { label: "In Progress", color: "#ffc107", Icon: Clock        },
  completed:   { label: "Completed",   color: "#1bbf5c", Icon: CheckCircle2 },
} as const

export const NODE_COLORS = {
  received:  "#3b82f6",
  material:  "#f59e0b",
  resident:  "#06b6d4",
  completed: "#22c55e",
  visit:     "#ef4444",
} as const
