'use client'

import { useState, useEffect } from "react"
import {
  ChevronDown, ChevronRight, Plus, Save, Trash2, Loader2, Pencil,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  useOportunidades, useCreateOportunidade, useUpdateOportunidade, useDeleteOportunidade,
} from "@/hooks/use-insights"
import type { Oportunidade } from "@/services/insights.service"
import { MONTHS, fmtDate } from "./lib"

// ── Opportunity Edit Form ─────────────────────────────────────────────────────

const EMPTY_OPP = { titulo: "", desafio: "", melhoria: "" }

export function OportunidadeEditForm({
  telaId, mes, ano, userId, existing, onDone,
}: {
  telaId: string; mes: number; ano: number; userId: string
  existing: Oportunidade | null
  onDone: () => void
}) {
  const createM = useCreateOportunidade()
  const updateM = useUpdateOportunidade()
  const [form, setForm] = useState(EMPTY_OPP)

  useEffect(() => {
    if (existing) {
      setForm({
        titulo:   existing.titulo,
        desafio:  (existing.desafios  ?? [])[0]?.texto ?? "",
        melhoria: (existing.melhorias ?? [])[0]?.texto ?? "",
      })
    } else {
      setForm(EMPTY_OPP)
    }
  }, [existing])

  function save() {
    const payload = {
      usuarioId: userId, telaId, mes, ano,
      titulo:    form.titulo,
      desafios:  form.desafio  ? [{ texto: form.desafio  }] : [],
      melhorias: form.melhoria ? [{ texto: form.melhoria }] : [],
    }
    if (existing) {
      updateM.mutate({ id: existing.id, data: payload }, { onSuccess: onDone })
    } else {
      createM.mutate(payload, { onSuccess: onDone })
    }
  }

  const saving = createM.isPending || updateM.isPending

  return (
    <div className="space-y-3">
      <input
        value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
        placeholder="Title *"
        className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
      />
      <textarea
        value={form.desafio} onChange={e => setForm(f => ({ ...f, desafio: e.target.value }))}
        placeholder="Challenge…" rows={2}
        className="w-full resize-none rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
      />
      <textarea
        value={form.melhoria} onChange={e => setForm(f => ({ ...f, melhoria: e.target.value }))}
        placeholder="Improvement…" rows={2}
        className="w-full resize-none rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
      />
      <div className="flex gap-2 border-t border-border/40 pt-2">
        <button onClick={save} disabled={saving || !form.titulo.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {existing ? "Update" : "Add"}
        </button>
        <button onClick={onDone}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Opportunities section ─────────────────────────────────────────────────────

export function OportunidadesSection({
  telaId, mes, ano, userId, canWrite,
}: {
  telaId: string; mes: number; ano: number; userId: string; canWrite: boolean
}) {
  const { data: rawAll, isLoading } = useOportunidades(telaId, undefined, undefined, userId)
  const all: Oportunidade[] = rawAll ?? []
  const deleteM = useDeleteOportunidade()

  const currentKey = `${ano}-${mes}`
  const [expandedKey, setExpandedKey] = useState<string>(currentKey)
  const [modal, setModal] = useState<{ mes: number; ano: number; opp: Oportunidade | null } | null>(null)

  const grouped = new Map<string, { mes: number; ano: number; opps: Oportunidade[] }>()
  for (const o of all) {
    const key = `${o.ano}-${o.mes}`
    if (!grouped.has(key)) grouped.set(key, { mes: o.mes, ano: o.ano, opps: [] })
    grouped.get(key)!.opps.push(o)
  }
  if (!grouped.has(currentKey)) grouped.set(currentKey, { mes, ano, opps: [] })
  const periods = [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, v]) => ({ key, ...v }))

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  )

  return (
    <>
      <div className="divide-y divide-border/40">
        {periods.map(({ key, mes: pMes, ano: pAno, opps }) => {
          const isOpen    = expandedKey === key
          const isCurrent = key === currentKey
          return (
            <div key={key}>
              <div className="flex items-center gap-2 py-2">
                <button
                  onClick={() => setExpandedKey(isOpen ? '' : key)}
                  className="flex flex-1 items-center gap-2 text-left transition-colors hover:text-foreground"
                >
                  {isOpen
                    ? <ChevronDown  className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  }
                  <span className="text-xs font-medium">{MONTHS[pMes - 1]} {pAno}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Current</span>
                  )}
                </button>
                {canWrite && (
                  <button
                    onClick={() => setModal({ mes: pMes, ano: pAno, opp: null })}
                    className="rounded p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
                    title="Add opportunity"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {opps.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{opps.length}</span>
                )}
              </div>

              {isOpen && (
                <div className="space-y-2 pb-3">
                  {opps.map(o => (
                    <div key={o.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{o.titulo}</p>
                        {canWrite && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => setModal({ mes: pMes, ano: pAno, opp: o })}
                              className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => deleteM.mutate(o.id)}
                              className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {(o.desafios ?? [])[0] && (
                        <div className="mt-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Challenge</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{(o.desafios ?? [])[0].texto}</p>
                        </div>
                      )}
                      {(o.melhorias ?? [])[0] && (
                        <div className="mt-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Improvement</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{(o.melhorias ?? [])[0].texto}</p>
                        </div>
                      )}
                      <div className="mt-2 space-y-0.5">
                        <p className="text-[10px] text-muted-foreground/40">
                          Created by <span className="font-medium">{o.criadoPorNome || "—"}</span>
                          {" · "}{fmtDate(o.criadoEm)}
                        </p>
                        {o.editadoPorNome && o.editadoPorNome !== o.criadoPorNome && (
                          <p className="text-[10px] text-muted-foreground/40">
                            Edited by <span className="font-medium">{o.editadoPorNome}</span>
                            {" · "}{fmtDate(o.updatedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {opps.length === 0 && (
                    <p className="text-xs italic text-muted-foreground/50">No opportunities for this period.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={!!modal} onOpenChange={o => { if (!o) setModal(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {modal?.opp ? "Edit Opportunity" : "New Opportunity"}
              {modal ? ` — ${MONTHS[modal.mes - 1]} ${modal.ano}` : ""}
            </DialogTitle>
          </DialogHeader>
          {modal && (
            <OportunidadeEditForm
              telaId={telaId} mes={modal.mes} ano={modal.ano}
              userId={userId} existing={modal.opp}
              onDone={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
