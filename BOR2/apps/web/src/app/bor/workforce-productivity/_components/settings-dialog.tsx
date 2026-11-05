"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { formatAmount, parseMoneyInput } from "@/lib/money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Building2, CalendarClock, Check, CircleDollarSign, Search, ShieldUser, Clock4, Loader2, Pencil, Plus, Split, X } from "lucide-react"
import { toast } from "sonner"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Sep } from "@/components/common/insight-card"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { workforceInsightsService, type ForecastBuildingRef, type InsightsSettings, type QBTBuilding } from "@/services/workforce-insights.service"
import { AttributionRuleChips, AttributionRulesModal } from "../attribution-rules-modal"

const qbtKey = (jobsite: string, building: string) => `${jobsite}|${building}`

function Section({ value, icon: Icon, title, hint, children }: {
  value: string; icon: React.ElementType; title: string; hint: string; children: React.ReactNode
}) {
  return (
    <AccordionItem value={value} className="rounded-lg border px-3 not-last:border-b">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex flex-col">
            <span>{title}</span>
            <span className="text-xs font-normal text-muted-foreground">{hint}</span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  )
}

function Chips({ all, selected, onChange }: { all: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const on = new Set(selected.map(s => s.toLowerCase()))
  const options = [...new Set([...all, ...selected])].sort()
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(w => {
        const active = on.has(w.toLowerCase())
        return (
          <button key={w} type="button"
            onClick={() => onChange(active ? selected.filter(s => s.toLowerCase() !== w.toLowerCase()) : [...selected, w])}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
            {w}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Settings da Workforce Productivity: um acordeão por aspecto, um aberto por
 * vez. Grava sozinho. O rate dos funcionários não passa por aqui: fica no
 * servidor.
 */
/** "Neponset at Canton, MA · Building 1": lote só com número leva o tipo da obra (Building, Lot, House). */
const fbName = (b: ForecastBuildingRef) => `${b.jobSite} · ${/^\d+$/.test(b.lot) ? `${b.type || "Building"} ${b.lot}` : b.lot}`

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const fmtDay = (iso: string) => `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/**
 * Expected end do prédio: vem do Forecast e pode ser trocado à mão. A etiqueta diz
 * de onde veio; "Use Forecast date" desfaz a troca.
 */
function EndDate({ forecastEnd, override, onChange }: { forecastEnd: string | null; override?: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const value = override || forecastEnd
  const manual = !!override
  const date = value ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-input px-1.5 text-[11px] tabular-nums hover:bg-muted">
        <CalendarClock className="h-3 w-3 text-muted-foreground" />
        {value ? fmtDay(value) : <span className="text-muted-foreground">No end</span>}
        <span className={`rounded px-1 text-[9px] font-semibold uppercase ${manual ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
          {manual ? "Manual" : "Forecast"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0" positionerStyle={{ width: "auto" }}>
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Expected end{forecastEnd ? ` · Forecast: ${fmtDay(forecastEnd)}` : ""}</p>
        <Calendar mode="single" selected={date} defaultMonth={date}
          onSelect={d => { if (d) { onChange(toIso(d)); setOpen(false) } }} />
        {manual && (
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => { onChange(null); setOpen(false) }}>Use Forecast date</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Seletor com busca dentro da lista (Combobox): mostra o escolhido no campo. */
function Picker<T extends object>({ items, value, onChange, label, extra, placeholder, search }: {
  items: T[]; value: T | null; onChange: (v: T | null) => void; label: (v: T) => string
  extra?: (v: T) => string; placeholder: string; search: string
}) {
  return (
    <Combobox items={items} value={value} onValueChange={v => onChange(v as T | null)} itemToStringLabel={v => label(v as T)}>
      <ComboboxTrigger className="flex h-7 min-w-0 flex-1 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-left text-xs dark:bg-input/30 dark:hover:bg-input/50">
        <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-muted-foreground"}`}>{value ? label(value) : placeholder}</span>
      </ComboboxTrigger>
      <ComboboxContent className="w-auto min-w-(--anchor-width)">
        <ComboboxInput showTrigger={false} placeholder={search} className="text-xs" />
        <ComboboxEmpty>Nothing found.</ComboboxEmpty>
        <ComboboxList>
          {(o: T) => (
            <ComboboxItem key={label(o)} value={o} className="text-xs">
              {label(o)}{extra && <span className="text-muted-foreground"> ({extra(o)})</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export function WorkforceSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["workforce-insights", "settings"], queryFn: workforceInsightsService.settings, enabled: open })
  const [draft, setDraft] = useState<InsightsSettings | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [editRuleId, setEditRuleId] = useState<string>()
  const saved = useRef("")

  useEffect(() => {
    if (!open || !data) return
    setDraft(data.settings)
    saved.current = JSON.stringify(data.settings)
  }, [open, data])

  const save = useMutation({
    mutationFn: (s: InsightsSettings) => workforceInsightsService.saveSettings(s),
    onSuccess: (_, s) => {
      saved.current = JSON.stringify(s)
      void qc.invalidateQueries({ queryKey: ["workforce-insights"] })
    },
    onError: () => toast.error("Could not save the settings"),
  })

  useEffect(() => {
    if (!open || !draft) return
    if (JSON.stringify(draft) === saved.current) return
    const t = setTimeout(() => save.mutate(draft), 600)
    return () => clearTimeout(t)
  }, [draft, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const qbt = useMemo(() => data?.qbtBuildings ?? [], [data])
  const pending = !!draft && JSON.stringify(draft) !== saved.current
  const patch = (p: Partial<InsightsSettings>) => setDraft(d => (d ? { ...d, ...p } : d))

  const link = (forecastId: string, jobsite: string, building: string) =>
    patch({ links: [...(draft?.links ?? []).filter(l => l.forecastId !== forecastId), { forecastId, jobsite, building }] })
  const [addF, setAddF] = useState<ForecastBuildingRef | null>(null)
  const [addQ, setAddQ] = useState<QBTBuilding | null>(null)
  // Editando um vínculo: o par sobe para os campos de cima; ao salvar, o antigo sai.
  const [editId, setEditId] = useState<string | null>(null)
  const [addEnd, setAddEnd] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  // Supervisores marcados primeiro, depois o resto, filtrados pela busca.
  const employees = (data?.employees ?? []).filter(e => e.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(draft?.supervisors.includes(b)) - Number(draft?.supervisors.includes(a)) || a.localeCompare(b))
  const resetAdd = () => { setAddF(null); setAddQ(null); setAddEnd(null); setEditId(null) }
  const unlink = (forecastId: string) => patch({ links: (draft?.links ?? []).filter(l => l.forecastId !== forecastId) })


  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent className="flex max-h-[88vh] flex-col gap-4 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              Workforce Productivity Settings
              <span className="ml-auto mr-6 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                {save.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving</> : pending ? "Unsaved" : <><Check className="h-3.5 w-3.5" />Saved</>}
              </span>
            </DialogTitle>
          </DialogHeader>

          {!draft || !data ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading</div>
          ) : (
            <Accordion multiple={false} className="min-h-0 gap-2 overflow-y-auto pr-1">
              <Section value="buildings" icon={Building2} title={`Buildings (${draft.links.length})`}
                hint="Each link pairs a Forecast job with its job site in QB Time. Add any Forecast job, not only Buildings.">
                {/* grid-cols-1 = minmax(0,1fr): sem ele a coluna cresce até o nome mais longo e a linha passa da largura do modal. */}
                <div className="grid grid-cols-1 gap-2">
                  {/* Novo vínculo: a obra do Forecast e a do QB Time, cada uma com busca. */}
                  <div className="grid grid-cols-1 gap-1.5 rounded-md border border-dashed border-border p-2">
                    {/* Botões em cima, junto do título: a linha de baixo fica só para as duas obras. */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{editId ? "Edit building" : "Add a building"}</p>
                      <div className="flex items-center gap-1">
                        {/* Expected end: começa com a data do Forecast (o fallback) e pode ser trocado à mão. */}
                        {addF && <EndDate forecastEnd={addF.end ?? null} override={addEnd} onChange={setAddEnd} />}
                        <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={!addF || !addQ}
                          onClick={() => {
                            if (!addF || !addQ) return
                            const rest = (draft.links ?? []).filter(l => l.forecastId !== addF.id && l.forecastId !== editId)
                            patch({ links: [...rest, { forecastId: addF.id, jobsite: addQ.jobsite, building: addQ.building, endOverride: addEnd }] })
                            resetAdd()
                          }}>
                          {editId ? <><Check className="h-3.5 w-3.5" />Save</> : <><Plus className="h-3.5 w-3.5" />Add</>}
                        </Button>
                        {editId && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetAdd}>Cancel</Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 max-sm:flex-col max-sm:items-stretch">
                      <Picker<ForecastBuildingRef> items={data.buildings.filter(x => x.id === editId || !draft.links.some(l => l.forecastId === x.id))}
                        value={addF} onChange={setAddF} label={fbName} placeholder="Forecast job" search="Search Forecast job" />
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground max-sm:self-center max-sm:rotate-90" />
                      <Picker<QBTBuilding> items={qbt} value={addQ} onChange={setAddQ} label={o => `${o.jobsite} · ${o.building}`}
                        extra={o => `${Math.round(o.hours)} h`} placeholder="QB Time job site" search="Search QB Time job site" />
                    </div>
                  </div>
                  {draft.links.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">No building linked yet.</p>}
                  {draft.links.map(l => {
                    const fb = data.buildings.find(x => x.id === l.forecastId)
                    return (
                      <div key={l.forecastId} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-xs max-sm:justify-end">
                        {/* No celular os nomes ficam com a linha toda; data e ações descem para a de baixo. */}
                        <span className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{fb ? fbName(fb) : l.forecastId}</span>
                          {fb?.cliente && <span className="text-muted-foreground"><Sep />{fb.cliente}</span>}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{l.jobsite} · {l.building}</span>
                        </span>
                        <EndDate forecastEnd={fb?.end ?? null} override={l.endOverride}
                          onChange={v => patch({ links: draft.links.map(x => (x.forecastId === l.forecastId ? { ...x, endOverride: v } : x)) })} />
                        <button type="button" aria-label="Edit link" onClick={() => {
                          setEditId(l.forecastId); setAddF(fb ?? null); setAddEnd(l.endOverride ?? null)
                          setAddQ(qbt.find(o => o.jobsite === l.jobsite && o.building === l.building) ?? { jobsite: l.jobsite, building: l.building, hours: 0 })
                        }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted hover:text-foreground ${editId === l.forecastId ? "text-primary" : "text-muted-foreground"}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Unlink" onClick={() => { unlink(l.forecastId); if (editId === l.forecastId) resetAdd() }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </Section>

              <Section value="supervisors" icon={ShieldUser} title={`Supervisors (${draft.supervisors.length})`}
                hint="Their hours count like anyone else's; they are only highlighted where hours per person show up.">
                <InputGroup className="mb-2 h-8">
                  <InputGroupAddon><Search /></InputGroupAddon>
                  <InputGroupInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee" />
                </InputGroup>
                <div className="grid max-h-64 gap-0.5 overflow-y-auto sm:grid-cols-2">
                  {employees.map(e => {
                    const on = draft.supervisors.includes(e)
                    return (
                      <label key={e} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted">
                        <Checkbox checked={on} onCheckedChange={v =>
                          patch({ supervisors: v ? [...draft.supervisors, e] : draft.supervisors.filter(x => x !== e) })} />
                        {e}
                      </label>
                    )
                  })}
                </div>
              </Section>

              <Section value="budget" icon={CircleDollarSign} title="Labor Budget per Building"
                hint="Default for every building. The page shows it only as hours.">
                <InputGroup className="h-8 w-48">
                  <InputGroupAddon>$</InputGroupAddon>
                  <InputGroupInput inputMode="numeric" className="text-right tabular-nums" value={formatAmount(draft.buildingBudget)}
                    onChange={e => patch({ buildingBudget: parseMoneyInput(e.target.value) ?? 0 })} />
                </InputGroup>
              </Section>

              <Section value="ignored" icon={Split} title="Work Types Left Out of the Analysis"
                hint="These hours do not count toward any job site or building (e.g. Panels).">
                <Chips all={data.worktypes} selected={draft.ignoredWorktypes} onChange={v => patch({ ignoredWorktypes: v })} />
              </Section>

              <Section value="noncounting" icon={Clock4} title="Work Types That Do Not Count toward 40 h"
                hint="Sick and lunch breaks do not close the weekly 40 h; Holiday does.">
                <Chips all={data.worktypes} selected={draft.nonCountingWorktypes} onChange={v => patch({ nonCountingWorktypes: v })} />
              </Section>

              <Section value="rules" icon={Building2} title="Company Attribution Rules"
                hint="Move hours from one company to another (e.g. Callahan at PCG goes to Framing).">
                <div className="flex flex-col gap-2">
                  <AttributionRuleChips onEdit={id => { setEditRuleId(id); setRulesOpen(true) }} />
                  <Button variant="outline" size="sm" className="h-7 self-start text-xs" onClick={() => { setEditRuleId(undefined); setRulesOpen(true) }}>Open rules</Button>
                </div>
              </Section>
            </Accordion>
          )}
        </DialogContent>
      </Dialog>
      {rulesOpen && <AttributionRulesModal editId={editRuleId} onClose={() => setRulesOpen(false)} />}
    </>
  )
}
