"use client"

import { type CSSProperties, useRef, useState } from "react"
import {
  Building2,
  CalendarRange,
  CalendarX,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ClockIcon,
  CloudRain,
  FileText,
  History,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Snowflake,
  Trash2,
  TriangleAlert,
  Upload,
  UsersRound,
  Wind,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarUI } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  useBuildings,
  useCreateBuilding,
  useUpdateBuilding,
  useDeleteBuilding,
  useUpsertSchedule,
  useDeleteSchedule,
  useEventTypes,
  useBuildingEvents,
  useAddBuildingEvent,
  useEditBuildingEvent,
  useDeleteBuildingEvent,
  useScheduleHistory,
} from "@/hooks/use-buildings"
import {
  parseSchedulePDF,
  toDateStr,
  fmtDateFull,
  type ParsedSchedule,
} from "@/lib/pdf-schedule-parser"
import type {
  BuildingListItem,
  ParsedScheduleStored,
  ScheduleHistoryItem,
  ScheduleEvent,
} from "@/services/buildings.service"

// ─── Event icon map ────────────────────────────────────────────────────────────

const EVENT_ICON_MAP: Record<string, LucideIcon> = {
  "cloud-rain":     CloudRain,
  "snowflake":      Snowflake,
  "calendar-x":     CalendarX,
  "wind":           Wind,
  "triangle-alert": TriangleAlert,
  "users-round":    UsersRound,
  "circle-help":    CircleHelp,
}

function EventIcon({
  name, className, style,
}: {
  name: string
  className?: string
  style?: CSSProperties
}) {
  const Icon = EVENT_ICON_MAP[name] ?? CircleHelp
  return <Icon className={className} style={style} />
}

