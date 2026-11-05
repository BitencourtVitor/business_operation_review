const AMOUNT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// No symbol: the field renders "$" as a prefix so the digits stay right-aligned.
export function formatAmount(value: number | null): string {
  if (value === null) return ""
  return AMOUNT.format(value)
}

// Cents-based entry: typing 123456 reads as $1,234.56, so the mask fills from
// right to left and never fights the caret the way a decimal-point parser does.
export function parseMoneyInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null
  return Number(digits) / 100
}
