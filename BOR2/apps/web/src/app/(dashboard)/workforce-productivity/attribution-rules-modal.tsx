'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useWorkforceData,
  useWorkforceRules,
  useCreateWorkforceRule,
  useUpdateWorkforceRule,
  useDeleteWorkforceRule,
} from '@/hooks/use-workforce'
import type { AttributionRule, RuleConditions } from '@/services/workforce.service'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES = ['Framing', 'HVAC', 'PCG']

const CONDITION_LABELS: Record<keyof RuleConditions, string> = {
  company:  'Company',
  client:   'Client',
  jobsite:  'Jobsite',
  worktype: 'Work Type',
}

// ─── FieldSelect — searchable single-select with portal dropdown ───────────────

function FieldSelect({
  value,
  onChange,
  options,
  placeholder = 'Any (skip)',
}: {
  value:       string
  onChange:    (v: string) => void
  options:     string[]
  placeholder?: string
}) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const [rect, setRect]     = useState<DOMRect | null>(null)

  function openDropdown() {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) { setSearch(''); return }
    setTimeout(() => inputRef.current?.focus(), 0)
    function handler(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-field-select-drop]') &&
          e.target !== triggerRef.current) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))

  function select(v: string) { onChange(v); setOpen(false) }

  const dropdown = open && rect && createPortal(
    <div
      data-field-select-drop
      className="overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
      style={{
        position: 'fixed',
        top:   rect.bottom + 4,
        left:  rect.left,
        width: rect.width,
        zIndex: 9999,
      }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      {/* "Any" option */}
      <div className="px-1 pt-1">
        <button
          onClick={() => select('')}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${!value ? 'border-primary bg-primary' : 'border-border'}`}>
            {!value && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </span>
          <span className="italic">{placeholder}</span>
        </button>
      </div>
      <div className="mx-0 my-1 h-px bg-border" />
      {/* Options */}
      <div className="max-h-44 overflow-y-auto px-1 pb-1">
        {filtered.map(opt => (
          <button
            key={opt}
            onClick={() => select(opt)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${value === opt ? 'border-primary bg-primary' : 'border-border'}`}>
              {value === opt && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </span>
            <span className="truncate">{opt}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">No results</p>
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openDropdown}
        type="button"
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
          value
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-input bg-background text-muted-foreground hover:text-foreground'
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {dropdown}
    </>
  )
}

// ─── Rule Form ────────────────────────────────────────────────────────────────

interface FieldOptions {
  clients:   string[]
  jobsites:  string[]
  worktypes: string[]
}

function RuleForm({
  initial,
  fieldOptions,
  onSave,
  onCancel,
  isPending,
}: {
  initial?:      Partial<AttributionRule>
  fieldOptions:  FieldOptions
  onSave:        (data: Omit<AttributionRule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => void
  onCancel:      () => void
  isPending:     boolean
}) {
  const [name,   setName]   = useState(initial?.name ?? '')
  const [target, setTarget] = useState(initial?.targetCompany ?? '')
  const [cond,   setCond]   = useState<RuleConditions>(initial?.conditions ?? {})
  const [error,  setError]  = useState('')

  function setCondField(key: keyof RuleConditions, val: string) {
    setCond(prev =>
      val
        ? { ...prev, [key]: val }
        : (({ [key]: _, ...rest }) => rest)(prev) as RuleConditions
    )
  }

  function submit() {
    setError('')
    if (!name.trim()) return setError('Name is required.')
    if (!target)      return setError('Target company is required.')
    if (!Object.values(cond).some(v => v)) return setError('At least one condition is required.')
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
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Conditions
          <span className="ml-1 font-normal text-muted-foreground/60">— all filled fields must match</span>
        </label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">

          {/* Company */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Company</span>
            <FieldSelect
              value={cond.company ?? ''}
              onChange={v => setCondField('company', v)}
              options={COMPANIES}
              placeholder="Any company"
            />
          </div>

          {/* Client */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Client</span>
            <FieldSelect
              value={cond.client ?? ''}
              onChange={v => setCondField('client', v)}
              options={fieldOptions.clients}
              placeholder="Any client"
            />
          </div>

          {/* Jobsite */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Jobsite</span>
            <FieldSelect
              value={cond.jobsite ?? ''}
              onChange={v => setCondField('jobsite', v)}
              options={fieldOptions.jobsites}
              placeholder="Any jobsite"
            />
          </div>

          {/* Worktype */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Work Type</span>
            <FieldSelect
              value={cond.worktype ?? ''}
              onChange={v => setCondField('worktype', v)}
              options={fieldOptions.worktypes}
              placeholder="Any work type"
            />
          </div>
        </div>
      </div>

      {/* Target company */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Redirect hours to</label>
        <FieldSelect
          value={target}
          onChange={setTarget}
          options={COMPANIES}
          placeholder="Select target company…"
        />
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

// ─── Condition pills ──────────────────────────────────────────────────────────

function ConditionPills({ cond }: { cond: RuleConditions }) {
  return (
    <>
      {(Object.entries(cond) as [keyof RuleConditions, string][])
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <span key={k}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium">
            <span className="text-muted-foreground">{CONDITION_LABELS[k]}:</span> {v}
          </span>
        ))
      }
    </>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function AttributionRulesModal({ onClose }: { onClose: () => void }) {
  const { data: rules = [], isLoading: rulesLoading } = useWorkforceRules()
  const { data: allRows = [], isLoading: dataLoading }  = useWorkforceData({})
  const createRule = useCreateWorkforceRule()
  const updateRule = useUpdateWorkforceRule()
  const deleteRule = useDeleteWorkforceRule()

  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState<AttributionRule | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId,  setConfirmId]  = useState<string | null>(null)

  // Build option lists from live data
  const fieldOptions = useMemo<FieldOptions>(() => ({
    clients:   Array.from(new Set(allRows.map(r => r.client).filter(Boolean))).sort() as string[],
    jobsites:  Array.from(new Set(allRows.map(r => r.jobsite).filter(Boolean))).sort() as string[],
    worktypes: Array.from(new Set(allRows.map(r => r.worktype).filter(Boolean))).sort() as string[],
  }), [allRows])

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

  const isLoading = rulesLoading || dataLoading

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

              {rules.map(rule => (
                <div key={rule.id}>
                  {editing?.id === rule.id ? (
                    <RuleForm
                      initial={rule}
                      fieldOptions={fieldOptions}
                      onSave={handleUpdate}
                      onCancel={() => setEditing(null)}
                      isPending={updateRule.isPending}
                    />
                  ) : (
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold">{rule.name}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => { setEditing(rule); setShowForm(false) }}
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
                        <ConditionPills cond={rule.conditions} />
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

              {rules.length === 0 && !showForm && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No attribution rules yet. Create one below.
                </p>
              )}

              {showForm && (
                <RuleForm
                  fieldOptions={fieldOptions}
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