function fmtDateStr(s: string): string {
  if (!s) return ""
  // Works with ISO "2026-04-28T...", PostgreSQL "2026-04-28 23:47:12+00", or plain "2026-04-28"
  const datePart = s.split("T")[0].split(" ")[0]
  const [y, m, d] = datePart.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  onFile, disabled,
}: { onFile: (f: File) => void; disabled?: boolean }) {
  const [drag, setDrag] = useState(false)
  const ref  = useRef<HTMLInputElement>(null)

  const handle = (f: File | undefined) => {
    if (f && f.type === "application/pdf") onFile(f)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false)
        if (!disabled) handle(e.dataTransfer.files[0])
      }}
      onClick={() => !disabled && ref.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        drag
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-muted/20",
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">Drop MS Project PDF here</p>
        <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
      </div>
      <input
        ref={ref} type="file" accept=".pdf,application/pdf" className="hidden"
        onChange={e => handle(e.target.files?.[0])}
      />
    </div>
  )
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({
  building, onClose,
}: {
  building: BuildingListItem
  onClose: () => void
}) {
  const [stage, setStage]       = useState<"drop" | "parsing" | "preview" | "uploading">("drop")
  const [error, setError]       = useState<string | null>(null)
  const [parsed, setParsed]     = useState<ParsedSchedule | null>(null)
  const upsert                  = useUpsertSchedule(building.id)

  async function handleFile(file: File) {
    setStage("parsing")
    setError(null)
    try {
      const result = await parseSchedulePDF(file)
      setParsed(result)
      setStage("preview")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse PDF")
      setStage("drop")
    }
  }

  async function confirm() {
    if (!parsed) return
    setStage("uploading")
    try {
      await upsert.mutateAsync({
        pdfFilename:   parsed.fileName,
        projectStart:  toDateStr(parsed.projectStart),
        projectFinish: toDateStr(parsed.projectFinish),
        scheduleData:  parsed as unknown as ParsedScheduleStored,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
      setStage("preview")
    }
  }

  const stats = parsed ? {
    phases:     parsed.rows.filter(r => r.isPhase).length,
    milestones: parsed.rows.filter(r => r.isMilestone).length,
    tasks:      parsed.rows.filter(r => !r.isPhase && !r.isMilestone).length,
    resources:  parsed.allResources.length,
  } : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">Upload Schedule PDF</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{building.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {(stage === "drop" || stage === "parsing") && (
            <>
              {stage === "parsing" ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing schedule…</p>
                </div>
              ) : (
                <DropZone onFile={handleFile} />
              )}
              {building.has_schedule && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Uploading a new PDF will replace the current schedule.
                </p>
              )}
            </>
          )}

          {stage === "preview" && parsed && stats && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{parsed.fileName}</p>
                  <p className="text-xs text-muted-foreground">{parsed.projectName}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Phases",     value: stats.phases },
                  { label: "Tasks",      value: stats.tasks },
                  { label: "Milestones", value: stats.milestones },
                  { label: "Trades",     value: stats.resources },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-border p-3 text-center">
                    <div className="text-xl font-bold">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              {parsed.projectStart && parsed.projectFinish && (
                <div className="text-xs text-muted-foreground text-center">
                  {fmtDateFull(parsed.projectStart)} → {fmtDateFull(parsed.projectFinish)}
                </div>
              )}

              {parsed.allResources.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parsed.allResources.map(r => (
                    <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {stage === "uploading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving to database…</p>
            </div>
          )}
        </div>

        {stage === "preview" && (
          <div className="flex justify-end gap-2 px-5 pb-5">
            <Button variant="outline" size="sm" onClick={() => setStage("drop")}>
              Back
            </Button>
            <Button size="sm" onClick={confirm}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Save Schedule
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add event modal ───────────────────────────────────────────────────────────

function AddEventModal({
  building, onClose,
}: {
  building: BuildingListItem
  onClose: () => void
}) {
  const { data: eventTypes = [], isLoading: typesLoading } = useEventTypes()
  const addEvent = useAddBuildingEvent(building.id)

  const [typeId,  setTypeId]  = useState<number | null>(null)
  const [date,    setDate]    = useState("")
  const [days,    setDays]    = useState(1)
  const [notes,   setNotes]   = useState("")
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const canSave = typeId !== null && date !== "" && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await addEvent.mutateAsync({
        event_type_id: typeId!,
        event_date:    date,
        days_delayed:  days,
        notes:         notes.trim(),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save event")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">Log External Event</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{building.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Event Type *</label>
            {typesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading types…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {eventTypes.map(et => (
                  <button
                    key={et.id}
                    type="button"
                    onClick={() => setTypeId(et.id)}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors text-left"
                    style={typeId === et.id
                      ? { borderColor: et.color, backgroundColor: et.color + "26", color: et.color }
                      : undefined
                    }
                  >
                    <EventIcon
                      name={et.icon}
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: et.color }}
                    />
                    {et.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {/* Event Date — Calendar + Popover */}
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Event Date *</label>
              <Popover>
                <PopoverTrigger
                  className={cn(
                    "w-full flex items-center gap-2 text-sm rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted/50 transition-colors text-left",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {date ? fmtDateStr(date) : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={date ? new Date(date + "T12:00:00") : undefined}
                    onSelect={d => {
                      if (!d) return
                      const y = d.getFullYear()
                      const m = String(d.getMonth() + 1).padStart(2, "0")
                      const day = String(d.getDate()).padStart(2, "0")
                      setDate(`${y}-${m}-${day}`)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Days Delayed — stepper */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Days Delayed</label>
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-1 py-1 h-[34px] gap-1">
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => setDays(d => Math.max(1, d - 1))}
                >−</Button>
                <span className="min-w-[3ch] text-center text-sm font-bold tabular-nums">{days}</span>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => setDays(d => d + 1)}
                >+</Button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional description…"
              className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Log Event
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit event modal ──────────────────────────────────────────────────────────

function EditEventModal({
  building, event, onClose,
}: {
  building: BuildingListItem
  event:    ScheduleEvent
  onClose:  () => void
}) {
  const { data: eventTypes = [], isLoading: typesLoading } = useEventTypes()
  const editEvent = useEditBuildingEvent(building.id)

  const [typeId,  setTypeId]  = useState<number | null>(event.event_type_id)
  const [date,    setDate]    = useState(event.event_date)
  const [days,    setDays]    = useState(event.days_delayed)
  const [notes,   setNotes]   = useState(event.notes)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const canSave = typeId !== null && date !== "" && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await editEvent.mutateAsync({
        eventId: event.id,
        body: {
          event_type_id: typeId!,
          event_date:    date,
          days_delayed:  days,
          notes:         notes.trim(),
        },
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save event")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">Edit Event</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{building.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Event Type *</label>
            {typesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading types…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {eventTypes.map(et => (
                  <button
                    key={et.id}
                    type="button"
                    onClick={() => setTypeId(et.id)}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors text-left"
                    style={typeId === et.id
                      ? { borderColor: et.color, backgroundColor: et.color + "26", color: et.color }
                      : undefined
                    }
                  >
                    <EventIcon
                      name={et.icon}
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: et.color }}
                    />
                    {et.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Event Date *</label>
              <Popover>
                <PopoverTrigger
                  className={cn(
                    "w-full flex items-center gap-2 text-sm rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted/50 transition-colors text-left",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {date ? fmtDateStr(date) : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={date ? new Date(date + "T12:00:00") : undefined}
                    onSelect={d => {
                      if (!d) return
                      const y = d.getFullYear()
                      const m = String(d.getMonth() + 1).padStart(2, "0")
                      const day = String(d.getDate()).padStart(2, "0")
                      setDate(`${y}-${m}-${day}`)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Days Delayed</label>
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-1 py-1 h-[34px] gap-1">
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => setDays(d => Math.max(1, d - 1))}
                >−</Button>
                <span className="min-w-[3ch] text-center text-sm font-bold tabular-nums">{days}</span>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => setDays(d => d + 1)}
                >+</Button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional description…"
              className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete event confirmation modal ─────────────────────────────────────────

function DeleteEventModal({
  building, event, onClose,
}: {
  building: BuildingListItem
  event:    ScheduleEvent
  onClose:  () => void
}) {
  const deleteEvent = useDeleteBuildingEvent(building.id)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try { await deleteEvent.mutateAsync(event.id); onClose() }
    catch { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm text-destructive">Delete Event?</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 mb-4">
            <div
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: event.type_color + "22" }}
            >
              <EventIcon name={event.type_icon} className="h-3.5 w-3.5" style={{ color: event.type_color }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{event.type_name}</span>
                {event.days_delayed > 0 && (
                  <span className="text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                    +{event.days_delayed}d
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtDateStr(event.event_date)}</p>
              {event.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{event.notes}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            This event and its schedule impact will be permanently removed.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History rows ─────────────────────────────────────────────────────────────

function UploadHistoryRow({
  item, isLast,
}: {
  item:   ScheduleHistoryItem
  isLast: boolean
}) {
  return (
    <div className={cn("flex items-start gap-2.5 py-2", !isLast && "border-b border-border/50")}>
      <div className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        item.is_current ? "bg-primary/15" : "bg-muted",
      )}>
        <FileText className={cn("h-3 w-3", item.is_current ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-medium truncate">{item.pdf_filename}</span>
          {item.is_current && (
            <span className="shrink-0 flex items-center justify-center h-4 w-4 rounded-full bg-primary/15">
              <Check className="h-2.5 w-2.5 text-primary" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
          <span>{fmtDateStr(item.uploaded_at)}</span>
          {item.task_count != null && (
            <span>· {item.task_count} tasks</span>
          )}
        </div>
      </div>
    </div>
  )
}

function EventHistoryRow({
  item, isLast, onEdit, onDelete, deleting,
}: {
  item:     ScheduleEvent
  isLast:   boolean
  onEdit:   () => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className={cn("flex items-start gap-2.5 py-2", !isLast && "border-b border-border/50")}>
      <div
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: item.type_color + "22" }}
      >
        <EventIcon
          name={item.type_icon}
          className="h-3 w-3"
          style={{ color: item.type_color }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{item.type_name}</span>
          {item.days_delayed > 0 && (
            <span className="shrink-0 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
              +{item.days_delayed}d
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {fmtDateStr(item.event_date)}
        </div>
        {item.notes && (
          <div className="text-[11px] text-muted-foreground truncate">{item.notes}</div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onEdit}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          {deleting
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <X className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}

// ─── Building form ─────────────────────────────────────────────────────────────

function BuildingForm({
  initial, onSave, onCancel,
}: {
  initial?: { id: string; name: string; address: string }
  onSave: (name: string, address: string) => Promise<void>
  onCancel: () => void
}) {
  const [name,    setName]    = useState(initial?.name    ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [saving,  setSaving]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim(), address.trim()) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Building name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. 399 Neponset"
          className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Address</label>
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 399 Neponset Ave, Boston, MA"
          className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          {initial ? "Save Changes" : "Create Building"}
        </Button>
      </div>
    </form>
  )
}

// ─── Building card ────────────────────────────────────────────────────────────

type TimelineItem =
  | { kind: "upload"; item: ScheduleHistoryItem; date: string }
  | { kind: "event";  item: ScheduleEvent;       date: string }

function BuildingCard({ building }: { building: BuildingListItem }) {
  const [editing,            setEditing]            = useState(false)
  const [showUpload,         setShowUpload]         = useState(false)
  const [showAddEvent,       setShowAddEvent]       = useState(false)
  const [editingEvent,       setEditingEvent]       = useState<ScheduleEvent | null>(null)
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<ScheduleEvent | null>(null)
  const [showHistory,        setShowHistory]        = useState(false)
  const [confirmDelete,      setConfirmDelete]      = useState(false)

  const updateMut = useUpdateBuilding()
  const deleteMut = useDeleteBuilding()
  const delSched  = useDeleteSchedule()

  const eventsQuery  = useBuildingEvents(showHistory  ? building.id : null)
  const historyQuery = useScheduleHistory(showHistory ? building.id : null)

  const timeline: TimelineItem[] = []
  if (showHistory) {
    for (const h of historyQuery.data ?? []) {
      timeline.push({ kind: "upload", item: h, date: h.uploaded_at })
    }
    for (const e of eventsQuery.data ?? []) {
      timeline.push({ kind: "event", item: e, date: e.event_date })
    }
    timeline.sort((a, b) => b.date.localeCompare(a.date))
  }

  const historyLoading = showHistory && (eventsQuery.isLoading || historyQuery.isLoading)

  async function handleSave(name: string, address: string) {
    await updateMut.mutateAsync({ id: building.id, name, address })
    setEditing(false)
  }

  async function handleDelete() {
    await deleteMut.mutateAsync(building.id)
  }

  return (
    <>
      {showUpload         && <UploadModal   building={building} onClose={() => setShowUpload(false)} />}
      {showAddEvent       && <AddEventModal building={building} onClose={() => setShowAddEvent(false)} />}
      {editingEvent       && <EditEventModal building={building} event={editingEvent} onClose={() => setEditingEvent(null)} />}
      {confirmDeleteEvent && <DeleteEventModal building={building} event={confirmDeleteEvent} onClose={() => setConfirmDeleteEvent(null)} />}

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        {editing ? (
          <BuildingForm
            initial={{ id: building.id, name: building.name, address: building.address }}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {/* Building header */}
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold truncate">{building.name}</h3>
                {building.address && (
                  <p className="text-xs text-muted-foreground truncate">{building.address}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditing(true)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Schedule status */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-2">
              {building.has_schedule ? (
                <>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{building.pdf_filename}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    {building.task_count != null && (
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3 shrink-0" />
                        <span>{building.task_count} tasks</span>
                      </div>
                    )}
                    {building.project_start && building.project_finish && (
                      <div className="flex items-center gap-1.5">
                        <CalendarRange className="h-3 w-3 shrink-0" />
                        <span>
                          {new Date(building.project_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {" – "}
                          {new Date(building.project_finish).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    )}
                    {building.uploaded_at && (
                      <div className="flex items-center gap-1.5">
                        <ClockIcon className="h-3 w-3 shrink-0" />
                        <span>Updated {new Date(building.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => setShowAddEvent(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 hover:bg-muted transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Event
                    </button>
                    <button
                      onClick={() => setShowUpload(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 hover:bg-muted transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" /> Replace
                    </button>
                    <button
                      onClick={() => delSched.mutate(building.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border rounded-md py-1.5 hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">No schedule uploaded</span>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Upload className="h-3 w-3" /> Upload PDF
                  </button>
                </div>
              )}
            </div>

            {/* History section */}
            {building.has_schedule && (
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setShowHistory(h => !h)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    History
                  </div>
                  {showHistory
                    ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>

                {showHistory && (
                  <div className="border-t border-border px-3 py-1">
                    {historyLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!historyLoading && timeline.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No history yet.</p>
                    )}
                    {!historyLoading && timeline.length > 0 && (
                      <div>
                        {timeline.map((t, i) =>
                          t.kind === "upload" ? (
                            <UploadHistoryRow
                              key={`u-${t.item.id}`}
                              item={t.item}
                              isLast={i === timeline.length - 1}
                            />
                          ) : (
                            <EventHistoryRow
                              key={`e-${t.item.id}`}
                              item={t.item}
                              isLast={i === timeline.length - 1}
                              onEdit={() => setEditingEvent(t.item)}
                              onDelete={() => setConfirmDeleteEvent(t.item)}
                              deleting={false}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Confirm delete */}
            {confirmDelete && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive mb-2">Delete &ldquo;{building.name}&rdquo;?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  This will permanently remove the building and all its schedules.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button
                    variant="destructive" size="sm"
                    onClick={handleDelete}
                    disabled={deleteMut.isPending}
                  >
                    {deleteMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BuildingScheduleManagePage() {
  const { data: buildings = [], isLoading } = useBuildings()
  const createMut = useCreateBuilding()
  const [showAdd, setShowAdd] = useState(false)

  async function handleCreate(name: string, address: string) {
    await createMut.mutateAsync({ name, address })
    setShowAdd(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Schedule Data Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage buildings and upload MS Project PDF schedules
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Building
        </Button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">New Building</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <BuildingForm onSave={handleCreate} onCancel={() => setShowAdd(false)} />
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && buildings.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">No buildings yet. Click &ldquo;Add Building&rdquo; to get started.</p>
        </div>
      )}

      {!isLoading && buildings.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 pb-4">
            {buildings.map(b => (
              <BuildingCard key={b.id} building={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
