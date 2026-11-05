"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { formatAmount, parseMoneyInput } from "@/lib/money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, Check, CircleDollarSign, Clock4, Loader2, Sparkles, Split, X } from "lucide-react"
import { toast } from "sonner"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { workforceInsightsService, type InsightsSettings } from "@/services/workforce-insights.service"
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
const STATUS_TONE: Record<string, string> = {
  open: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  closed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
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
              <Section value="buildings" icon={Building2} title="Buildings"
                hint="Every Building in the Forecast is listed. Pick its job site in QB Time.">
                <div className="grid gap-2">
                  {data.buildings.map(b => {
                    const l = draft.links.find(x => x.forecastId === b.id)
                    const sg = data.suggestions[b.id]
                    return (
                      <div key={b.id} className="grid gap-1.5 rounded-md border bg-muted/20 p-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{b.jobSite} · {/^\d+$/.test(b.lot) ? `Building ${b.lot}` : b.lot}</span>
                            <span className="text-muted-foreground"> · {b.cliente}</span>
                          </span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_TONE[b.status] ?? "border-border text-muted-foreground"}`}>{b.status}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* O campo mostra a obra vinculada, com X para desvincular e seta para abrir; a busca fica dentro da lista. */}
                          <Combobox items={qbt}
                            value={l ? qbt.find(o => o.jobsite === l.jobsite && o.building === l.building) ?? { jobsite: l.jobsite, building: l.building, hours: 0 } : null}
                            isItemEqualToValue={(a, b) => a.jobsite === b.jobsite && a.building === b.building}
                            itemToStringLabel={o => `${o.jobsite} · ${o.building}`}
                            onValueChange={o => (o ? link(b.id, o.jobsite, o.building) : unlink(b.id))}>
                            <div className="relative min-w-0 flex-1">
                              <ComboboxTrigger className="flex h-7 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-left text-xs dark:bg-input/30 dark:hover:bg-input/50">
                                <span className={`min-w-0 flex-1 truncate ${l ? "" : "text-muted-foreground"} ${l ? "pr-6" : ""}`}>{l ? `${l.jobsite} · ${l.building}` : "Not linked"}</span>
                              </ComboboxTrigger>
                              {l && (
                                <button type="button" aria-label="Unlink" onClick={() => unlink(b.id)}
                                  className="absolute top-1/2 right-7 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <ComboboxContent className="w-auto min-w-(--anchor-width)">
                              <ComboboxInput showTrigger={false} placeholder="Search QB Time job site" className="text-xs" />
                              <ComboboxEmpty>No QB Time job site found.</ComboboxEmpty>
                              <ComboboxList>
                                {(o: (typeof qbt)[number]) => (
                                  <ComboboxItem key={qbtKey(o.jobsite, o.building)} value={o} className="text-xs">
                                    {o.jobsite} · {o.building} <span className="text-muted-foreground">({Math.round(o.hours)} h)</span>
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                          {!l && sg && (
                            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => link(b.id, sg.jobsite, sg.building)}>
                              <Sparkles className="h-3.5 w-3.5" />{sg.jobsite} · {sg.building}
                            </Button>
                          )}
                        </div>
                      </div>
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
