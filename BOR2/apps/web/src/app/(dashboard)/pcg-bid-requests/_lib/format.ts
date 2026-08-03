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

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
