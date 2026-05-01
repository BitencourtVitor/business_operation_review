'use client'

import { useState, useEffect } from "react"
import {
  ChevronDown, ChevronRight, Plus, Save, X,
  TrendingUp, TrendingDown, Loader2, Pencil, History,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
import {
  useDestaques, useCreateDestaque, useUpdateDestaque,
} from "@/hooks/use-insights"
import type { Destaque } from "@/services/insights.service"
import { MONTHS, fmtDate } from "./lib"

// ── Read-only bullet row ──────────────────────────────────────────────────────

export function BulletItem({ value }: { value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <div className="mt-[13px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
      <p className="min-w-0 flex-1 break-words py-1.5 text-sm text-foreground">{value}</p>
    </div>
  )
}

// ── Highlight Edit Form ───────────────────────────────────────────────────────

export function HighlightEditForm({
  telaId, mes, ano, userId, existing, onDone,
}: {
  telaId: string; mes: number; ano: number; userId: string
  existing: Destaque | undefined
  onDone: () => void
}) {
  const createM = useCreateDestaque()
  const updateM = useUpdateDestaque()

  const [positivos,  setPositivos]  = useState<string[]>([])
  const [negativos,  setNegativos]  = useState<string[]>([])
  const [editingPos, setEditingPos] = useState<number | null>(null)
  const [editingNeg, setEditingNeg] = useState<number | null>(null)
  const [dirty,      setDirty]      = useState(false)

  useEffect(() => {
    setPositivos((existing?.positivos ?? []).map(i => i.texto))
    setNegativos((existing?.negativos ?? []).map(i => i.texto))
    setDirty(false)
    setEditingPos(null)
    setEditingNeg(null)
  }, [existing])

  function save() {
    const payload = {
      usuarioId: userId, telaId, mes, ano,
      positivos: positivos.filter(Boolean).map(t => ({ texto: t })),
      negativos: negativos.filter(Boolean).map(t => ({ texto: t })),
    }
    if (existing) {
      updateM.mutate({ id: existing.id, data: payload }, { onSuccess: onDone })
    } else {
      createM.mutate(payload, { onSuccess: onDone })
    }
  }

  const saving = createM.isPending || updateM.isPending

  function addPositivo() {
    const idx = positivos.length
    setPositivos(p => [...p, ""])
    setEditingPos(idx)
    setEditingNeg(null)
    setDirty(true)
  }

  function addNegativo() {
    const idx = negativos.length
    setNegativos(p => [...p, ""])
    setEditingNeg(idx)
    setEditingPos(null)
    setDirty(true)
  }

  function ItemCol({
    items, setItems, editingIdx, setEditingIdx, clearOther, label, icon: Icon, iconCls, onAdd,
  }: {
    items: string[]
    setItems: React.Dispatch<React.SetStateAction<string[]>>
    editingIdx: number | null
    setEditingIdx: (n: number | null) => void
    clearOther: () => void
    label: string
    icon: React.ElementType
    iconCls: string
    onAdd: () => void
    placeholder?: string
  }) {
    return (
      <div className="min-w-0 space-y-1.5">
        <div className="mb-2 flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${iconCls}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>

        {items.map((t, i) => (
          <div key={i} className="group flex min-w-0 items-start gap-1">
            {editingIdx === i ? (
              <>
                <textarea
                  value={t}
                  rows={1}
                  onChange={e => {
                    const n = [...items]; n[i] = e.target.value
                    setItems(n); setDirty(true)
                  }}
                  onBlur={() => setEditingIdx(null)}
                  className="min-w-0 flex-1 resize-none rounded border border-border bg-muted/30 px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = "auto"
                    el.style.height = `${el.scrollHeight}px`
                  }}
                />
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setItems(p => p.filter((_, j) => j !== i))
                    setEditingIdx(null)
                    setDirty(true)
                  }}
                  className="mt-1 shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <>
                <div className="mt-[13px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <p className="min-w-0 flex-1 break-words py-1.5 text-sm text-foreground">
                  {t || <span className="italic text-muted-foreground/40">Empty</span>}
                </p>
                <button
                  onClick={() => { setEditingIdx(i); clearOther() }}
                  className="mt-1.5 shrink-0 rounded p-0.5 text-transparent transition-colors group-hover:text-muted-foreground/50 hover:!text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-xs italic text-muted-foreground/40">None recorded.</p>
        )}

        <button
          onClick={onAdd}
          className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-h-[52vh] grid-cols-2 gap-6 overflow-y-auto pr-1">
        <ItemCol
          items={positivos} setItems={setPositivos}
          editingIdx={editingPos} setEditingIdx={setEditingPos}
          clearOther={() => setEditingNeg(null)}
          label="Positives" placeholder="Add a positive…"
          icon={TrendingUp} iconCls="text-primary"
          onAdd={addPositivo}
        />
        <ItemCol
          items={negativos} setItems={setNegativos}
          editingIdx={editingNeg} setEditingIdx={setEditingNeg}
          clearOther={() => setEditingPos(null)}
          label="Negatives" placeholder="Add a negative…"
          icon={TrendingDown} iconCls="text-red-500 dark:text-red-400"
          onAdd={addNegativo}
        />
      </div>

      <div className="flex gap-2 border-t border-border/40 pt-3">
        <button
          onClick={save} disabled={saving || !dirty}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save highlights
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

// ── Highlights section ────────────────────────────────────────────────────────

export function HighlightsSection({
  telaId, mes, ano, userId, canWrite,
}: {
  telaId: string; mes: number; ano: number; userId: string; canWrite: boolean
}) {
  const { data: rawAll, isLoading } = useDestaques(telaId, undefined, undefined, userId)
  const all: Destaque[] = rawAll ?? []

  const currentKey = `${ano}-${mes}`
  const [expandedKey,  setExpandedKey]  = useState<string>(currentKey)
  const [modalPeriod,  setModalPeriod]  = useState<{ mes: number; ano: number; record: Destaque | undefined } | null>(null)
  const [showHistory,  setShowHistory]  = useState(false)

  const periodMap = new Map<string, { key: string; mes: number; ano: number; record: Destaque | undefined }>()
  periodMap.set(currentKey, { key: currentKey, mes, ano, record: undefined })
  for (const d of all) {
    const key = `${d.ano}-${d.mes}`
    periodMap.set(key, { key, mes: d.mes, ano: d.ano, record: d })
  }
  const periods = [...periodMap.values()].sort((a, b) => {
    if (a.key === currentKey) return -1
    if (b.key === currentKey) return 1
    return b.ano - a.ano || b.mes - a.mes
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  )

  return (
    <>
      <div className="divide-y divide-border/40">
        {periods.map(({ key, mes: pMes, ano: pAno, record }) => {
          const isOpen    = expandedKey === key
          const isCurrent = key === currentKey
          const total     = ((record?.positivos ?? []).length) + ((record?.negativos ?? []).length)
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
                    onClick={() => setModalPeriod({ mes: pMes, ano: pAno, record })}
                    className="rounded p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {total > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{total}</span>
                )}
              </div>

              {isOpen && (
                <div className="space-y-3 pb-3">
                  {(record?.positivos ?? []).length > 0 && (
                    <div>
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-primary" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Positives</span>
                      </div>
                      {(record?.positivos ?? []).map(i => <BulletItem key={i.id} value={i.texto} />)}
                    </div>
                  )}
                  {(record?.negativos ?? []).length > 0 && (
                    <div>
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <TrendingDown className="h-3 w-3 text-red-500 dark:text-red-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Negatives</span>
                      </div>
                      {(record?.negativos ?? []).map(i => <BulletItem key={i.id} value={i.texto} />)}
                    </div>
                  )}
                  {total === 0 && (
                    <p className="text-xs italic text-muted-foreground/50">No highlights recorded.</p>
                  )}
                  {record && (
                    <div className="space-y-0.5 pt-1">
                      <p className="text-[10px] text-muted-foreground/40">
                        Created by <span className="font-medium">{record.criadoPorNome || "—"}</span>
                        {" · "}{fmtDate(record.criadoEm)}
                      </p>
                      {record.editadoPorNome && record.editadoPorNome !== record.criadoPorNome && (
                        <p className="text-[10px] text-muted-foreground/40">
                          Edited by <span className="font-medium">{record.editadoPorNome}</span>
                          {" · "}{fmtDate(record.updatedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Dialog
        open={!!modalPeriod}
        onOpenChange={o => { if (!o) { setModalPeriod(null); setShowHistory(false) } }}
      >
        <DialogContent className="sm:max-w-xl">
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle>
              Highlights — {modalPeriod ? `${MONTHS[modalPeriod.mes - 1]} ${modalPeriod.ano}` : ""}
            </DialogTitle>
            {modalPeriod?.record && (
              <button
                onClick={() => setShowHistory(s => !s)}
                title="View history"
                className={`ml-auto rounded p-1 transition-colors ${
                  showHistory
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground/50 hover:text-foreground"
                }`}
              >
                <History className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {showHistory && modalPeriod?.record && (
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Audit log</p>
              <p className="text-muted-foreground">
                Created by{" "}
                <span className="font-medium text-foreground">{modalPeriod.record.criadoPorNome || "—"}</span>
                {" · "}{fmtDate(modalPeriod.record.criadoEm)}
              </p>
              {modalPeriod.record.editadoPorNome && modalPeriod.record.editadoPorNome !== modalPeriod.record.criadoPorNome && (
                <p className="mt-0.5 text-muted-foreground">
                  Last edited by{" "}
                  <span className="font-medium text-foreground">{modalPeriod.record.editadoPorNome}</span>
                  {" · "}{fmtDate(modalPeriod.record.updatedAt)}
                </p>
              )}
            </div>
          )}

          {modalPeriod && (
            <HighlightEditForm
              telaId={telaId} mes={modalPeriod.mes} ano={modalPeriod.ano}
              userId={userId} existing={modalPeriod.record}
              onDone={() => { setModalPeriod(null); setShowHistory(false) }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
