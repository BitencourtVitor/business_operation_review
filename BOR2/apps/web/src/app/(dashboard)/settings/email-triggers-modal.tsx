"use client"

import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import {
  AlertCircle, CalendarIcon, CalendarX, Check, Clock, Eye, FileText, History, Loader2, Mail,
  ShieldAlert, Users,
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
} from "@/hooks/use-email-triggers"
import type { EmailTrigger, TriggerParamDef } from "@/services/email-triggers.service"
import { cn } from "@/lib/utils"

type Props = { open: boolean; onClose: () => void }

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
    runHour: trigger.run_hour_utc,
    values: { ...trigger.values },
    to: [...trigger.to_user_ids],
    cc: [...trigger.cc_user_ids],
  }
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

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

/** Groups parameters into rows: an inline param shares the previous one's row. */
function paramRows(params: TriggerParamDef[]): TriggerParamDef[][] {
  const rows: TriggerParamDef[][] = []
  for (const param of params) {
    if (param.inline && rows.length > 0) {
      rows[rows.length - 1].push(param)
    } else {
      rows.push([param])
    }
  }
  return rows
}

/** Chips that toggle: the option lists are short and fully visible at a glance. */
function MultiSelect({
  param, selected, onToggle,
}: {
  param: TriggerParamDef
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (!param.options?.length) {
    return <p className="text-[11px] text-muted-foreground">No options available.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {param.options.map(option => {
        const active = selected.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            {active && <Check className="h-3 w-3" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function EmailTriggersModal({ open, onClose }: Props) {
  const { data: triggers, isLoading } = useEmailTriggers(open)
  const { data: users } = useUsers()
  const update = useUpdateEmailTrigger()

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const preview = usePreviewEmailTrigger()
  const [previewBody, setPreviewBody] = useState<{ subject: string; html: string } | null>(null)

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
      setShowHistory(false)
      setPreviewBody(null)
    }
  }, [selected])

  async function runPreview() {
    if (!selected || !draft) return
    setError(null)
    try {
      const body = await preview.mutateAsync({
        key: selected.key,
        body: {
          enabled: draft.enabled,
          run_hour_utc: selected.schedulable ? draft.runHour : null,
          values: draft.values,
          to_user_ids: draft.to,
          cc_user_ids: draft.cc,
        },
      })
      setPreviewBody({ subject: body.subject, html: body.html })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render the preview")
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

  function toggleRecipient(kind: "to" | "cc", userID: string) {
    if (!draft) return
    const current = draft[kind]
    const other = kind === "to" ? "cc" : "to"
    if (current.includes(userID)) {
      patch({ [kind]: current.filter(id => id !== userID) } as Partial<Draft>)
      return
    }
    // A user is either To or CC, never both — the sender would duplicate them.
    patch({
      [kind]: [...current, userID],
      [other]: draft[other].filter(id => id !== userID),
    } as Partial<Draft>)
  }

  async function save() {
    if (!selected || !draft) return
    setError(null)
    try {
      await update.mutateAsync({
        key: selected.key,
        body: {
          enabled: draft.enabled,
          run_hour_utc: selected.schedulable ? draft.runHour : null,
          values: draft.values,
          to_user_ids: draft.to,
          cc_user_ids: draft.cc,
        },
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this trigger")
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTrigger[]>()
    for (const trigger of triggers ?? []) {
      map.set(trigger.module, [...(map.get(trigger.module) ?? []), trigger])
    }
    return [...map.entries()]
  }, [triggers])

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email Triggers
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Every automatic e-mail the system sends. Subject and body are built from live data and stay in code.
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

            {selected && draft && (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                  <div>
                    <p className="text-sm font-medium">{selected.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selected.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">{selected.when}</p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">Enabled</p>
                      <p className="text-xs text-muted-foreground">
                        Turned off, nothing is sent and no delivery is recorded.
                      </p>
                    </div>
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={value => patch({ enabled: value })}
                    />
                  </div>

                  {selected.schedulable ? (
                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5 text-xs">
                        <Clock className="h-3.5 w-3.5" />
                        Run hour (UTC)
                      </Label>
                      <Select
                        value={draft.runHour === null ? "" : String(draft.runHour)}
                        onValueChange={value => patch({ runHour: Number(value) })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue>
                            {draft.runHour === null ? (
                              <span className="text-muted-foreground">Select an hour</span>
                            ) : (
                              `${String(draft.runHour).padStart(2, "0")}:00 UTC`
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {HOURS.map(hour => (
                            <SelectItem key={hour} value={String(hour)}>
                              {String(hour).padStart(2, "0")}:00 UTC
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      This trigger has no schedule of its own — it runs right after the job that feeds it.
                    </p>
                  )}

                  {selected.params.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Parameters
                      </p>
                      {paramRows(selected.params).map((row, rowIndex) => (
                        <div key={rowIndex} className="flex flex-wrap items-start gap-3">
                          {row.map(param => {
                            const value = draft.values[param.key]
                            const grouped = row.length > 1
                            const controlWidth = grouped ? "w-28" : "w-56"
                            return (
                              <div key={param.key} className="flex flex-col gap-1.5">
                                <Label className="text-xs">{param.label}</Label>

                                {param.type === "multiselect" ? (
                                  <MultiSelect
                                    param={param}
                                    selected={asList(value)}
                                    onToggle={option => {
                                      const current = asList(value)
                                      patch({
                                        values: {
                                          ...draft.values,
                                          [param.key]: current.includes(option)
                                            ? current.filter(item => item !== option)
                                            : [...current, option],
                                        },
                                      })
                                    }}
                                  />
                                ) : param.type === "select" ? (
                                  <Select
                                    value={value === undefined ? "" : String(value)}
                                    onValueChange={next =>
                                      patch({ values: { ...draft.values, [param.key]: next } })
                                    }
                                  >
                                    <SelectTrigger className={controlWidth}>
                                      <SelectValue>
                                        {param.options?.find(option => option.value === String(value))?.label ?? (
                                          <span className="text-muted-foreground">Select</span>
                                        )}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {param.options?.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : param.type === "date" ? (
                                  <Popover>
                                    <PopoverTrigger className={cn(
                                      "flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/60",
                                      controlWidth,
                                    )}>
                                      <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      {value ? String(value) : <span className="text-muted-foreground">Select a date</span>}
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={value ? parseISO(String(value)) : undefined}
                                        onSelect={date =>
                                          date &&
                                          patch({
                                            values: { ...draft.values, [param.key]: format(date, "yyyy-MM-dd") },
                                          })
                                        }
                                      />
                                    </PopoverContent>
                                  </Popover>
                                ) : (
                                  <Input
                                    className={controlWidth}
                                    type={param.type === "int" ? "number" : "text"}
                                    min={param.min}
                                    max={param.max}
                                    value={value === undefined || value === null ? "" : String(value)}
                                    onChange={event =>
                                      patch({
                                        values: {
                                          ...draft.values,
                                          [param.key]:
                                            param.type === "int"
                                              ? Number(event.target.value)
                                              : event.target.value,
                                        },
                                      })
                                    }
                                  />
                                )}

                                {param.help && (
                                  <p className="max-w-md text-[11px] text-muted-foreground">{param.help}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      Recipients
                    </p>
                    <div className="overflow-hidden rounded-lg border border-border/40">
                      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                        <span className="flex-1">User</span>
                        <span className="w-10 text-center">To</span>
                        <span className="w-10 text-center">CC</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {(users ?? []).map(user => (
                          <div
                            key={user.id}
                            className="flex items-center gap-2 border-b border-border/20 px-3 py-1.5 text-sm last:border-b-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{user.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                            </div>
                            {(["to", "cc"] as const).map(kind => (
                              <button
                                key={kind}
                                type="button"
                                onClick={() => toggleRecipient(kind, user.id)}
                                className={cn(
                                  "flex h-5 w-10 items-center justify-center rounded-md border text-[10px] transition-colors",
                                  draft[kind].includes(user.id)
                                    ? "border-primary/40 bg-primary/10 text-primary"
                                    : "border-border/40 text-muted-foreground hover:bg-muted/60",
                                )}
                              >
                                {draft[kind].includes(user.id) ? <Check className="h-3 w-3" /> : "—"}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    {draft.enabled && draft.to.length === 0 && (
                      <p className="flex items-center gap-1.5 text-[11px] text-amber-500">
                        <AlertCircle className="h-3.5 w-3.5" />
                        An enabled trigger needs at least one primary recipient.
                      </p>
                    )}
                  </div>

                  {previewBody && (
                    <div className="flex flex-col gap-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Eye className="h-3.5 w-3.5" />
                        Preview — sample data
                      </p>
                      <div className="overflow-hidden rounded-lg border border-border/40">
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
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setShowHistory(value => !value)}
                      className="flex items-center gap-1.5 self-start text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      <History className="h-3.5 w-3.5" />
                      Delivery history
                    </button>
                    {showHistory && (
                      historyLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (history?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
                          {history?.map((entry, index) => (
                            <div
                              key={`${entry.sent_at}-${index}`}
                              className="flex items-center gap-2 border-b border-border/20 px-3 py-1.5 text-xs last:border-b-0"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  entry.status === "sent" ? "bg-emerald-500" : "bg-destructive",
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
                      )
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    {error ? (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {error}
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
