"use client"

import { useState } from "react"
import { ArrowRight, CalendarIcon, ChevronDown, History, Loader2, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { DocChecklist } from "@/components/features/data-control/project-card"
import {
  useForecastDateHistory, useSetHVACActual, useSetHVACPurchase, useTogglePermit,
  useUpdateForecast, useUpdateHVACStages,
} from "@/hooks/use-forecast"
import {
  businessDaysBefore, FIELDS, formatDate, STAGE_DB_NAME, STAGES, startOfToday, toISO,
  type ProjectStages, type StageKey,
} from "../_lib/stages"
import { Tip } from "./tip"

// Tudo o que se altera numa obra da HVAC, numa janela só: as datas das quatro
// etapas (planejado, realizado e compra), o QuickBooks Time e o Permit.
//
// As datas só são gravadas no Save. QuickBooks Time e Permit gravam na hora,
// como no Data Control.

type Draft = {
  start: Date | null
  end: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  purchasedOn: Date | null
}

const same = (a: Date | null, b: Date | null) => a?.getTime() === b?.getTime()

// O aviso de atraso de um campo do realizado, pintado na borda. Vermelho: o
// planejado já passou e nada foi registrado. Âmbar: foi registrado, mas depois
// do planejado.
type Alert = { tone: "missed" | "late"; text: string } | undefined

function alertOf(planned: Date | null, actual: Date | null, today: Date, what: string): Alert {
  if (!planned) return undefined
  if (actual) {
    return actual > planned ? { tone: "late", text: `${what} after the planned date (${formatDate(planned)})` } : undefined
  }
  return planned < today ? { tone: "missed", text: `${what} was due on ${formatDate(planned)} and is not recorded` } : undefined
}

const ALERT_BORDER = {
  missed: "border-red-500/70 dark:border-red-500/70",
  late: "border-amber-500/70 dark:border-amber-500/70",
}

export function ProjectSettingsDialog({
  lot, lotLabel, open, onOpenChange,
}: {
  lot: ProjectStages
  lotLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const p = lot.project
  const [draft, setDraft] = useState<Record<StageKey, Draft>>(() =>
    Object.fromEntries(lot.stages.map(s => [s.key, {
      start: s.start, end: s.end, actualStart: s.actualStart, actualEnd: s.actualEnd, purchasedOn: s.purchasedOn,
    }])) as Record<StageKey, Draft>)
  const [error, setError] = useState("")
  const today = startOfToday()

  const savePlanned = useUpdateHVACStages()
  const saveActual = useSetHVACActual()
  const savePurchase = useSetHVACPurchase()
  const update = useUpdateForecast()
  const permit = useTogglePermit()
  const saving = savePlanned.isPending || saveActual.isPending || savePurchase.isPending

  const set = (key: StageKey, field: keyof Draft, value: Date | null) =>
    setDraft(d => ({ ...d, [key]: { ...d[key], [field]: value } }))

  // O que muda no planejado, já no formato da requisição e em frase para a tela.
  const dates: Record<string, string | null> = {}
  const changes: { label: string; from: Date | null; to: Date | null }[] = []
  for (const s of lot.stages) {
    const d = draft[s.key]
    if (!same(s.start, d.start)) {
      dates[FIELDS[s.key].start as string] = d.start ? toISO(d.start) : null
      changes.push({ label: `${s.label} · start`, from: s.start, to: d.start })
    }
    if (!same(s.end, d.end)) {
      dates[FIELDS[s.key].end as string] = d.end ? toISO(d.end) : null
      changes.push({ label: `${s.label} · end`, from: s.end, to: d.end })
    }
  }
  const actualChanged = lot.stages.filter(s =>
    !same(s.actualStart, draft[s.key].actualStart) || !same(s.actualEnd, draft[s.key].actualEnd))
  const purchaseChanged = lot.stages.filter(s => !same(s.purchasedOn, draft[s.key].purchasedOn))

  async function confirm() {
    setError("")
    if (changes.length === 0 && actualChanged.length === 0 && purchaseChanged.length === 0) {
      onOpenChange(false)
      return
    }
    const semInicio = lot.stages.find(s => draft[s.key].actualEnd && !draft[s.key].actualStart)
    if (semInicio) {
      setError(`${semInicio.label} cannot end before it starts.`)
      return
    }
    try {
      if (changes.length > 0) {
        await savePlanned.mutateAsync({ id: p.id, dates, note: "" })
      }
      for (const s of actualChanged) {
        const d = draft[s.key]
        await saveActual.mutateAsync({
          id: p.id,
          stage: STAGE_DB_NAME[s.key],
          actualStart: d.actualStart ? toISO(d.actualStart) : null,
          actualEnd: d.actualEnd ? toISO(d.actualEnd) : null,
          note: "",
        })
      }
      for (const s of purchaseChanged) {
        const d = draft[s.key]
        await savePurchase.mutateAsync({
          id: p.id, stage: STAGE_DB_NAME[s.key], purchasedOn: d.purchasedOn ? toISO(d.purchasedOn) : null,
        })
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            {lotLabel} · {p.jobSite?.trim() || "No jobsite"}
            {p.address?.trim() ? ` · ${p.address.trim()}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {/* As quatro etapas, duas a duas. Em cada uma, compra, início e fim nas
              colunas; planejado em cima, realizado embaixo. */}
          <div className="grid gap-3 md:grid-cols-2">
            {lot.stages.map(s => {
              const d = draft[s.key]
              const leadDays = STAGES.find(x => x.key === s.key)!.leadDays
              const purchaseBy = d.start ? businessDaysBefore(d.start, leadDays) : null
              // Etapa já começada não cobra mais a compra: o material chegou.
              const buyAlert = d.purchasedOn || !d.actualStart
                ? alertOf(purchaseBy, d.purchasedOn, today, "Purchase") : undefined
              const startAlert = alertOf(d.start, d.actualStart, today, "Start")
              const endAlert = alertOf(d.end, d.actualEnd, today, "End")
              return (
                <div key={s.key} className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <s.Icon className="h-4 w-4 text-muted-foreground" />
                    {s.full}
                  </p>
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-2 gap-y-1.5">
                    <span />
                    <ColumnTitle>Buy by</ColumnTitle>
                    <ColumnTitle>Start</ColumnTitle>
                    <ColumnTitle>End</ColumnTitle>

                    <RowTitle>Planned</RowTitle>
                    <Tip text={`Calculated: ${leadDays} business days before the planned start`}>
                      <div className="flex h-8 items-center justify-between rounded-lg border border-dashed px-2 text-xs tabular-nums text-muted-foreground">
                        {purchaseBy ? formatDate(purchaseBy) : "No date"}
                        <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                      </div>
                    </Tip>
                    <DateField label={`${s.label} planned start`} value={d.start} onChange={v => set(s.key, "start", v)} />
                    <DateField label={`${s.label} planned end`} value={d.end} onChange={v => set(s.key, "end", v)} />

                    <RowTitle>Actual</RowTitle>
                    <DateField label={`${s.label} purchased on`} value={d.purchasedOn} alert={buyAlert} onChange={v => set(s.key, "purchasedOn", v)} />
                    <DateField label={`${s.label} actual start`} value={d.actualStart} alert={startAlert} onChange={v => set(s.key, "actualStart", v)} />
                    <DateField label={`${s.label} actual end`} value={d.actualEnd} alert={endAlert} onChange={v => set(s.key, "actualEnd", v)} />
                  </div>
                </div>
              )
            })}
          </div>

          {changes.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {changes.length === 1 ? "1 planned date will change" : `${changes.length} planned dates will change`}
              </p>
              {changes.map(c => (
                <p key={c.label} className="flex items-center gap-2 text-xs tabular-nums">
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  <span className="text-muted-foreground">{formatDate(c.from)}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>{formatDate(c.to)}</span>
                </p>
              ))}
            </div>
          )}

          {/* Embaixo, duas colunas do mesmo peso: à esquerda as integrações e o
              histórico, à direita o Permit. Sozinho, o QuickBooks Time ficava um
              cartão baixo ao lado de um alto. */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Integrations</span>
                <label className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_qbtime.png" alt="" className="h-4 w-4 shrink-0 object-contain dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_qbtime_dark.png" alt="" className="hidden h-4 w-4 shrink-0 object-contain dark:block" />
                  <span className="flex-1 text-[13px]">QuickBooks Time</span>
                  {update.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    : <Switch checked={!!p.qbTime} onCheckedChange={v => update.mutate({ id: p.id, data: { qbTime: v } })} />}
                </label>
              </div>
              <DateHistory projectId={p.id} />
            </div>

            <div className="rounded-lg border p-3">
              <DocChecklist
                title="Permit"
                wide
                docs={(p.permit ?? []).map(s => ({ id: s.id, status: s.status, document: s.step }))}
                pendingId={permit.isPending ? permit.variables?.permitId : undefined}
                onToggle={(permitId, status) => permit.mutate({ permitId, status })}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// O histórico de datas planejadas das quatro etapas, do mais recente para o
// mais antigo.
//
// O registro é feito por trigger no banco, então cobre qualquer caminho de
// escrita: esta tela, a rotina de atualização ou SQL na mão. É por isso que
// `source` importa tanto quanto o valor: diz se a data veio de alguém ou da
// máquina.
function DateHistory({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useForecastDateHistory(projectId, open)

  const names = new Map<string, string>()
  for (const s of STAGES) {
    names.set(FIELDS[s.key].start as string, `${s.label} · start`)
    names.set(FIELDS[s.key].end as string, `${s.label} · end`)
  }
  const entries = (data ?? []).filter(e => names.has(e.field)).reverse()

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
      >
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Change history</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="max-h-44 overflow-y-auto border-t px-3 py-2">
          {isLoading ? (
            <Loader2 className="mx-auto my-3 h-4 w-4 animate-spin text-muted-foreground" />
          ) : entries.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No planned date of this project has ever changed.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {entries.map(e => (
                <li key={e.id} className="text-xs">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-medium">{names.get(e.field)}</span>
                    <span className="tabular-nums text-muted-foreground">{shortDate(e.oldValue)}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="tabular-nums">{shortDate(e.newValue)}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {new Date(e.changedAt).toLocaleDateString("en-US", {
                        month: "2-digit", day: "2-digit", year: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {e.source === "manual" ? (e.changedBy || "by hand") : e.source}
                    {e.note ? `: ${e.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${m}/${d}/${y.slice(2)}`
}

function ColumnTitle({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</span>
}

function RowTitle({ children }: { children: React.ReactNode }) {
  return <span className="pr-1 text-xs font-medium text-muted-foreground">{children}</span>
}

// O rótulo não aparece: quem diz o que o campo é são a coluna e a linha do
// quadro. Ele fica para o leitor de tela.
function DateField({
  label, value, alert, onChange,
}: {
  label: string
  value: Date | null
  alert?: Alert
  onChange: (date: Date | null) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Tip text={alert?.text}>
    <div className="min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              aria-label={label}
              className={`h-8 w-full justify-between px-2 text-xs font-normal tabular-nums ${alert ? ALERT_BORDER[alert.tone] : ""}`}
            >
              {value ? formatDate(value) : <span className="text-muted-foreground">No date</span>}
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0" positionerStyle={{ width: "auto" }}>
          <Calendar
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? undefined}
            onSelect={date => {
              onChange(date ?? null)
              setOpen(false)
            }}
          />
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear date
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
    </Tip>
  )
}
