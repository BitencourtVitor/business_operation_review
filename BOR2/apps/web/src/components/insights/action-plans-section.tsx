'use client'

import { useState, useEffect } from "react"
import {
  ChevronDown, ChevronRight, Plus, Save, Trash2, X, Loader2, Pencil,
  CalendarDays, Users,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  usePlanos, useCreatePlano, useUpdatePlano, useDeletePlano,
} from "@/hooks/use-insights"
import type { PlanoDeAcao, Acao } from "@/services/insights.service"
import { fmtDate, STATUS_CONFIG } from "./lib"

// ── Action Plan Edit Form ─────────────────────────────────────────────────────

const EMPTY_STEP = { titulo: "", responsavel: "", status: "pending" as const, dataLimite: "" }
const EMPTY_PLAN = { titulo: "", descricao: "", dataInicio: "", dataFim: "", acoes: [{ ...EMPTY_STEP }] }

export function PlanoEditForm({
  telaId, userId, existing, onDone,
}: {
  telaId: string; userId: string
  existing: PlanoDeAcao | null
  onDone: () => void
}) {
  const createM = useCreatePlano()
  const updateM = useUpdatePlano()
  const [form, setForm] = useState({ ...EMPTY_PLAN, acoes: [{ ...EMPTY_STEP }] })

  useEffect(() => {
    if (existing) {
      setForm({
        titulo:     existing.titulo,
        descricao:  existing.descricao,
        dataInicio: existing.dataInicio ? existing.dataInicio.substring(0, 10) : "",
        dataFim:    existing.dataFim    ? existing.dataFim.substring(0, 10)    : "",
        acoes:      (existing.acoes ?? []).map(a => ({
          titulo:      a.titulo,
          responsavel: a.responsavel,
          status:      a.status as "pending" | "in_progress" | "done",
          dataLimite:  a.dataLimite ? a.dataLimite.substring(0, 10) : "",
        })),
      })
    } else {
      setForm({ ...EMPTY_PLAN, acoes: [{ ...EMPTY_STEP }] })
    }
  }, [existing])

  function save() {
    const payload = {
      usuarioId:  userId,
      telaId,
      titulo:     form.titulo,
      descricao:  form.descricao,
      dataInicio: form.dataInicio || null,
      dataFim:    form.dataFim    || null,
      acoes:      form.acoes.filter(a => a.titulo.trim()).map(a => ({
        titulo:      a.titulo,
        responsavel: a.responsavel,
        status:      a.status,
        dataLimite:  a.dataLimite || null,
      })),
    }
    if (existing) {
      updateM.mutate({ id: existing.id, data: payload }, { onSuccess: onDone })
    } else {
      createM.mutate(payload, { onSuccess: onDone })
    }
  }

  const saving = createM.isPending || updateM.isPending

  return (
    <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      <input
        value={form.titulo}
        onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
        placeholder="Plan title *"
        className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
      />
      <textarea
        value={form.descricao}
        onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
        placeholder="Description…"
        rows={2}
        className="w-full resize-none rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Start</label>
          <input type="date" value={form.dataInicio}
            onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))}
            className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">End</label>
          <input type="date" value={form.dataFim}
            onChange={e => setForm(f => ({ ...f, dataFim: e.target.value }))}
            className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Steps</p>
        {form.acoes.map((a, i) => (
          <div key={i} className="mb-2 space-y-1.5 rounded-md border border-border/60 bg-background/50 p-2.5">
            <input
              value={a.titulo} placeholder="Step title"
              onChange={e => {
                const n = [...form.acoes]; n[i] = { ...n[i], titulo: e.target.value }
                setForm(f => ({ ...f, acoes: n }))
              }}
              className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none focus:border-border focus:bg-muted/40 placeholder:text-muted-foreground/40"
            />
            <div className="flex gap-1.5">
              <input
                value={a.responsavel} placeholder="Responsible"
                onChange={e => {
                  const n = [...form.acoes]; n[i] = { ...n[i], responsavel: e.target.value }
                  setForm(f => ({ ...f, acoes: n }))
                }}
                className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none focus:border-border focus:bg-muted/40 placeholder:text-muted-foreground/40"
              />
              <select
                value={a.status}
                onChange={e => {
                  const n = [...form.acoes]; n[i] = { ...n[i], status: e.target.value as "pending" | "in_progress" | "done" }
                  setForm(f => ({ ...f, acoes: n }))
                }}
                className="rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <input
                type="date" value={a.dataLimite}
                onChange={e => {
                  const n = [...form.acoes]; n[i] = { ...n[i], dataLimite: e.target.value }
                  setForm(f => ({ ...f, acoes: n }))
                }}
                className="rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              {form.acoes.length > 1 && (
                <button
                  onClick={() => setForm(f => ({ ...f, acoes: f.acoes.filter((_, j) => j !== i) }))}
                  className="rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={() => setForm(f => ({ ...f, acoes: [...f.acoes, { ...EMPTY_STEP }] }))}
          className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add step
        </button>
      </div>

      <div className="flex gap-2 border-t border-border/40 pt-2">
        <button
          onClick={save} disabled={saving || !form.titulo.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {existing ? "Update plan" : "Save plan"}
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

// ── Action Plans section ──────────────────────────────────────────────────────

export function ActionPlansSection({
  telaId, userId, canWrite,
}: {
  telaId: string; userId: string; canWrite: boolean
}) {
  const { data: rawList, isLoading } = usePlanos(telaId, userId)
  const list: PlanoDeAcao[] = rawList ?? []
  const deleteM = useDeletePlano()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [modal, setModal]       = useState<PlanoDeAcao | null | "new">(null)

  const active = list.filter(p => !p.deletado)

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  )

  return (
    <>
      <div className="space-y-3">
        {active.map((p: PlanoDeAcao) => {
          const isExpanded = expanded === p.id
          const acoes      = p.acoes ?? []
          const done       = acoes.filter(a => a.status === "done").length
          const total      = acoes.length
          return (
            <div key={p.id} className="rounded-lg border border-border/60 bg-muted/20">
              <div
                className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
                onClick={() => setExpanded(isExpanded ? null : p.id)}
              >
                {isExpanded
                  ? <ChevronDown  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                }
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.titulo}</p>
                  {(p.dataInicio || p.dataFim) && (
                    <p className="text-[10px] text-muted-foreground">
                      {fmtDate(p.dataInicio)} → {fmtDate(p.dataFim)}
                    </p>
                  )}
                </div>
                {total > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{done}/{total} done</span>
                )}
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setModal(p)}
                      className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => deleteM.mutate(p.id)}
                      className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="divide-y divide-border/40 border-t border-border/40">
                  {p.descricao && (
                    <p className="px-4 py-2.5 text-xs text-muted-foreground">{p.descricao}</p>
                  )}
                  {(p.acoes ?? []).map((a: Acao) => {
                    const sc = STATUS_CONFIG[a.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
                    return (
                      <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                        <sc.icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${sc.color}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{a.titulo}</p>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {a.responsavel && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Users className="h-2.5 w-2.5" />{a.responsavel}
                              </span>
                            )}
                            {a.dataLimite && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <CalendarDays className="h-2.5 w-2.5" />{fmtDate(a.dataLimite)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {(p.acoes ?? []).length === 0 && (
                    <p className="px-4 py-2.5 text-xs italic text-muted-foreground/50">No steps added yet.</p>
                  )}
                  <div className="space-y-0.5 px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground/40">
                      Created by <span className="font-medium">{p.criadoPorNome || "—"}</span>
                      {" · "}{fmtDate(p.criadoEm)}
                    </p>
                    {p.editadoPorNome && p.editadoPorNome !== p.criadoPorNome && (
                      <p className="text-[10px] text-muted-foreground/40">
                        Edited by <span className="font-medium">{p.editadoPorNome}</span>
                        {" · "}{fmtDate(p.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {active.length === 0 && (
          <p className="text-xs italic text-muted-foreground/50">No action plans yet.</p>
        )}

        {canWrite && (
          <button
            onClick={() => setModal("new")}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add action plan
          </button>
        )}
      </div>

      <Dialog open={!!modal} onOpenChange={o => { if (!o) setModal(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {modal === "new" || !modal ? "New Action Plan" : "Edit Action Plan"}
            </DialogTitle>
          </DialogHeader>
          {modal && (
            <PlanoEditForm
              telaId={telaId} userId={userId}
              existing={modal === "new" ? null : modal}
              onDone={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
