'use client'

import { useState } from 'react'
import {
  useWorkforceRules,
  useCreateWorkforceRule,
  useUpdateWorkforceRule,
  useDeleteWorkforceRule,
} from '@/hooks/use-workforce'
import type { AttributionRule, RuleConditions } from '@/services/workforce.service'
import { AlertTriangle, ArrowRight, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES = ['Framing', 'HVAC', 'PCG']

const CONDITION_LABELS: Record<keyof RuleConditions, string> = {
  company:  'Company',
  client:   'Client',
  jobsite:  'Jobsite',
  worktype: 'Worktype',
}

// ─── Rule Form ────────────────────────────────────────────────────────────────

function RuleForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<AttributionRule>
  onSave:   (data: Omit<AttributionRule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name,   setName]   = useState(initial?.name ?? '')
  const [target, setTarget] = useState(initial?.targetCompany ?? '')
  const [cond,   setCond]   = useState<RuleConditions>(initial?.conditions ?? {})
  const [error,  setError]  = useState('')

  function updateCond(key: keyof RuleConditions, val: string) {
    setCond(prev => val ? { ...prev, [key]: val } : Object.fromEntries(
      Object.entries(prev).filter(([k]) => k !== key)
    ) as RuleConditions)
  }

  function submit() {
    setError('')
    if (!name.trim())   return setError('Name is required.')
    if (!target)        return setError('Target company is required.')
    const hasCond = Object.values(cond).some(v => v)
    if (!hasCond)       return setError('At least one condition is required.')
    onSave({ name: name.trim(), conditions: cond, targetCompany: target })
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Rule Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. PCG Callahan → Framing"
          className="h-8 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* Conditions */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Conditions <span className="text-muted-foreground/60">(all non-empty fields must match)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CONDITION_LABELS) as (keyof RuleConditions)[]).map(key => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{CONDITION_LABELS[key]}</span>
              {key === 'company' ? (
                <select
                  value={cond[key] ?? ''}
                  onChange={e => updateCond(key, e.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">Any</option>
                  {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input
                  value={cond[key] ?? ''}
                  onChange={e => updateCond(key, e.target.value)}
                  placeholder="Any"
                  className="h-8 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Target company */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Redirect hours to</label>
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="">Select company…</option>
          {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
          Cancel
        </button>
        <button onClick={submit} disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Rule
        </button>
      </div>
    </div>
  )
}

// ─── Rule Card ────────────────────────────────────────────────────────────────

function conditionPills(cond: RuleConditions) {
  return (Object.entries(cond) as [keyof RuleConditions, string][])
    .filter(([, v]) => v)
    .map(([k, v]) => (
      <span key={k}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium">
        <span className="text-muted-foreground">{CONDITION_LABELS[k]}:</span> {v}
      </span>
    ))
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function AttributionRulesModal({ onClose }: { onClose: () => void }) {
  const { data: rules = [], isLoading } = useWorkforceRules()
  const createRule  = useCreateWorkforceRule()
  const updateRule  = useUpdateWorkforceRule()
  const deleteRule  = useDeleteWorkforceRule()

  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState<AttributionRule | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId,  setConfirmId]  = useState<string | null>(null)

  async function handleCreate(data: Omit<AttributionRule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
    await createRule.mutateAsync(data)
    setShowForm(false)
  }

  async function handleUpdate(data: Omit<AttributionRule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
    if (!editing) return
    await updateRule.mutateAsync({ id: editing.id, ...data })
    setEditing(null)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await deleteRule.mutateAsync(id)
    setDeletingId(null)
    setConfirmId(null)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-xl"
        style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Attribution Rules</h2>
            <p className="text-xs text-muted-foreground">
              Redirect hours from one company to another based on conditions.
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">

              {/* Existing rules */}
              {rules.map(rule => (
                <div key={rule.id}>
                  {editing?.id === rule.id ? (
                    <RuleForm
                      initial={rule}
                      onSave={handleUpdate}
                      onCancel={() => setEditing(null)}
                      isPending={updateRule.isPending}
                    />
                  ) : (
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold">{rule.name}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => setEditing(rule)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmId(rule.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                            {deletingId === rule.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      </div>

                      {/* Conditions → target */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {conditionPills(rule.conditions)}
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {rule.targetCompany}
                        </span>
                      </div>

                      {/* Confirm delete */}
                      {confirmId === rule.id && (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          <span className="flex-1 text-xs text-destructive">Delete this rule?</span>
                          <button onClick={() => setConfirmId(null)}
                            className="rounded px-2 py-0.5 text-xs transition-colors hover:bg-muted">
                            Cancel
                          </button>
                          <button onClick={() => handleDelete(rule.id)}
                            className="rounded bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90">
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Empty state */}
              {rules.length === 0 && !showForm && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No attribution rules yet. Create one below.
                </p>
              )}

              {/* New rule form */}
              {showForm && (
                <RuleForm
                  onSave={handleCreate}
                  onCancel={() => setShowForm(false)}
                  isPending={createRule.isPending}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && !editing && (
          <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
            <button onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <Plus className="h-3.5 w-3.5" />
              New Rule
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
