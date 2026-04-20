"use client"

// ─── Pure helper functions ─────────────────────────────────────────────────────

export function fmtDate(val: string | null | undefined): string {
  if (!val) return "—"
  const [y, m, d] = val.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function fmtCurrency(val: number): string {
  if (!val) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val)
}

export function dateVal(v: string | null | undefined): string {
  if (!v) return ""
  return v.slice(0, 10)
}

/**
 * Builds a searchable string from a date value covering multiple formats.
 * e.g. "2024-06-15 06/15/2024 Jun 15, 2024"
 */
export function dateSearchStr(v: string | null | undefined): string {
  if (!v || v.length < 10) return ""
  const iso = v.slice(0, 10)
  const [y, m, d] = iso.split("-").map(Number)
  const mm = String(m).padStart(2, "0")
  const dd = String(d).padStart(2, "0")
  const mmddyyyy = `${mm}/${dd}/${y}`
  const localized = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return `${iso} ${mmddyyyy} ${localized}`.toLowerCase()
}
