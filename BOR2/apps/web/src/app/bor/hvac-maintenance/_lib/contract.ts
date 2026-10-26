import type { MaintenanceContract, MaintenanceInvoice } from "@/services/hvac-maintenance.service"

export type Lane = "collect" | "to_schedule" | "renew" | "scheduled" | "prospect"

/**
 * Em que raia o cliente aparece. Cobrar vence tudo: quem tem saldo aberto no
 * QuickBooks precisa de cobrança antes de qualquer outra coisa, e um cliente
 * aparece numa raia só.
 */
export function laneOf(c: MaintenanceContract): Lane | null {
  if (c.archived) return null
  if (c.unpaid) return "collect"
  return c.stage === "archived" ? null : c.stage
}

/** Invoice que conta no dinheiro: existe no QuickBooks e não foi anulada. */
export const counts = (i: MaintenanceInvoice) => i.found && !!i.total

export interface Money {
  value: number | null
  invoiced: number
  paid: number
  open: number
  /** Quanto do contrato ainda não virou invoice; null sem valor de contrato. */
  toInvoice: number | null
}

export function moneyOf(value: number | null, invoices: MaintenanceInvoice[]): Money {
  const live = invoices.filter(counts)
  const invoiced = live.reduce((s, i) => s + (i.total ?? 0), 0)
  const open = live.reduce((s, i) => s + (i.balance ?? 0), 0)
  return {
    value,
    invoiced,
    paid: invoiced - open,
    open,
    toInvoice: value == null ? null : Math.max(value - invoiced, 0),
  }
}

/** "2026-10-05" → "10/05/2026", sem passar por Date (e sem fuso). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${m}/${d}/${y}`
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

/** Valor no campo: "1,797.00". */
export const amountText = (n: number | null) =>
  n == null ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Máscara de moeda: os dígitos entram pela direita, os dois últimos são os
 * centavos ("99800" vira 998.00). Campo vazio é valor nenhum, não zero.
 */
export function maskAmount(raw: string): number | null {
  const d = raw.replace(/\D/g, "").replace(/^0+/, "")
  return d ? Number(d) / 100 : null
}

/** Máscara de telefone americano: (978) 500-4871. Mais dígitos ficam no fim. */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)} ${d.slice(10)}`
}
