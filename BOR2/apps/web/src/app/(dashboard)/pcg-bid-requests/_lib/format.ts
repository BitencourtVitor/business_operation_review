import type { LeadTimeUnit } from "./types"

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const AMOUNT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoney(value: number | null): string {
  if (value === null) return ""
  return USD.format(value)
}

// No symbol — the field renders "$" as a prefix so the digits stay right-aligned.
export function formatAmount(value: number | null): string {
  if (value === null) return ""
  return AMOUNT.format(value)
}

// Cents-based entry: typing 123456 reads as $1,234.56, so the mask never
// fights the caret the way a decimal-point parser does.
export function parseMoneyInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null
  return Number(digits) / 100
}

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
