"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, CalendarClock, Check, Goal, Loader2, Plus, Tag, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useForecast } from "@/hooks/use-forecast"
import { monthlyExecutionService, type GoalCheckpoint, type GoalGroup } from "@/services/monthly-execution.service"
import { MONTH_NAMES, siteKey } from "../_lib/series"

const at = (c: GoalCheckpoint) => c.year * 12 + c.month

/**
 * Settings da página: quais job sites contam, agrupados quando dividem a meta
 * (Walpole = Station Walk + Towns), e os checkpoints de cada grupo. Grava
 * sozinho, como o resto do BOR: não tem botão de salvar.
 */
export function SettingsDialog({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: GoalGroup[] }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<GoalGroup[]>([])
  const saved = useRef("")
  const { data: forecast = [] } = useForecast({ company: "framing" })

  useEffect(() => {
    if (!open) return
    const copy = groups.map(({ goals: _goals, ...g }) => g)
    setDraft(copy)
    saved.current = JSON.stringify(copy)
  }, [open, groups])

  const sites = useMemo(() => {
    const all = new Map<string, { cliente: string; jobSite: string }>()
    for (const p of forecast) if (p.cliente && p.jobSite) all.set(siteKey(p.cliente, p.jobSite), { cliente: p.cliente, jobSite: p.jobSite })
    return [...all.values()].sort((a, b) => a.cliente.localeCompare(b.cliente) || a.jobSite.localeCompare(b.jobSite))
  }, [forecast])
  const used = new Set(draft.flatMap(g => g.sites.map(s => siteKey(s.cliente, s.jobSite))))
  const free = sites.filter(s => !used.has(siteKey(s.cliente, s.jobSite)))

  const save = useMutation({
    mutationFn: (next: GoalGroup[]) => monthlyExecutionService.saveGoals(next),
    onSuccess: (_, next) => {
      saved.current = JSON.stringify(next)
      void qc.invalidateQueries({ queryKey: ["monthly-execution", "goals"] })
    },
    onError: () => toast.error("Could not save the goals"),
  })

  // Grava 600 ms depois da última mudança, e só o que está completo: grupo sem
  // nome ou sem job site espera a pessoa terminar.
  useEffect(() => {
    if (!open) return
    const json = JSON.stringify(draft)
    if (json === saved.current || draft.some(g => !g.name.trim() || !g.sites.length)) return
    const t = setTimeout(() => save.mutate(draft), 600)
    return () => clearTimeout(t)
  }, [draft, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i: number, change: Partial<GoalGroup>) =>
    setDraft(d => d.map((g, j) => (j === i ? { ...g, ...change } : g)))

  const now = new Date()
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
  const pending = JSON.stringify(draft) !== saved.current

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            Monthly Execution settings
            <span className="ml-auto mr-6 flex items-center gap-1 text-xs font-normal text-muted-foreground">
              {save.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving</> : pending ? "Unsaved" : <><Check className="h-3.5 w-3.5" />Saved</>}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Only job sites listed here count on the page. A checkpoint sets the monthly goal from that month on; earlier months keep the goal they had.
          </p>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 overflow-y-auto pr-1">
          {draft.map((g, i) => (
            <div key={g.id || `new-${i}`} className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <InputGroup className="h-8">
                  <InputGroupAddon><Tag /></InputGroupAddon>
                  <InputGroupInput value={g.name} placeholder="Group name" onChange={e => patch(i, { name: e.target.value })} />
                </InputGroup>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:text-red-600" aria-label="Remove group"
                  onClick={() => setDraft(d => d.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {g.sites.map(s => (
                  <span key={siteKey(s.cliente, s.jobSite)} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-1 text-xs">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {s.jobSite}
                    <span className="text-muted-foreground">· {s.cliente}</span>
                    <button className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Remove job site"
                      onClick={() => patch(i, { sites: g.sites.filter(x => x !== s) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Select value="" onValueChange={v => {
                  const s = free.find(x => siteKey(x.cliente, x.jobSite) === v)
                  if (s) patch(i, { sites: [...g.sites, s], name: g.name || s.jobSite.replace(/,.*$/, "") })
                }}>
                  <SelectTrigger className="h-7 w-auto gap-1 text-xs"><Plus className="h-3.5 w-3.5" />Job site</SelectTrigger>
                  <SelectContent>
                    {free.map(s => (
                      <SelectItem key={siteKey(s.cliente, s.jobSite)} value={siteKey(s.cliente, s.jobSite)}>
                        {s.jobSite} <span className="text-muted-foreground">· {s.cliente}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                {[...g.checkpoints].sort((a, b) => at(a) - at(b)).map(c => {
                  const k = g.checkpoints.indexOf(c)
                  const set = (change: Partial<GoalCheckpoint>) =>
                    patch(i, { checkpoints: g.checkpoints.map((x, j) => (j === k ? { ...x, ...change } : x)) })
                  return (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">From</span>
                      <Select value={String(c.month)} onValueChange={v => v && set({ month: Number(v) })}>
                        <SelectTrigger className="h-7 w-[120px] text-xs"><span className="flex-1 text-left">{MONTH_NAMES[c.month - 1]}</span></SelectTrigger>
                        <SelectContent>{MONTH_NAMES.map((n, m) => <SelectItem key={n} value={String(m + 1)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={String(c.year)} onValueChange={v => v && set({ year: Number(v) })}>
                        <SelectTrigger className="h-7 w-[84px] text-xs"><span className="flex-1 text-left">{c.year}</span></SelectTrigger>
                        <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                      </Select>
                      <InputGroup className="h-7 w-[150px]">
                        <InputGroupAddon><Goal /></InputGroupAddon>
                        <InputGroupInput type="number" min={0} value={c.goal} className="text-xs"
                          onChange={e => set({ goal: Math.max(0, Number(e.target.value) || 0) })} />
                        <InputGroupAddon align="inline-end" className="text-xs">houses/mo</InputGroupAddon>
                      </InputGroup>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-red-600" aria-label="Remove checkpoint"
                        onClick={() => patch(i, { checkpoints: g.checkpoints.filter((_, j) => j !== k) })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
                <Button variant="ghost" size="sm" className="h-7 w-fit gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    const last = [...g.checkpoints].sort((a, b) => at(b) - at(a))[0]
                    patch(i, { checkpoints: [...g.checkpoints, { year: now.getFullYear(), month: now.getMonth() + 1, goal: last?.goal ?? 0 }] })
                  }}>
                  <Plus className="h-3.5 w-3.5" />Checkpoint
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-fit gap-1"
            onClick={() => setDraft(d => [...d, { id: "", name: "", sites: [], checkpoints: [{ year: now.getFullYear(), month: now.getMonth() + 1, goal: 1 }] }])}>
            <Plus className="h-4 w-4" />Group
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
