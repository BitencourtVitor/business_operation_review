import type { LeadTimeUnit } from "./types"

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function formatMoney(value: number | null): string {
  if (value === null) return ""
  return USD.format(value)
}

export { formatAmount, parseMoneyInput } from "@/lib/money"

const LEAD_TIME_SINGULAR: Record<LeadTimeUnit, string> = {
  days: "day", weeks: "week", months: "month",
}

export const LEAD_TIME_UNITS: LeadTimeUnit[] = ["days", "weeks", "months"]

export function formatLeadTime(value: number | null, unit: LeadTimeUnit): string {
  if (value === null) return ""
  return `${value} ${value === 1 ? LEAD_TIME_SINGULAR[unit] : unit}`
}

// Whole units only: half a week is not something a sub quotes.
export function parseLeadTimeInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null
  return Number(digits)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Status changes happen several times a day — the hour is what tells two of
// them apart.
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  })
}
