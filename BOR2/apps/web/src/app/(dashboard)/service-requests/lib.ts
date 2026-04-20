'use client'

import type { ServiceRequest } from "@/services/service-request.service"
import { MONTHS_SHORT, RESOLUTION_THRESHOLD } from "./types"
import type { Status, TopItem } from "./types"

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function fmtShort(s: string | null | undefined): string {
  const d = parseDate(s)
  if (!d) return "—"
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export function fmtMMDD(s: string | null | undefined): string {
  const d = parseDate(s)
  if (!d) return "—"
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`
}

export function diffDays(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000)
}

export function getStatus(r: ServiceRequest): Status {
  if (!r.dateReceived) return "open"
  if (!r.dateCompleted) return "in_progress"
  return "completed"
}

export function getResolutionInfo(r: ServiceRequest): {
  days: number
  onTime: boolean
  fromResident: boolean
} {
  const residentDate = parseDate(r.residentAvailableDate)
  const receivedDate = parseDate(r.dateReceived)
  const start = residentDate ?? receivedDate
  const fromResident = !!residentDate

  if (!start) return { days: 0, onTime: true, fromResident: false }

  const visits = (r.additionalVisits ?? []).map(parseDate).filter(Boolean) as Date[]
  let end: Date
  if (visits.length > 0) {
    end = visits.reduce((a, b) => (b > a ? b : a))
  } else if (parseDate(r.dateCompleted)) {
    end = parseDate(r.dateCompleted)!
  } else {
    end = new Date()
  }

  const days = diffDays(start, end)
  return { days, onTime: days <= RESOLUTION_THRESHOLD, fromResident }
}

// ── Lot parsing ───────────────────────────────────────────────────────────────

const LOT_PREFIX_MAP: Record<string, string> = {
  LOT:  "Lot",
  BLD:  "Building",
  UNIT: "Unit",
}

/** Returns { label, value } for a lot string.
 *  "LOT 41"  → { label: "Lot",      value: "41" }
 *  "BLD 1"   → { label: "Building", value: "1"  }
 *  "UNIT 2"  → { label: "Unit",     value: "2"  }
 *  "41"      → { label: "Lot",      value: "41" }
 */
export function parseLot(lot: string | null | undefined): { label: string; value: string } | null {
  if (!lot) return null
  const upper = lot.trim().toUpperCase()
  for (const [prefix, label] of Object.entries(LOT_PREFIX_MAP)) {
    if (upper.startsWith(prefix + " ")) {
      return { label, value: lot.trim().slice(prefix.length).trim() }
    }
  }
  return { label: "Lot", value: lot.trim() }
}

/** Display string: "Lot 41", "Building 1", "Unit 2104" */
export function fmtLot(lot: string | null | undefined): string | null {
  const p = parseLot(lot)
  if (!p) return null
  return `${p.label} ${p.value}`
}

export function buildTopList(
  items: ServiceRequest[],
  getter: (r: ServiceRequest) => string,
): TopItem[] {
  const map = new Map<string, number>()
  for (const r of items) {
    const v = getter(r)
    if (v) map.set(v, (map.get(v) ?? 0) + 1)
  }
  const total = items.length || 1
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
}
