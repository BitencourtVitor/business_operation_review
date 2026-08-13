"use client"

import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import {
  AlertCircle, CalendarIcon, CalendarX, Check, ChevronDown, Clock, Eye, FileText, History,
  Loader2, Mail, Plus, Search, Send, ShieldAlert, Users, X,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useUsers } from "@/hooks/use-settings"
import {
  useEmailTriggers, useEmailTriggerHistory, useUpdateEmailTrigger, usePreviewEmailTrigger,
  useSendEmailTriggerTest,
} from "@/hooks/use-email-triggers"
import type { EmailTrigger, TriggerParamDef } from "@/services/email-triggers.service"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  /** Restricts the modal to one module's triggers, so a page can open its own
   *  e-mail settings without exposing the whole registry. */
  module?: string
}

type Draft = {
  enabled: boolean
  runHour: number | null
  values: Record<string, unknown>
  to: string[]
  cc: string[]
}

function draftOf(trigger: EmailTrigger): Draft {
  return {
    enabled: trigger.enabled,
    runHour: trigger.run_hour_local,
    values: { ...trigger.values },
    to: [...trigger.to_user_ids],
    cc: [...trigger.cc_user_ids],
  }
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** 0–23 is what the backend stores; nobody reads a schedule that way. */
function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM"
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:00 ${period}`
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string" && value.trim()) return [value]
  return []
}

/** Maps the system a trigger belongs to onto its mark: the Fieldwire logo for
 *  Fieldwire, a glyph for the rest. Unknown names fall back to the envelope. */
function TriggerIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon === "fieldwire") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/images/icon_fieldwire.png" alt="" className={cn("object-contain", className)} />
    )
  }
  const Glyph = icon === "sub_docs" ? FileText
    : icon === "sub_docs_alert" ? ShieldAlert
    : icon === "absence" ? CalendarX
    : Mail
  return <Glyph className={className} />
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

function Block({ title, icon, children }: {
  title?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/30">
      {title && (
        <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  )
}

/** Collapsed it states how much it holds; the contents only load on expand. */
function CollapsibleBlock({ title, icon, summary, open, onToggle, children }: {
  title: string
  icon?: React.ReactNode
  summary: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        {icon}
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="text-xs text-muted-foreground">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border/40 p-3">{children}</div>}
    </div>
  )
}

/** Add-picker: lists only what is not selected yet, with a search box, because
 *  some of these lists (documents, users) are long. */
function AddPicker({ label, options, onAdd }: {
  label: string
  options: { value: string; label: string; hint?: string }[]
  onAdd: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState("")

  const filtered = options.filter(option =>
    `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
  )

  if (options.length === 0) return null

  return (
    <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setTerm("") }}>
      <PopoverTrigger className="flex items-center gap-1 rounded-md border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
        <Plus className="h-3 w-3" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border/40 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">Nothing found.</p>
          ) : (
            filtered.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => { onAdd(option.value); setTerm("") }}
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
              >
                <span className="truncate text-xs">{option.label}</span>
                {option.hint && (
                  <span className="truncate text-[10px] text-muted-foreground">{option.hint}</span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A selected value: visible because it is in play, removable in one click. */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary">
      {label}
      <button type="button" onClick={onRemove} className="opacity-60 transition-opacity hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function EmailTriggersModal({ open, onClose, module: moduleFilter }: Props) {
  const { data: allTriggers, isLoading } = useEmailTriggers(open)
  const triggers = useMemo(
    () => moduleFilter ? (allTriggers ?? []).filter(t => t.module === moduleFilter) : allTriggers,
    [allTriggers, moduleFilter],
  )
  const { data: users } = useUsers()
  const update = useUpdateEmailTrigger()
  const preview = usePreviewEmailTrigger()
  const sendTest = useSendEmailTriggerTest()

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showRecipients, setShowRecipients] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [previewBody, setPreviewBody] = useState<{ subject: string; html: string } | null>(null)
  const [testedTo, setTestedTo] = useState<string | null>(null)

  const selected = useMemo(
    () => triggers?.find(t => t.key === selectedKey) ?? null,
    [triggers, selectedKey],
  )
  const { data: history, isLoading: historyLoading } = useEmailTriggerHistory(
    showHistory ? selectedKey : null,
  )

  useEffect(() => {
    if (!open) {
      setSelectedKey(null)
      setDraft(null)
      return
    }
    if (!selectedKey && triggers?.length) setSelectedKey(triggers[0].key)
  }, [open, triggers, selectedKey])

  useEffect(() => {
    if (selected) {
      setDraft(draftOf(selected))
      setError(null)
      setSaved(false)
      setShowRecipients(false)
      setShowHistory(false)
      setPreviewBody(null)
      setTestedTo(null)
    }
  }, [selected])

  async function runTest() {
    const payload = body()
    if (!selected || !payload) return
    setError(null)
    setTestedTo(null)
    try {
      const result = await sendTest.mutateAsync({ key: selected.key, body: payload })
      setTestedTo(result.delivered_to)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the test")
    }
  }

  const dirty = useMemo(() => {
    if (!selected || !draft) return false
    return JSON.stringify(draft) !== JSON.stringify(draftOf(selected))
  }, [selected, draft])

  function patch(next: Partial<Draft>) {
    setDraft(current => (current ? { ...current, ...next } : current))
    setSaved(false)
  }

  function setValue(key: string, value: unknown) {
    if (!draft) return
    patch({ values: { ...draft.values, [key]: value } })
  }

  function body() {
    if (!selected || !draft) return null
    return {
      enabled: draft.enabled,
      run_hour_local: selected.schedulable ? draft.runHour : null,
      values: draft.values,
      to_user_ids: draft.to,
      cc_user_ids: draft.cc,
    }
  }

  async function save() {
    const payload = body()
    if (!selected || !payload) return
    setError(null)
    try {
      await update.mutateAsync({ key: selected.key, body: payload })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this trigger")
    }
  }

  async function runPreview() {
    const payload = body()
    if (!selected || !payload) return
    setError(null)
    try {
      const rendered = await preview.mutateAsync({ key: selected.key, body: payload })
      setPreviewBody({ subject: rendered.subject, html: rendered.html })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render the preview")
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTrigger[]>()
    for (const trigger of triggers ?? []) {
      map.set(trigger.module, [...(map.get(trigger.module) ?? []), trigger])
    }
    return [...map.entries()]
  }, [triggers])

  const timingParams = selected?.params.filter(p => p.group === "timing") ?? []
  const otherParams = selected?.params.filter(p => p.group !== "timing") ?? []

  const userById = useMemo(
    () => new Map((users ?? []).map(user => [user.id, user])),
    [users],
  )

  function renderField(param: TriggerParamDef, width: string) {
    if (!draft) return null
    const value = draft.values[param.key]

    if (param.type === "select") {
      return (
        <Select value={value === undefined ? "" : String(value)} onValueChange={next => setValue(param.key, next)}>
          <SelectTrigger className={width}>
            <SelectValue>
              {param.options?.find(option => option.value === String(value))?.label ?? (
                <span className="text-muted-foreground">Select</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {param.options?.map(option => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    if (param.type === "date") {
      return (
        <Popover>
          <PopoverTrigger className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/60",
            width,
          )}>
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {value ? String(value) : <span className="text-muted-foreground">Select a date</span>}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value ? parseISO(String(value)) : undefined}
              onSelect={date => date && setValue(param.key, format(date, "yyyy-MM-dd"))}
            />
          </PopoverContent>
        </Popover>
      )
    }
    return (
      <Input
        className={width}
        type={param.type === "int" ? "number" : "text"}
        min={param.min}
        max={param.max}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={event =>
          setValue(param.key, param.type === "int" ? Number(event.target.value) : event.target.value)
        }
      />
    )
  }

  /** Schedule fields sit on one wrapping row: read together they form a single
   *  sentence ("2 months before the start date, at 08:00"). */
  function timingWidth(param: TriggerParamDef) {
    if (param.type === "int") return "w-24"
    if (param.type === "date") return "w-40"
    return param.key === "offset_unit" ? "w-28" : "w-40"
  }

  const recipientCount = (draft?.to.length ?? 0) + (draft?.cc.length ?? 0)

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            {moduleFilter ? `${moduleFilter} — Email Triggers` : "Email Triggers"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {moduleFilter
              ? "The automatic e-mails this screen sends. Subject and body are built from live data and stay in code."
              : "Every automatic e-mail the system sends. Subject and body are built from live data and stay in code."}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (triggers?.length ?? 0) === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-sm font-medium">No triggers available</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              The trigger registry could not be loaded. Check that the API is reachable and that the
              email trigger migration has been applied.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* A single trigger needs no picker: the modal is already on it. */}
            {(triggers?.length ?? 0) > 1 && (
            <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/20 p-2">
              {grouped.map(([module, items]) => (
                <div key={module} className="mb-2">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {module}
                  </p>
                  {items.map(trigger => (
                    <button
                      key={trigger.key}
                      type="button"
                      onClick={() => setSelectedKey(trigger.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        trigger.key === selectedKey ? "bg-primary/10 text-primary" : "hover:bg-muted/70",
                      )}
                    >
                      <TriggerIcon icon={trigger.icon} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{trigger.label}</span>
                      <span
                        title={trigger.enabled ? "Enabled" : "Disabled"}
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          trigger.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                    </button>
                  ))}
                </div>
              ))}
            </aside>
            )}

            {selected && draft && (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                  <div>
                    <p className="text-sm font-medium">{selected.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selected.description}</p>
                  </div>

                  <Block>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">Enabled</p>
                        <p className="text-xs text-muted-foreground">
                          Turned off, nothing is sent and no delivery is recorded.
                        </p>
                      </div>
                      <Switch checked={draft.enabled} onCheckedChange={value => patch({ enabled: value })} />
                    </div>
                  </Block>

                  <Block title="When it fires" icon={<Clock className="h-3.5 w-3.5" />}>
                    <div className="flex flex-col gap-3">
                      <p className="text-[11px] text-muted-foreground">{selected.when}</p>
                      <div className="flex flex-wrap items-start gap-3">
                        {timingParams.map(param => (
                          <div key={param.key} className="flex flex-col gap-1.5">
                            <Label className="text-xs">{param.label}</Label>
                            {renderField(param, timingWidth(param))}
                          </div>
                        ))}
                        {selected.schedulable && (
                          <div className="flex flex-col gap-1.5">
                            {/* The zone belongs to the label: it qualifies the
                                hour, it is not a note about the field. */}
                            <Label className="text-xs">
                              Run hour
                              <span className="font-normal text-muted-foreground">Hopedale time</span>
                            </Label>
                            <Select
                              value={draft.runHour === null ? "" : String(draft.runHour)}
                              onValueChange={value => patch({ runHour: Number(value) })}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue>
                                  {draft.runHour === null
                                    ? <span className="text-muted-foreground">Select</span>
                                    : formatHour(draft.runHour)}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {HOURS.map(hour => (
                                  <SelectItem key={hour} value={String(hour)}>
                                    {formatHour(hour)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      {timingParams.some(param => param.help) && (
                        <div className="flex flex-col gap-0.5">
                          {timingParams.filter(param => param.help).map(param => (
                            <p key={param.key} className="text-[11px] text-muted-foreground">
                              <span className="font-medium">{param.label}:</span> {param.help}
                            </p>
                          ))}
                        </div>
                      )}
                      {!selected.schedulable && (
                        <p className="text-xs text-muted-foreground">
                          No schedule of its own — it runs right after the job that feeds it.
                        </p>
                      )}
                    </div>
                  </Block>

                  {otherParams.length > 0 && (
                    <Block title="Parameters">
                      <div className="flex flex-col gap-4">
                        {otherParams.map(param => {
                          if (param.type !== "multiselect") {
                            return (
                              <div key={param.key} className="flex flex-col gap-1.5">
                                <Label className="text-xs">{param.label}</Label>
                                {renderField(param, "w-56")}
                                {param.help && (
                                  <p className="max-w-md text-[11px] text-muted-foreground">{param.help}</p>
                                )}
                              </div>
                            )
                          }
                          const chosen = asList(draft.values[param.key])
                          const available = (param.options ?? []).filter(o => !chosen.includes(o.value))
                          // The stored value is not always readable — an employee
                          // is keyed by company and name, so show the option's
                          // label and fall back to the value only if it is gone.
                          const labelFor = (value: string) =>
                            param.options?.find(option => option.value === value)?.label ?? value
                          return (
                            <div key={param.key} className="flex flex-col gap-1.5">
                              <Label className="text-xs">{param.label}</Label>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {chosen.map(item => (
                                  <Chip
                                    key={item}
                                    label={labelFor(item)}
                                    onRemove={() => setValue(param.key, chosen.filter(v => v !== item))}
                                  />
                                ))}
                                {chosen.length === 0 && (
                                  <span className="text-[11px] text-muted-foreground">None selected.</span>
                                )}
                                <AddPicker
                                  label="Add"
                                  options={available}
                                  onAdd={item => setValue(param.key, [...chosen, item])}
                                />
                              </div>
                              {param.help && (
                                <p className="max-w-md text-[11px] text-muted-foreground">{param.help}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </Block>
                  )}

                  <CollapsibleBlock
                    title="Recipients"
                    icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
                    summary={recipientCount === 1 ? "1 person" : `${recipientCount} people`}
                    open={showRecipients}
                    onToggle={() => setShowRecipients(value => !value)}
                  >
                    <div className="flex flex-col gap-2">
                      {recipientCount === 0 && (
                        <p className="text-[11px] text-muted-foreground">Nobody added yet.</p>
                      )}
                      {(["to", "cc"] as const).map(kind =>
                        draft[kind].map(userID => {
                          const user = userById.get(userID)
                          return (
                            <div
                              key={`${kind}-${userID}`}
                              className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{user?.name ?? userID}</p>
                                <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
                              </div>
                              <div className="flex overflow-hidden rounded-md border border-border/40">
                                {(["to", "cc"] as const).map(target => (
                                  <button
                                    key={target}
                                    type="button"
                                    onClick={() => patch({
                                      to: target === "to"
                                        ? [...draft.to.filter(id => id !== userID), userID]
                                        : draft.to.filter(id => id !== userID),
                                      cc: target === "cc"
                                        ? [...draft.cc.filter(id => id !== userID), userID]
                                        : draft.cc.filter(id => id !== userID),
                                    })}
                                    className={cn(
                                      "px-2 py-0.5 text-[10px] uppercase transition-colors",
                                      kind === target
                                        ? "bg-primary/15 text-primary"
                                        : "text-muted-foreground hover:bg-muted/60",
                                    )}
                                  >
                                    {target}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => patch({
                                  to: draft.to.filter(id => id !== userID),
                                  cc: draft.cc.filter(id => id !== userID),
                                })}
                                className="text-muted-foreground/60 transition-colors hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        }),
                      )}
                      <AddPicker
                        label="Add recipient"
                        options={(users ?? [])
                          .filter(user => !draft.to.includes(user.id) && !draft.cc.includes(user.id))
                          .map(user => ({ value: user.id, label: user.name, hint: user.email }))}
                        onAdd={userID => patch({ to: [...draft.to, userID] })}
                      />
                      {draft.enabled && draft.to.length === 0 && (
                        <p className="flex items-center gap-1.5 text-[11px] text-amber-500">
                          <AlertCircle className="h-3.5 w-3.5" />
                          An enabled trigger needs at least one primary recipient.
                        </p>
                      )}
                    </div>
                  </CollapsibleBlock>

                  <CollapsibleBlock
                    title="Delivery history"
                    icon={<History className="h-3.5 w-3.5 text-muted-foreground" />}
                    summary={selected.delivery_count === 1 ? "1 e-mail sent" : `${selected.delivery_count} e-mails sent`}
                    open={showHistory}
                    onToggle={() => setShowHistory(value => !value)}
                  >
                    {historyLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (history?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {history?.map((entry, index) => (
                          <div
                            key={`${entry.sent_at}-${index}`}
                            className="flex items-center gap-2 border-b border-border/20 py-1.5 text-xs last:border-b-0"
                          >
                            <span
                              title={entry.status}
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                entry.status === "sent" ? "bg-emerald-500"
                                  : entry.status === "test" ? "bg-sky-500"
                                  : "bg-destructive",
                              )}
                            />
                            <span className="w-32 shrink-0 text-muted-foreground">
                              {format(parseISO(entry.sent_at), "MMM dd, HH:mm")}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{entry.subject}</span>
                            <span className="w-28 shrink-0 truncate text-right text-muted-foreground">
                              {entry.context}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleBlock>

                  {previewBody && (
                    <Block title="Preview — sample data" icon={<Eye className="h-3.5 w-3.5" />}>
                      <div className="overflow-hidden rounded-md border border-border/40">
                        <div className="border-b border-border/40 bg-muted/40 px-3 py-2">
                          <p className="text-[11px] text-muted-foreground">Subject</p>
                          <p className="text-xs font-medium">{previewBody.subject}</p>
                        </div>
                        {/* Rendered on white: e-mail clients have no dark mode and
                            the body is composed by our own builder. */}
                        <div
                          className="overflow-x-auto bg-white p-4 text-black [&_a]:text-blue-700"
                          dangerouslySetInnerHTML={{ __html: previewBody.html }}
                        />
                      </div>
                    </Block>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    {error ? (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {error}
                      </span>
                    ) : testedTo ? (
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <Check className="h-3.5 w-3.5" />
                        Test sent to {testedTo}
                      </span>
                    ) : saved ? (
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <Check className="h-3.5 w-3.5" />
                        Saved
                      </span>
                    ) : (
                      `Last change ${format(parseISO(selected.updated_at), "MMM dd, yyyy HH:mm")}`
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={runPreview} disabled={preview.isPending}>
                      {preview.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Eye className="h-3.5 w-3.5" />}
                      Preview
                    </Button>
                    {/* Goes only to the signed-in user, never to the configured
                        recipients — testing must not notify anyone. */}
                    <Button size="sm" variant="outline" onClick={runTest} disabled={sendTest.isPending}>
                      {sendTest.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Send className="h-3.5 w-3.5" />}
                      Send a test to me
                    </Button>
                    <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
                      {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
