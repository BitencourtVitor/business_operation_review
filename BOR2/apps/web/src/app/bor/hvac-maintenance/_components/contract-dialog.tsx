"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive, ArchiveRestore, Building2, Calendar1, CalendarCheck2, CalendarClock, CircleAlert, CircleCheck, CircleDashed, CircleSlash, DollarSign, FilePlus2, FileSignature, List,
  Link2, Loader2, Mail, MapPin, MessageSquareText, Phone, Receipt, RefreshCw, Save, Search, Send, Trash2, Unlink, User, X,
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  hvacMaintenanceService, type MaintenanceContract, type MaintenanceInput, type MaintenanceInvoice,
} from "@/services/hvac-maintenance.service"
import { Comments } from "./comments"
import { Fold } from "./fold"
import { amountText, fmtDate, maskAmount, maskPhone, money, moneyOf } from "../_lib/contract"

type Form = Omit<MaintenanceInput, "invoices"> & { invoices: MaintenanceInvoice[] }

const EMPTY: Form = {
  clientName: "", address: "", city: "", phone: "", email: "",
  planSentOn: null, contractStart: null, contractValue: null, invoices: [],
  firstService: null, secondService: null, archived: false,
}

export function ContractDialog({ contract, onClose }: { contract: MaintenanceContract | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(() => contract
    ? {
        clientName: contract.clientName, address: contract.address, city: contract.city,
        phone: maskPhone(contract.phone), email: contract.email,
        planSentOn: contract.planSentOn, contractStart: contract.contractStart, contractValue: contract.contractValue,
        invoices: contract.invoiceStatus, firstService: contract.firstService, secondService: contract.secondService,
        archived: contract.archived,
      }
    : EMPTY)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  const done = () => {
    // Prefixo: recarrega a lista e também a conversa, que ganha o comentário da renovação.
    void qc.invalidateQueries({ queryKey: ["hvac-maintenance"] })
    onClose()
  }
  // Renovação em andamento: o texto do ciclo que terminou, que vira comentário
  // ao salvar, e a chave que reabre o calendário do novo início.
  const [renewalNote, setRenewalNote] = useState<string | null>(null)
  const [renewKey, setRenewKey] = useState(0)
  const [panel, setPanel] = useState<"invoices" | "comments">("invoices")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const body: MaintenanceInput = { ...form, invoices: form.invoices.map(i => i.number) }
      if (!contract) return hvacMaintenanceService.create(body)
      await hvacMaintenanceService.update(contract.id, body)
      if (renewalNote) await hvacMaintenanceService.addComment(contract.id, renewalNote)
    },
    onSuccess: () => { toast.success("Saved"); done() },
    onError: () => toast.error("Could not save"),
  })
  const remove = useMutation({
    mutationFn: () => hvacMaintenanceService.remove(contract!.id),
    onSuccess: () => { toast.success("Deleted"); done() },
    onError: () => toast.error("Could not delete"),
  })

  // Renovar é começar o ciclo de novo: as visitas e as invoices do contrato
  // anterior saem do formulário; o valor fica, porque costuma se repetir. O
  // ciclo que terminou não se perde: vira comentário quando a renovação é salva.
  const renew = () => {
    const old = [
      `contract start ${fmtDate(form.contractStart)}`,
      `1st visit ${fmtDate(form.firstService)}`,
      `2nd visit ${fmtDate(form.secondService)}`,
      `invoices ${form.invoices.map(i => `#${i.number}`).join(", ") || "none"}`,
    ].join(", ")
    setRenewalNote(`Renewal started. Previous cycle: ${old}.`)
    setForm(f => ({ ...f, contractStart: null, firstService: null, secondService: null, invoices: [] }))
    setRenewKey(k => k + 1)
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex h-[min(94vh,860px)] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          {/* Como no cartão: a casa pelo endereço, e quem mora nela embaixo. */}
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>
              {contract ? (contract.address || contract.clientName) : "New client"}
              {contract?.city && <span className="font-normal text-muted-foreground">, {contract.city}</span>}
            </span>
            {contract && contract.address && (
              <>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-normal text-muted-foreground">{contract.clientName}</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Duas colunas: quem é e o que foi combinado à esquerda; o dinheiro, à direita. */}
        <div className="grid min-h-0 flex-1 gap-6 max-lg:overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:divide-x">
          <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-6">
            <Section title="Client">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[65fr_35fr]">
                  <Field label="Address">
                    <IconInput icon={MapPin} value={form.address} onChange={v => set("address", v)} placeholder="Street and number" />
                  </Field>
                  <Field label="City">
                    <IconInput icon={Building2} value={form.city} onChange={v => set("city", v)} placeholder="City" />
                  </Field>
                </div>
                <Field label="Name" className="sm:col-span-2">
                  <IconInput icon={User} value={form.clientName} onChange={v => set("clientName", v)} placeholder="Client name" />
                </Field>
                <Field label="Phone">
                  <IconInput icon={Phone} value={form.phone} onChange={v => set("phone", maskPhone(v))} placeholder="(000) 000-0000" inputMode="tel" />
                </Field>
                <Field label="Email">
                  <IconInput icon={Mail} value={form.email} onChange={v => set("email", v)} placeholder="name@email.com" type="email" />
                </Field>
              </div>
            </Section>

            <Section
              title="Contract" className="border-t pt-3"
              aside={renewalNote && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="flex animate-in cursor-help items-center gap-1 rounded-full border border-amber-500/40 duration-300 fade-in slide-in-from-right-4 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          <RefreshCw className="h-3 w-3" /> Renewal started
                        </span>
                      }
                    />
                    <TooltipContent side="left" className="max-w-[280px] text-xs">
                      The previous cycle was cleared from the form: contract start, both visits and the linked invoices.
                      Set the new contract start and link the renewal invoice. When you click Save, the previous cycle
                      is kept as a comment. Nothing is saved until then; Cancel undoes it.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Plan sent on"><DateInput icon={Send} value={form.planSentOn} onChange={v => set("planSentOn", v)} /></Field>
                <Field label="Contract start">
                  <DateInput key={renewKey} defaultOpen={renewKey > 0} icon={FileSignature} value={form.contractStart} onChange={v => set("contractStart", v)} />
                </Field>
                <Field label="1st visit"><DateInput icon={Calendar1} value={form.firstService} onChange={v => set("firstService", v)} /></Field>
                <Field label="2nd visit"><DateInput icon={CalendarCheck2} value={form.secondService} onChange={v => set("secondService", v)} /></Field>
              </div>
            </Section>

          </div>

          {/* À direita, o dinheiro em cima e a conversa embaixo. O modal tem altura
              fixa: a busca de invoice e os comentários abertos dividem o que sobra,
              cada um rolando por dentro. */}
          <div className="flex min-h-0 flex-col gap-3">
            <Section title="Payments (QuickBooks)">
              <MoneyStrip value={form.contractValue} onValueChange={v => set("contractValue", v)} invoices={form.invoices} />
            </Section>
            {/* Sanfona de um aberto só: abrir os comentários recolhe as invoices e vice-versa. */}
            <Fold
              title="Invoices" count={form.invoices.length}
              open={panel === "invoices"} onToggle={() => setPanel(p => (p === "invoices" ? "comments" : "invoices"))}
              summary={form.invoices.map(i => `#${i.number}`).join(", ")}
            >
              <InvoiceList invoices={form.invoices} onChange={v => set("invoices", v)} />
            </Fold>
            {contract
              ? <Comments contractId={contract.id} open={panel === "comments"} onToggle={() => setPanel(p => (p === "comments" ? "invoices" : "comments"))} />
              : (
                <Section title="Comments" className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">Save the client first, then comments can be added.</p>
                </Section>
              )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Duas aparências, sempre com borda: neutro quando ativo, âmbar quando arquivado. */}
            <Button
              variant="outline" aria-pressed={form.archived}
              className={form.archived ? "border-amber-500/50 bg-amber-500/15 dark:border-amber-500/50 dark:bg-amber-500/15 dark:hover:bg-amber-500/20 text-amber-700 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400" : ""}
              title="Declined, cancelled or no longer a client"
              onClick={() => set("archived", !form.archived)}
            >
              {form.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {form.archived ? "Archived" : "Archive"}
            </Button>
            {contract && (
              <Button
                variant="outline" className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:border-red-500/40 dark:text-red-400"
                disabled={remove.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            {contract?.stage === "renew" && !renewalNote && (
              <Button variant="outline" onClick={renew} title="Clears contract start, visits and invoices of the cycle that ended">
                <RefreshCw className="h-4 w-4" /> Start renewal
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}><X className="h-4 w-4" /> Cancel</Button>
            <Button disabled={!form.clientName.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {contract && (
        <DeleteConfirm
          contract={contract} open={confirmDelete} onOpenChange={setConfirmDelete}
          comments={qc.getQueryData<unknown[]>(["hvac-maintenance", contract.id, "comments"])?.length}
          pending={remove.isPending} onConfirm={() => remove.mutate()}
        />
      )}
    </Dialog>
  )
}

// Apagar não tem volta, então a pergunta mostra o contrato que vai sumir (os
// dados salvos, não o que está meio editado no formulário) e o que vai junto.
function DeleteConfirm({ contract, open, onOpenChange, comments, pending, onConfirm }: {
  contract: MaintenanceContract; open: boolean; onOpenChange: (v: boolean) => void
  comments?: number; pending: boolean; onConfirm: () => void
}) {
  const m = moneyOf(contract.contractValue, contract.invoiceStatus)
  const rows: { Icon: React.ElementType; label: string; value: string }[] = [
    { Icon: MapPin, label: "Address", value: [contract.address, contract.city].filter(Boolean).join(", ") || "No address" },
    { Icon: User, label: "Client", value: contract.clientName },
    { Icon: FileSignature, label: "Contract start", value: fmtDate(contract.contractStart) },
    { Icon: DollarSign, label: "Contract value", value: contract.contractValue == null ? "—" : money(contract.contractValue) },
    { Icon: Receipt, label: "Linked invoices", value: contract.invoices.length ? `${contract.invoices.map(n => `#${n}`).join(", ")} (${money(m.paid)} paid, ${money(m.open)} open)` : "None" },
    { Icon: MessageSquareText, label: "Comments", value: comments == null ? "—" : String(comments) },
  ]
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" /> Delete this contract?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This removes the contract and its comments for good. The invoices stay in QuickBooks; only the link to this contract goes away.
            If the client just declined or left, Archive keeps the history instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          {rows.map(r => (
            <div key={r.label} className="flex items-start gap-2">
              <r.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <dt className="w-28 shrink-0 text-xs text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 break-words tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel><X className="h-4 w-4" /> Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700" disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete contract
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Section({ title, className = "", aside, children }: {
  title: string; className?: string; aside?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function IconInput({ icon: Icon, onChange, ...props }: { icon: React.ElementType; onChange: (v: string) => void } & Omit<React.ComponentProps<"input">, "onChange">) {
  return (
    <InputGroup>
      <InputGroupAddon><Icon /></InputGroupAddon>
      <InputGroupInput {...props} onChange={e => onChange(e.target.value)} />
    </InputGroup>
  )
}

/** Campo de data: ícone do que a data é, calendário ao clicar, limpar dentro do campo. */
function DateInput({ icon: Icon, value, onChange, defaultOpen = false }: {
  icon: React.ElementType; value: string | null; onChange: (v: string | null) => void; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const date = value ? new Date(`${value}T12:00:00`) : undefined
  return (
    <InputGroup>
      <InputGroupAddon><Icon /></InputGroupAddon>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="h-full flex-1 px-1.5 text-left text-sm tabular-nums outline-none">
          {value ? fmtDate(value) : <span className="text-muted-foreground">Pick a date</span>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0" positionerStyle={{ width: "auto" }}>
          <Calendar
            mode="single" selected={date} defaultMonth={date}
            onSelect={d => {
              if (!d) return
              onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear date" onClick={() => onChange(null)}><X /></InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

// Os totais do contrato: o valor (digitado no próprio bloco) e o que as invoices
// já cobraram, pagaram, deixam em aberto e falta faturar.
function MoneyStrip({ value, onValueChange, invoices }: {
  value: number | null; onValueChange: (v: number | null) => void; invoices: MaintenanceInvoice[]
}) {
  const m = moneyOf(value, invoices)
  const tiles: { label: string; amount: number | null; Icon: React.ElementType; tone: string }[] = [
    { label: "Invoiced", amount: m.invoiced, Icon: Receipt, tone: "" },
    { label: "Paid", amount: m.paid, Icon: CircleCheck, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Open", amount: m.open, Icon: CircleAlert, tone: m.open > 0 ? "text-red-600 dark:text-red-400" : "" },
    { label: "To invoice", amount: m.toInvoice, Icon: FilePlus2, tone: m.toInvoice ? "text-amber-600 dark:text-amber-400" : "" },
  ]
  // O valor do contrato é digitado no próprio bloco dele: é a base de que os
  // outros quatro números saem, e não aparece em dois lugares.
  return (
    <div className="grid shrink-0 grid-cols-5 divide-x rounded-lg border bg-muted/30">
      <div className="grid min-w-0 gap-1 px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground"><FileSignature className="h-3.5 w-3.5 shrink-0" /> Contract</p>
        <InputGroup className="h-8 bg-background">
          <InputGroupAddon><DollarSign /></InputGroupAddon>
          <InputGroupInput
            inputMode="decimal" placeholder="0.00" aria-label="Contract value"
            className="text-right font-semibold tabular-nums"
            value={amountText(value)} onChange={e => onValueChange(maskAmount(e.target.value))}
          />
        </InputGroup>
      </div>
      {tiles.map(t => (
        <div key={t.label} className="grid min-w-0 content-between gap-1 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground"><t.Icon className={`h-3.5 w-3.5 shrink-0 ${t.tone}`} /> {t.label}</p>
          <p className={`text-sm font-semibold tabular-nums ${t.tone}`}>{t.amount == null ? "—" : money(t.amount)}</p>
        </div>
      ))}
    </div>
  )
}

// As invoices vinculadas, que rolam por dentro quando não cabem, e o vincular.
function InvoiceList({ invoices, onChange }: { invoices: MaintenanceInvoice[]; onChange: (v: MaintenanceInvoice[]) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {invoices.map(inv => (
        <InvoiceCard key={inv.number} inv={inv} onUnlink={() => onChange(invoices.filter(i => i.number !== inv.number))} />
      ))}
      <InvoiceSearch linked={invoices.map(i => i.number)} onPick={inv => onChange([...invoices, inv])} />
    </div>
  )
}

// A situação da invoice com o mesmo ícone e a mesma cor dos totais lá em cima,
// para "Open" e "Paid" quererem dizer a mesma coisa no modal inteiro.
function invoiceState(inv: MaintenanceInvoice): { text: string; Icon: React.ElementType; tone: string } {
  if (!inv.found) return { text: "Not in QuickBooks yet", Icon: CircleDashed, tone: "text-muted-foreground" }
  if (!inv.total) return { text: "Void", Icon: CircleSlash, tone: "text-muted-foreground" }
  if ((inv.balance ?? 0) > 0) return { text: "Open", Icon: CircleAlert, tone: "text-red-600 dark:text-red-400" }
  return { text: "Paid", Icon: CircleCheck, tone: "text-emerald-600 dark:text-emerald-400" }
}

/** Com `amount`, o "Open" diz quanto: "$568.00 open". */
function InvoiceStatus({ inv, amount, className = "" }: { inv: MaintenanceInvoice; amount?: number; className?: string }) {
  const st = invoiceState(inv)
  const text = st.text === "Open" && amount ? `${money(amount)} open` : st.text
  return (
    <span className={`flex items-center gap-1 text-[11px] font-medium whitespace-nowrap ${st.tone} ${className}`}>
      <st.Icon className="h-3.5 w-3.5 shrink-0" /> {text}
    </span>
  )
}

// A condição (selo) e o dinheiro (à direita) ficam separados: o selo diz se
// está pago, os números dizem quanto.
function InvoiceCard({ inv, onUnlink }: { inv: MaintenanceInvoice; onUnlink: () => void }) {
  const items = (inv.lines ?? []).map(l => l.description?.split("\n")[0].trim()).filter(Boolean).join(" · ")
  const open = inv.balance ?? 0
  return (
    <div className="flex shrink-0 items-start gap-3 rounded-lg border px-3 py-2.5">
      <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">#{inv.number}</span>
          {inv.customer && <span className="truncate text-xs text-muted-foreground">{inv.customer}</span>}
        </div>
        {inv.found && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            <span className="flex items-center gap-1"><Send className="h-3 w-3" /> Sent {fmtDate(inv.date)}</span>
            <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Due {fmtDate(inv.dueDate)}</span>
            {inv.paidOn && <span className="flex items-center gap-1"><CircleCheck className="h-3 w-3" /> Paid {fmtDate(inv.paidOn)}</span>}
          </p>
        )}
        {items && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><List className="h-3 w-3 shrink-0" /> <span className="truncate">{items}</span></p>}
      </div>
      {/* Embaixo do valor, a situação com o ícone dela; em aberto, quanto falta. */}
      <div className="grid shrink-0 justify-items-end gap-0.5 tabular-nums">
        {!!inv.total && <p className="text-sm font-semibold">{money(inv.total)}</p>}
        <InvoiceStatus inv={inv} amount={open} />
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Unlink invoice ${inv.number}`} title="Unlink" onClick={onUnlink}>
        <Unlink className="h-4 w-4" />
      </Button>
    </div>
  )
}

// Vincular é um botão. Clicado, o botão some e no lugar dele aparece a caixa
// com a busca no topo e os resultados embaixo, rolando por dentro. Sem nada
// digitado, mostra as invoices mais recentes da HVAC.
function InvoiceSearch({ linked, onPick }: { linked: string[]; onPick: (inv: MaintenanceInvoice) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [q, setQ] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  const { data, isFetching } = useQuery({
    queryKey: ["hvac-maintenance", "invoices", q],
    queryFn: () => hvacMaintenanceService.searchInvoices(q),
    enabled: open,
  })
  const results = (data ?? []).filter(i => !linked.includes(i.number))
  // Invoice enviada hoje ainda não chegou pelo sync: dá para vincular pelo
  // número e a situação aparece sozinha quando o sync passar.
  const manual = /^\d{3,}$/.test(q) && !linked.includes(q) && !results.some(i => i.number === q)
  const close = () => { setOpen(false); setText(""); setQ("") }
  const pick = (inv: MaintenanceInvoice) => { onPick(inv); close() }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Link2 className="h-4 w-4" /> Link invoice
      </button>
    )
  }

  return (
    <div className="flex min-h-48 flex-1 flex-col overflow-hidden rounded-lg border" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close() } }}>
      <div className="border-b p-2">
        <InputGroup>
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Search by invoice number or customer name" />
          {isFetching && <InputGroupAddon align="inline-end"><Loader2 className="animate-spin" /></InputGroupAddon>}
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Close invoice search" onClick={close}><X /></InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="max-h-72 min-h-0 flex-1 overflow-y-auto lg:max-h-none">
        {!q && <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground uppercase">Latest invoices</p>}
        {results.map(inv => (
          <button
            key={inv.number} type="button" onClick={() => pick(inv)}
            className="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent/50"
          >
            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">#{inv.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{inv.customer}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <Send className="h-3 w-3" /> {fmtDate(inv.date)}
                {inv.linkedTo && <span className="truncate text-amber-600 dark:text-amber-400"> · linked to {inv.linkedTo}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums">{money(inv.total ?? 0)}</span>
              <InvoiceStatus inv={inv} className="justify-end" />
            </span>
          </button>
        ))}
        {manual && (
          <button
            type="button" onClick={() => pick({ number: q, found: false })}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/50"
          >
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Link #{q} now; QuickBooks data shows up after the next sync
          </button>
        )}
        {!isFetching && results.length === 0 && !manual && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No invoice found.</p>
        )}
      </div>
    </div>
  )
}
