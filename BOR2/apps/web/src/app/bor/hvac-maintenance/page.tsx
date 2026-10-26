"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Archive, Calendar1, CalendarCheck, CalendarCheck2, CalendarClock, CircleDollarSign, FileSignature, MapPin,
  Plus, RefreshCw, Search, Send, User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { hvacMaintenanceService, type MaintenanceContract } from "@/services/hvac-maintenance.service"
import { ContractDialog } from "./_components/contract-dialog"
import { fmtDate, laneOf, money, moneyOf, type Lane } from "./_lib/contract"
import { useDragScroll } from "./_lib/use-drag-scroll"

// HVAC Maintenance.
//
// Substitui a planilha "Maintenance Clients". A página não é um cadastro: é a
// lista do que a HVAC tem de fazer hoje. Cada raia é uma ação (cobrar, agendar,
// renovar) e cada cliente aparece numa raia só. O contrato é lançado à mão; o
// pagamento vem das invoices do QuickBooks, que o sync atualiza todo dia.

const LANES: { key: Lane; title: string; hint: string; Icon: React.ElementType; tone: string }[] = [
  { key: "collect",     title: "Collect payment",  hint: "Invoice sent, open balance",       Icon: CircleDollarSign, tone: "text-red-500" },
  { key: "to_schedule", title: "Schedule a visit", hint: "Paid, next visit has no date",     Icon: CalendarClock,    tone: "text-blue-500" },
  { key: "renew",       title: "Renew",            hint: "Both visits done, contract ended", Icon: RefreshCw,        tone: "text-amber-500" },
  { key: "scheduled",   title: "Scheduled",        hint: "Next visit is on the calendar",    Icon: CalendarCheck,    tone: "text-emerald-500" },
  { key: "prospect",    title: "Prospects",        hint: "Plan sent, no contract yet",       Icon: Send,             tone: "text-muted-foreground" },
]

const ARCHIVED_LANE = { key: "prospect" as Lane, title: "Archived", hint: "Declined, cancelled or gone", Icon: Archive, tone: "text-muted-foreground" }

const ACTIVE_TOGGLE = "border-amber-500/50 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 hover:text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/20 dark:hover:text-amber-400"

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000)

/** A visita que vem a seguir: a 1ª se ainda não houve, senão a 2ª. */
function nextVisit(c: MaintenanceContract, today: string): string | null {
  if (c.firstService && c.firstService > today) return c.firstService
  if (c.secondService && c.secondService > today) return c.secondService
  return null
}

// Ordem dentro da raia: o mais urgente em cima.
const SORT: Record<Lane, (a: MaintenanceContract, b: MaintenanceContract, today: string) => number> = {
  collect: (a, b) => moneyOf(b.contractValue, b.invoiceStatus).open - moneyOf(a.contractValue, a.invoiceStatus).open,
  to_schedule: (a, b) => (a.contractStart ?? "").localeCompare(b.contractStart ?? ""),
  renew: (a, b) => (a.secondService ?? "").localeCompare(b.secondService ?? ""),
  scheduled: (a, b, t) => (nextVisit(a, t) ?? "").localeCompare(nextVisit(b, t) ?? ""),
  prospect: (a, b) => (b.planSentOn ?? "").localeCompare(a.planSentOn ?? ""),
}

