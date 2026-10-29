"use client"

import { useState } from "react"
import {
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  ClockIcon,
  FileText,
  History,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useUpdateBuilding,
  useDeleteBuilding,
  useBuildingEvents,
  useScheduleHistory,
} from "@/hooks/use-buildings"
import type { BuildingListItem, ScheduleEvent } from "@/services/buildings.service"
import { type TimelineItem } from "../_lib/utils"
import { UploadModal } from "./upload-modal"
import { AddEventModal, EditEventModal, DeleteEventModal, RemoveScheduleModal } from "./event-modals"
import { UploadHistoryRow, EventHistoryRow } from "./history-rows"
import { BuildingForm } from "./building-form"

export function BuildingCard({ building }: { building: BuildingListItem }) {
  const [editing,            setEditing]            = useState(false)
  const [showUpload,         setShowUpload]         = useState(false)
  const [showAddEvent,       setShowAddEvent]       = useState(false)
  const [editingEvent,       setEditingEvent]       = useState<ScheduleEvent | null>(null)
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<ScheduleEvent | null>(null)
  const [showHistory,        setShowHistory]        = useState(false)
  const [confirmDelete,      setConfirmDelete]      = useState(false)
  const [confirmRemoveSched, setConfirmRemoveSched] = useState(false)

  const updateMut = useUpdateBuilding()
  const deleteMut = useDeleteBuilding()

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
      {confirmRemoveSched && <RemoveScheduleModal building={building} onClose={() => setConfirmRemoveSched(false)} />}

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
                {building.address && <p className="text-xs text-muted-foreground truncate">{building.address}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
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
                        <Layers className="h-3 w-3 shrink-0" /><span>{building.task_count} tasks</span>
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
                    <button onClick={() => setShowAddEvent(true)} className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 hover:bg-muted transition-colors">
                      <Plus className="h-3 w-3" /> Event
                    </button>
                    <button onClick={() => setShowUpload(true)} className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 hover:bg-muted transition-colors">
                      <RefreshCw className="h-3 w-3" /> Replace
                    </button>
                    <button onClick={() => setConfirmRemoveSched(true)} className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border rounded-md py-1.5 hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">No schedule uploaded</span>
                  <button onClick={() => setShowUpload(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
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
                    <History className="h-3.5 w-3.5" />History
                  </div>
                  {showHistory ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
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
                            <UploadHistoryRow key={`u-${t.item.id}`} item={t.item} isLast={i === timeline.length - 1} />
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

            {/* Confirm delete building */}
            {confirmDelete && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive mb-2">Delete &ldquo;{building.name}&rdquo;?</p>
                <p className="text-xs text-muted-foreground mb-3">This will permanently remove the building and all its schedules.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
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
