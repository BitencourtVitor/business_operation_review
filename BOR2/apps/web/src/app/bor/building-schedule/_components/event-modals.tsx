"use client"

import { useState } from "react"
import { CalendarRange, Check, Loader2, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  useAddBuildingEvent,
  useEditBuildingEvent,
  useDeleteBuildingEvent,
  useEventTypes,
} from "@/hooks/use-buildings"
import type { ScheduleEvent } from "@/services/buildings.service"
import { fmtDateStr, EventTypeIcon } from "../_lib/schedule-utils"

// ─── Add event modal ──────────────────────────────────────────────────────────

export function AddEventModal({
  buildingId,
  buildingName,
  onClose,
}: {
  buildingId:   string
  buildingName: string
  onClose:      () => void
}) {
  const { data: eventTypes = [], isLoading: typesLoading } = useEventTypes()
  const addEvent = useAddBuildingEvent(buildingId)

  const [typeId, setTypeId] = useState<number | null>(null)
  const [date,   setDate]   = useState("")
  const [days,   setDays]   = useState(1)
  const [notes,  setNotes]  = useState("")
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const canSave = typeId !== null && date !== "" && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true); setError(null)
    try {
      await addEvent.mutateAsync({ event_type_id: typeId!, event_date: date, days_delayed: days, notes: notes.trim() })
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
            <p className="text-xs text-muted-foreground mt-0.5">{buildingName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Event Type *</label>
            {typesLoading
              ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading types…</div>
              : (
                <div className="grid grid-cols-2 gap-1.5">
                  {eventTypes.map(et => (
                    <button key={et.id} type="button" onClick={() => setTypeId(et.id)}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors text-left"
                      style={typeId === et.id ? { borderColor: et.color, backgroundColor: et.color + "26", color: et.color } : undefined}>
                      <EventTypeIcon name={et.icon} className="h-3.5 w-3.5 shrink-0" style={{ color: et.color }} />
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
                <PopoverTrigger className={cn("w-full flex items-center gap-2 text-sm rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted/50 transition-colors text-left", !date && "text-muted-foreground")}>
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {date ? fmtDateStr(date) : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={date ? new Date(date + "T12:00:00") : undefined}
                    onSelect={d => {
                      if (!d) return
                      const y = d.getFullYear()
                      const m = String(d.getMonth() + 1).padStart(2, "0")
                      const day = String(d.getDate()).padStart(2, "0")
                      setDate(`${y}-${m}-${day}`)
                    }} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Days Delayed</label>
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-1 py-1 h-[34px] gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setDays(d => Math.max(1, d - 1))}>−</Button>
                <span className="min-w-[3ch] text-center text-sm font-bold tabular-nums">{days}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setDays(d => d + 1)}>+</Button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional description…"
              className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Log Event
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit event modal ─────────────────────────────────────────────────────────

export function EditEventModal({
  buildingId,
  event,
  onClose,
}: {
  buildingId: string
  event:      ScheduleEvent
  onClose:    () => void
}) {
  const { data: eventTypes = [], isLoading: typesLoading } = useEventTypes()
  const editEvent = useEditBuildingEvent(buildingId)

  const [typeId, setTypeId] = useState<number | null>(event.event_type_id)
  const [date,   setDate]   = useState(event.event_date)
  const [days,   setDays]   = useState(event.days_delayed)
  const [notes,  setNotes]  = useState(event.notes)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const canSave = typeId !== null && date !== "" && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true); setError(null)
    try {
      await editEvent.mutateAsync({ eventId: event.id, body: { event_type_id: typeId!, event_date: date, days_delayed: days, notes: notes.trim() } })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Edit Event</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Event Type *</label>
            {typesLoading
              ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
              : (
                <div className="grid grid-cols-2 gap-1.5">
                  {eventTypes.map(et => (
                    <button key={et.id} type="button" onClick={() => setTypeId(et.id)}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors text-left"
                      style={typeId === et.id ? { borderColor: et.color, backgroundColor: et.color + "26", color: et.color } : undefined}>
                      <EventTypeIcon name={et.icon} className="h-3.5 w-3.5 shrink-0" style={{ color: et.color }} />
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
                <PopoverTrigger className={cn("w-full flex items-center gap-2 text-sm rounded-md border border-border bg-background px-3 py-1.5 hover:bg-muted/50 transition-colors text-left", !date && "text-muted-foreground")}>
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {date ? fmtDateStr(date) : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={date ? new Date(date + "T12:00:00") : undefined}
                    onSelect={d => {
                      if (!d) return
                      const y = d.getFullYear()
                      const m = String(d.getMonth() + 1).padStart(2, "0")
                      const day = String(d.getDate()).padStart(2, "0")
                      setDate(`${y}-${m}-${day}`)
                    }} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Days Delayed</label>
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-1 py-1 h-[34px] gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setDays(d => Math.max(1, d - 1))}>−</Button>
                <span className="min-w-[3ch] text-center text-sm font-bold tabular-nums">{days}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setDays(d => d + 1)}>+</Button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional description…"
              className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete event modal ───────────────────────────────────────────────────────

export function DeleteEventModal({
  buildingId,
  event,
  onClose,
}: {
  buildingId: string
  event:      ScheduleEvent
  onClose:    () => void
}) {
  const deleteEvent = useDeleteBuildingEvent(buildingId)
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 mb-4">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: event.type_color + "22" }}>
              <EventTypeIcon name={event.type_icon} className="h-3.5 w-3.5" style={{ color: event.type_color }} />
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
          <p className="text-xs text-muted-foreground mb-4">This event and its schedule impact will be permanently removed.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