export default function HvacMaintenancePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["hvac-maintenance"], queryFn: hvacMaintenanceService.list })
  const [today] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
  const [query, setQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<MaintenanceContract | "new" | null>(null)
  const board = useDragScroll<HTMLDivElement>()

  const all = useMemo(() => data ?? [], [data])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(c => !q || [c.clientName, c.address, c.city, c.email, ...c.invoices].join(" ").toLowerCase().includes(q))
  }, [all, query])

  const lanes = useMemo(() => LANES.map(l => ({
    ...l,
    items: visible.filter(c => laneOf(c) === l.key).sort((a, b) => SORT[l.key](a, b, today)),
  })), [visible, today])

  // O dinheiro da carteira ativa, somado das mesmas contas do cartão.
  const totals = useMemo(() => all.filter(c => !c.archived && c.contractStart).reduce((t, c) => {
    const m = moneyOf(c.contractValue, c.invoiceStatus)
    return { value: t.value + (m.value ?? 0), paid: t.paid + m.paid, open: t.open + m.open, toInvoice: t.toInvoice + (m.toInvoice ?? 0) }
  }, { value: 0, paid: 0, open: 0, toInvoice: 0 }), [all])

  if (isLoading) return <PageSkeleton />
  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Could not load the maintenance contracts.</div>
  }

  const archived = visible.filter(c => c.archived)

  return (
    <>
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold">HVAC Maintenance</h1>
            <p className="text-xs text-muted-foreground">Who to collect, schedule and renew. Payments come from QuickBooks every day.</p>
          </div>
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput value={query} onChange={e => setQuery(e.target.value)} placeholder="Client, address or invoice" />
          </InputGroup>
          <Button
            variant="outline" aria-pressed={showArchived}
            className={showArchived ? ACTIVE_TOGGLE : ""}
            onClick={() => setShowArchived(v => !v)}
            title={showArchived ? "Back to the board" : "Declined, cancelled or no longer clients"}
          >
            <Archive className="h-4 w-4" /> Archived ({archived.length})
          </Button>
          <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New client</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Total label="Active contracts" amount={totals.value} />
          <Total label="Received" amount={totals.paid} tone="text-emerald-600 dark:text-emerald-400" />
          <Total label="Open in QuickBooks" amount={totals.open} tone="text-red-600 dark:text-red-400" />
          <Total label="Not invoiced yet" amount={totals.toInvoice} tone="text-amber-600 dark:text-amber-400" />
        </div>

        <div {...board} className="flex min-h-0 flex-1 cursor-grab gap-3 overflow-x-auto rounded-xl border bg-card p-3 select-none">
          {(showArchived ? [{ ...ARCHIVED_LANE, items: archived }] : lanes).map(l => (
            <section key={l.title} className="flex w-[280px] min-w-[260px] shrink-0 flex-col rounded-xl border bg-background xl:flex-1">
              <header className="flex items-start gap-2 border-b px-3 py-2.5">
                <l.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${l.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{l.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{l.hint}</p>
                </div>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">{l.items.length}</span>
              </header>
              <div data-lane-scroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {l.items.map(c => <ClientCard key={c.id} c={c} lane={l.key} today={today} onOpen={() => setEditing(c)} />)}
                {l.items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nothing here.</p>}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* O BOR não monta um Toaster global; sem este, "Saved" e os erros não
          apareciam. Fica fora da coluna para não roubar altura do quadro. */}
      <Toaster position="bottom-right" />
      {editing && <ContractDialog contract={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function Total({ label, amount, tone = "" }: { label: string; amount: number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{money(amount)}</p>
    </div>
  )
}

// O cartão responde à pergunta da raia na primeira linha, e embaixo mostra o
// ciclo do contrato e o dinheiro dele. A trilha da grade é minmax(0, 1fr): o
// texto comprido corta ou quebra dentro da coluna, em vez de alargar o cartão.
function ClientCard({ c, lane, today, onOpen }: { c: MaintenanceContract; lane: Lane; today: string; onOpen: () => void }) {
  const m = moneyOf(c.contractValue, c.invoiceStatus)
  const openInv = c.invoiceStatus.filter(i => (i.balance ?? 0) > 0)
  const next = nextVisit(c, today)
  const ago = (d: string) => { const n = daysBetween(d, today); return n === 0 ? "today" : `${n}d ago` }

  const headline = {
    collect: { big: `${money(m.open)} open`, small: openInv.map(i => `#${i.number} sent ${fmtDate(i.date)} (${ago(i.date!)})`).join(", "), tone: "text-red-600 dark:text-red-400" },
    to_schedule: {
      big: c.firstService ? "Book the 2nd visit" : "Book the 1st visit",
      small: c.firstService ? `1st visit was ${fmtDate(c.firstService)}` : `Paid since ${fmtDate(c.contractStart)} (${ago(c.contractStart!)})`,
      tone: "text-blue-600 dark:text-blue-400",
    },
    renew: { big: "Send the renewal", small: `Last visit ${fmtDate(c.secondService)} (${ago(c.secondService!)})`, tone: "text-amber-600 dark:text-amber-400" },
    scheduled: { big: `Visit ${fmtDate(next)}`, small: next ? `in ${daysBetween(today, next)} days` : "", tone: "text-emerald-600 dark:text-emerald-400" },
    prospect: { big: c.planSentOn ? `Plan sent ${fmtDate(c.planSentOn)}` : "No plan sent", small: c.planSentOn ? ago(c.planSentOn) : "", tone: "text-muted-foreground" },
  }[lane]

  const paidPct = m.value ? Math.min(100, (m.paid / m.value) * 100) : 0
  const openPct = m.value ? Math.min(100 - paidPct, (m.open / m.value) * 100) : 0

  return (
    <button
      type="button" onClick={onOpen}
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50"
    >
      {/* A HVAC reconhece a casa pelo endereço, não pelo nome de quem mora nela. */}
      <div className="min-w-0">
        <p className="flex items-start gap-1.5 text-sm leading-snug font-semibold">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words">
            {c.address || "No address"}
            {c.city && <span className="font-normal text-muted-foreground">, {c.city}</span>}
          </span>
        </p>
        <p className="mt-0.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <User className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{c.clientName}</span>
        </p>
      </div>

      <div className="min-w-0">
        <p className={`text-sm font-semibold tabular-nums ${headline.tone}`}>{headline.big}</p>
        {headline.small && <p className="truncate text-[11px] text-muted-foreground tabular-nums" title={headline.small}>{headline.small}</p>}
      </div>

      {lane !== "prospect" && (
        <div className="grid grid-cols-3 gap-1">
          <Step icon={FileSignature} label="Contract" date={c.contractStart} today={today} />
          <Step icon={Calendar1} label="1st visit" date={c.firstService} today={today} />
          <Step icon={CalendarCheck2} label="2nd visit" date={c.secondService} today={today} />
        </div>
      )}

      {m.value ? (
        <div className="grid gap-1">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${paidPct}%` }} />
            <div className="bg-red-500" style={{ width: `${openPct}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {money(m.paid)} of {money(m.value)} paid
            {m.toInvoice ? <span className="text-amber-600 dark:text-amber-400"> · {money(m.toInvoice)} not invoiced</span> : null}
          </p>
        </div>
      ) : lane !== "prospect" && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">No contract value yet</p>
      )}
    </button>
  )
}

/** Um passo do ciclo: feito (verde), marcado (azul) ou vazio. */
function Step({ icon: Icon, label, date, today }: { icon: React.ElementType; label: string; date: string | null; today: string }) {
  const tone = !date ? "text-muted-foreground/40" : date <= today ? "text-emerald-500" : "text-blue-500"
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-md bg-muted/40 px-1 py-1.5" title={`${label}: ${date ? fmtDate(date) : "no date"}`}>
      <Icon className={`h-3.5 w-3.5 ${tone}`} />
      <span className="text-[10px] text-muted-foreground tabular-nums">{date ? fmtDate(date).slice(0, 5) : "—"}</span>
    </div>
  )
}
