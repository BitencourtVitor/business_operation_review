'use client'

import { createContext, useContext, useState } from "react"
import { useQBProjectDetail } from "@/hooks/use-qb-accounting"
import type {
  BillDetail, PurchaseDetail, VendorCreditDetail,
  InvoiceDetail, BackchargeDetail,
} from "@/services/qb-accounting.service"
import {
  X, ChevronRight,
  Eye, EyeOff,
  FileText, Receipt, ShoppingCart, ArrowDownLeft, Banknote, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFinancialStore } from "@/store/financial.store"

// ── Financial visibility context ──────────────────────────────────────────────
// Driven by the global Zustand store; togglable via the button in the modal header.
// All sub-components call useBlur() — no prop drilling needed.

const FinancialCtx = createContext(true) // true = show values

function useBlur() {
  const show = useContext(FinancialCtx)
  return !show ? "blur-sm select-none pointer-events-none" : ""
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(v: number | null | undefined) {
  if (v == null) return "—"
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${m}/${d}/${y.slice(2)}`
}

// ── Type badge ────────────────────────────────────────────────────────────────

const TYPE_CFG = {
  bill:    { label: "BILL",    color: "#f28b82", bg: "rgba(242,139,130,0.1)" },
  purchase:{ label: "PURCHASE", color: "#ff9800", bg: "rgba(255,152,0,0.1)"   },
  credit:  { label: "CREDIT",  color: "#4caf50", bg: "rgba(76,175,80,0.1)"   },
  invoice: { label: "INVOICE", color: "#a7e9af", bg: "rgba(167,233,175,0.1)" },
  charge:  { label: "BACK CHARGE", color: "#fb923c", bg: "rgba(251,146,60,0.1)"  },
} as const

function TypeBadge({ type }: { type: keyof typeof TYPE_CFG }) {
  const { label, color, bg } = TYPE_CFG[type]
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
      style={{ color, background: bg }}
    >
      {label}
    </span>
  )
}

// ── Grouped lines (by account_ref_name) ───────────────────────────────────────

type AnyLine = { description: string; amount: number; account_ref_name: string }

function GroupedLines({ lines }: { lines: AnyLine[] }) {
  const blur = useBlur()

  const groups = lines.reduce<Record<string, AnyLine[]>>((acc, l) => {
    const key = l.account_ref_name || "Other"
    ;(acc[key] ??= []).push(l)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-1 py-1.5">
      {Object.entries(groups).map(([account, items]) => {
        const groupTotal = items.reduce((s, i) => s + i.amount, 0)
        return (
          <div key={account}>
            {/* Account header */}
            <div className="flex items-center justify-between gap-2 px-3 py-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">{account}</span>
              <span className={`text-[10px] font-semibold tabular-nums text-muted-foreground ${blur}`}>{fmtUSD(groupTotal)}</span>
            </div>
            {/* Lines */}
            {items.map((line, i) => (
              <div key={i} className="flex items-start justify-between gap-2 px-5 py-0.5">
                <span className="flex-1 text-[10px] text-muted-foreground/70 leading-tight">
                  {line.description || "—"}
                </span>
                <span className={`shrink-0 text-[10px] tabular-nums text-muted-foreground/70 ${blur}`}>{fmtUSD(line.amount)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Bill payments list ────────────────────────────────────────────────────────

function BillPaymentsList({ payments }: { payments: BillDetail["payments"] }) {
  const blur = useBlur()
  if (payments.length === 0) return null
  return (
    <div className="mx-3 mb-2 rounded-md border border-border/30 bg-background/40 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border/20 px-3 py-1">
        <Banknote className="h-3 w-3 text-red-400" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-red-400">Payments Made</span>
      </div>
      {payments.map((p, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-1 text-[10px]">
          <span className="shrink-0 text-muted-foreground">{fmtDate(p.txn_date)}</span>
          {p.doc_number && <span className="shrink-0 text-muted-foreground/60">#{p.doc_number}</span>}
          {p.private_note && <span className="flex-1 truncate italic text-muted-foreground/50">{p.private_note}</span>}
          <span className={`ml-auto shrink-0 font-semibold tabular-nums text-red-400 ${blur}`}>{fmtUSD(p.total_amount)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Invoice payments list ─────────────────────────────────────────────────────

function InvoicePaymentsList({ payments }: { payments: InvoiceDetail["payments"] }) {
  const blur = useBlur()
  if (payments.length === 0) return (
    <div className="px-5 pb-2 text-[10px] italic text-muted-foreground/40">No payments recorded</div>
  )
  return (
    <div className="mx-3 mb-2 rounded-md border border-border/30 bg-background/40 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border/20 px-3 py-1">
        <Banknote className="h-3 w-3 text-green-500" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-green-500">Payments Received</span>
      </div>
      {payments.map((p, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-1 text-[10px]">
          <span className="shrink-0 text-muted-foreground">{fmtDate(p.txn_date)}</span>
          {p.payment_ref && <span className="shrink-0 text-muted-foreground/60">Ref {p.payment_ref}</span>}
          {p.private_note && <span className="flex-1 truncate italic text-muted-foreground/50">{p.private_note}</span>}
          <span className={`ml-auto shrink-0 font-semibold tabular-nums text-green-500 ${blur}`}>{fmtUSD(p.total_amount)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Entity card (shared shell) ────────────────────────────────────────────────

function EntityCard({
  type, color, left, date, amount, defaultOpen = false, hasPayments = false, paymentColor, children,
}: {
  type: keyof typeof TYPE_CFG
  color: string
  left: React.ReactNode
  date?: string | null
  amount: number
  defaultOpen?: boolean
  hasPayments?: boolean
  paymentColor?: string
  children?: React.ReactNode
}) {
  const blur = useBlur()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden bg-card/30">
      <button
        onClick={() => children && setOpen(o => !o)}
        className={cn(
          "flex w-full items-center text-left transition-colors",
          children && "hover:bg-muted/20 cursor-pointer"
        )}
      >
        {/* Chevron — fixed 24px */}
        <span className="flex h-full w-6 shrink-0 items-center justify-center pl-1">
          {children && (
            <ChevronRight className={cn(
              "h-3 w-3 text-muted-foreground/60 transition-transform duration-200",
              open && "rotate-90"
            )} />
          )}
        </span>

        {/* Badge + optional banknote — fixed */}
        <span className="flex shrink-0 items-center gap-1 py-2 pr-2">
          <TypeBadge type={type} />
          {hasPayments && (
            <Banknote className="h-3 w-3 shrink-0" style={{ color: paymentColor ?? "#888" }} />
          )}
        </span>

        {/* Title / description — variable, clips */}
        <span className="flex flex-1 items-center gap-1.5 min-w-0 py-2 pr-2">
          {left}
        </span>

        {/* Date — fixed 56px, left border */}
        <span className="flex w-14 shrink-0 items-center justify-center border-l border-border/30 py-2 text-[10px] tabular-nums text-muted-foreground/60">
          {date ? fmtDate(date) : "—"}
        </span>

        {/* Amount — fixed 96px (supports 6 digits), left border */}
        <span
          className={`flex w-24 shrink-0 items-center justify-end border-l border-border/30 py-2 pr-3 text-[11px] font-semibold tabular-nums ${blur}`}
          style={{ color }}
        >
          {fmtUSD(amount)}
        </span>
      </button>
      {open && children && (
        <div className="border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Estimate section ──────────────────────────────────────────────────────────

function EstimateSection({ estimate }: {
  estimate: NonNullable<ReturnType<typeof useQBProjectDetail>["data"]>["estimate"]
}) {
  const blur = useBlur()
  const [open, setOpen] = useState(true)
  if (!estimate) return null
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 bg-muted/30 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-semibold">Estimate</span>
        {estimate.doc_number && (
          <span className="text-[10px] text-muted-foreground">#{estimate.doc_number}</span>
        )}
        <span className="text-[10px] text-muted-foreground">{fmtDate(estimate.txn_date)}</span>
        {estimate.txn_status && (
          <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-green-600">
            {estimate.txn_status}
          </span>
        )}
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className={`text-xs font-bold tabular-nums ${blur}`}>{fmtUSD(estimate.total_amount)}</span>
          <ChevronRight className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            open && "rotate-90"
          )} />
        </div>
      </button>
      {open && estimate.lines.length > 0 && (
        <div className="divide-y divide-border/20">
          {estimate.lines.map((line, i) => (
            <div key={i} className="flex items-start justify-between gap-3 px-5 py-1.5">
              <span className="flex-1 text-[11px] text-muted-foreground leading-tight">
                {line.description || line.item_ref_name || "—"}
              </span>
              <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                {line.quantity > 0 && line.unit_price > 0 && (
                  <span className={blur}>{line.quantity} × {fmtUSD(line.unit_price)}</span>
                )}
                <span className={`font-semibold text-foreground w-20 text-right ${blur}`}>{fmtUSD(line.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Expenses column ───────────────────────────────────────────────────────────

function ExpensesColumn({
  bills, purchases, vendorCredits,
}: {
  bills: BillDetail[]
  purchases: PurchaseDetail[]
  vendorCredits: VendorCreditDetail[]
}) {
  const totalBills   = bills.reduce((s, b) => s + b.total_amount, 0)
  const totalPurch   = purchases.reduce((s, p) => s + p.total_amount, 0)
  const totalCredits = vendorCredits.reduce((s, v) => s + v.total_amount, 0)
  const grandTotal   = totalBills + totalPurch + totalCredits

  // Merge and sort all expense entities by date
  type ExpenseItem =
    | { kind: "bill";    data: BillDetail }
    | { kind: "purchase"; data: PurchaseDetail }
    | { kind: "credit";  data: VendorCreditDetail }

  const items: ExpenseItem[] = [
    ...bills.map(b => ({ kind: "bill" as const, data: b })),
    ...purchases.map(p => ({ kind: "purchase" as const, data: p })),
    ...vendorCredits.map(v => ({ kind: "credit" as const, data: v })),
  ].sort((a, b) => (a.data.txn_date ?? "").localeCompare(b.data.txn_date ?? ""))

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <div className="rounded-lg border border-border/30 px-4 py-6 text-center text-[11px] italic text-muted-foreground/50">
          No expense records
        </div>
      )}

      {items.map((item, idx) => {
        if (item.kind === "bill") {
          const b = item.data
          return (
            <EntityCard
              key={`bill-${b.external_id}-${idx}`}
              type="bill"
              color="#f28b82"
              amount={b.total_amount}
              hasPayments={b.payments.length > 0}
              paymentColor="#f87171"
              date={b.txn_date}
              left={<>
                <span className="truncate text-[11px] font-medium">{b.vendor_name || "—"}</span>
                {b.doc_number && <span className="shrink-0 text-[10px] text-muted-foreground/60">#{b.doc_number}</span>}
              </>}
            >
              {b.lines.length > 0 && <GroupedLines lines={b.lines} />}
              <BillPaymentsList payments={b.payments} />
            </EntityCard>
          )
        }

        if (item.kind === "purchase") {
          const p = item.data
          const label = p.private_note || p.payment_type || "Purchase"
          return (
            <EntityCard
              key={`purch-${p.external_id}-${idx}`}
              type="purchase"
              color="#ff9800"
              amount={p.total_amount}
              date={p.txn_date}
              left={<span className="truncate text-[11px] font-medium">{label}</span>}
            >
              {p.lines.length > 0 && <GroupedLines lines={p.lines} />}
            </EntityCard>
          )
        }

        // vendor credit
        const v = item.data as VendorCreditDetail
        return (
          <EntityCard
            key={`credit-${v.external_id}-${idx}`}
            type="credit"
            color="#4caf50"
            amount={v.total_amount}
            date={v.txn_date}
            left={<>
              <span className="truncate text-[11px] font-medium">{v.vendor_name || "—"}</span>
              {v.doc_number && <span className="shrink-0 text-[10px] text-muted-foreground/60">#{v.doc_number}</span>}
            </>}
          >
            {v.lines.length > 0 && <GroupedLines lines={v.lines} />}
          </EntityCard>
        )
      })}
    </div>
  )
}

// ── Revenue column ────────────────────────────────────────────────────────────

function RevenueColumn({
  invoices, backcharges,
}: {
  invoices: InvoiceDetail[]
  backcharges: BackchargeDetail[]
}) {
  const blur = useBlur()

  type RevenueItem =
    | { kind: "invoice"; data: InvoiceDetail }
    | { kind: "charge";  data: BackchargeDetail; idx: number }

  const items: RevenueItem[] = [
    ...invoices.map(i => ({ kind: "invoice" as const, data: i })),
    ...backcharges.map((b, idx) => ({ kind: "charge" as const, data: b, idx })),
  ].sort((a, b) => {
    const da = a.kind === "invoice" ? a.data.txn_date : a.data.txn_date
    const db = b.kind === "invoice" ? b.data.txn_date : b.data.txn_date
    return (da ?? "").localeCompare(db ?? "")
  })

  if (items.length === 0) return (
    <div className="rounded-lg border border-border/30 px-4 py-6 text-center text-[11px] italic text-muted-foreground/50">
      No revenue records
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => {
        if (item.kind === "invoice") {
          const inv = item.data
          return (
            <EntityCard
              key={`inv-${inv.external_id}`}
              type="invoice"
              color="#a7e9af"
              amount={inv.total_amount}
              hasPayments={inv.payments.length > 0}
              paymentColor="#22c55e"
              date={inv.txn_date}
              left={<>
                {inv.doc_number && <span className="shrink-0 text-[10px] text-muted-foreground/70">#{inv.doc_number}</span>}
                {inv.balance > 0 && (
                  <span className={`shrink-0 rounded-full bg-yellow-500/10 px-1.5 text-[9px] font-semibold text-yellow-600 ${blur}`}>
                    Balance {fmtUSD(inv.balance)}
                  </span>
                )}
              </>}
            >
              <div className="pt-1 pb-1">
                <InvoicePaymentsList payments={inv.payments} />
              </div>
            </EntityCard>
          )
        }

        const bc = item.data as BackchargeDetail
        return (
          <EntityCard
            key={`charge-${item.idx}-${idx}`}
            type="charge"
            color="#fb923c"
            amount={bc.amount}
            date={bc.txn_date}
            left={<span className="truncate text-[11px] font-medium">{bc.description || bc.memo || "Back Charge"}</span>}
          />
        )
      })}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface ProjectDetailModalProps {
  company: string
  customerID: string
  onClose: () => void
}

export function ProjectDetailModal({ company, customerID, onClose }: ProjectDetailModalProps) {
  const { data, isLoading } = useQBProjectDetail({ company, customer_id: customerID })
  const { showFinancialData, toggleFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? "blur-sm select-none pointer-events-none" : ""

  const totalExpenses = [
    ...(data?.bills ?? []).map(b => b.total_amount),
    ...(data?.purchases ?? []).map(p => p.total_amount),
    ...(data?.vendor_credits ?? []).map(v => v.total_amount),
  ].reduce((s, v) => s + v, 0)

  const totalInvoiced = [
    ...(data?.invoices ?? []).map(i => i.total_amount),
    ...(data?.backcharges ?? []).map(b => b.amount),
  ].reduce((s, v) => s + v, 0)

  return (
    <FinancialCtx.Provider value={showFinancialData}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="relative flex max-h-[90vh] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold leading-tight">{data?.customer_name ?? "Project Detail"}</p>
                {data?.estimate && (
                  <p className="text-[10px] text-muted-foreground">
                    Estimate {data.estimate.doc_number ? `#${data.estimate.doc_number}` : ""} · {fmtDate(data.estimate.txn_date)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Financial data toggle */}
              <button
                onClick={toggleFinancialData}
                title={showFinancialData ? "Hide financial data" : "Show financial data"}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {showFinancialData
                  ? <Eye className="h-4 w-4" />
                  : <EyeOff className="h-4 w-4" />
                }
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>


          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !data ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data found
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Estimate */}
                <EstimateSection estimate={data.estimate} />

                {/* Legend */}
                <div className="grid grid-cols-3 divide-x divide-border/30 rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
                  {/* Expenses */}
                  <div className="flex flex-col gap-1.5 px-4 py-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">Expenses</p>
                    <div className="flex items-center gap-1.5">
                      <TypeBadge type="bill" />
                      <span className="text-[10px] text-muted-foreground">Vendor bill</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TypeBadge type="purchase" />
                      <span className="text-[10px] text-muted-foreground">Purchase order</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TypeBadge type="credit" />
                      <span className="text-[10px] text-muted-foreground">Vendor credit</span>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="flex flex-col gap-1.5 px-4 py-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">Revenue</p>
                    <div className="flex items-center gap-1.5">
                      <TypeBadge type="invoice" />
                      <span className="text-[10px] text-muted-foreground">Customer invoice</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TypeBadge type="charge" />
                      <span className="text-[10px] text-muted-foreground">Back charge / deposit</span>
                    </div>
                  </div>

                  {/* Indicators */}
                  <div className="flex flex-col gap-1.5 px-4 py-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">Indicators</p>
                    <div className="flex items-center gap-1.5">
                      <Banknote className="h-3 w-3 shrink-0" style={{ color: "#f87171" }} />
                      <span className="text-[10px] text-muted-foreground">Payment made</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Banknote className="h-3 w-3 shrink-0" style={{ color: "#22c55e" }} />
                      <span className="text-[10px] text-muted-foreground">Payment received</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-600">Balance</span>
                      <span className="text-[10px] text-muted-foreground">Outstanding invoice balance</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                      <span className="text-[10px] text-muted-foreground">Click to expand details</span>
                    </div>
                  </div>
                </div>

                {/* Two-column: Expenses | Revenue */}
                <div className="grid grid-cols-2 items-start gap-3">
                  {/* Expenses panel */}
                  <div className="flex flex-col rounded-xl border border-border bg-muted/10">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <span className="text-xs font-semibold text-red-400">Expenses</span>
                      <span className={`text-xs font-bold tabular-nums text-red-400 ${blur}`}>{fmtUSD(totalExpenses)}</span>
                    </div>
                    <div className="flex flex-col gap-2 p-3">
                      <ExpensesColumn
                        bills={data.bills}
                        purchases={data.purchases}
                        vendorCredits={data.vendor_credits}
                      />
                    </div>
                  </div>

                  {/* Revenue panel */}
                  <div className="flex flex-col rounded-xl border border-border bg-muted/10">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <span className="text-xs font-semibold text-green-400">Revenue</span>
                      <span className={`text-xs font-bold tabular-nums text-green-400 ${blur}`}>{fmtUSD(totalInvoiced)}</span>
                    </div>
                    <div className="flex flex-col gap-2 p-3">
                      <RevenueColumn
                        invoices={data.invoices}
                        backcharges={data.backcharges}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </FinancialCtx.Provider>
  )
}
