"use client"

import { useCallback, useRef, useState } from "react"
import {
  Building2,
  CalendarRange,
  Check,
  ClockIcon,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  useBuildings,
  useCreateBuilding,
  useUpdateBuilding,
  useDeleteBuilding,
  useUpsertSchedule,
  useDeleteSchedule,
} from "@/hooks/use-buildings"
import {
  parseSchedulePDF,
  toDateStr,
  fmtDateFull,
  type ParsedSchedule,
} from "@/lib/pdf-schedule-parser"
import type { BuildingListItem, ParsedScheduleStored } from "@/services/buildings.service"

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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">Upload Schedule PDF</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{building.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
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

        {/* Footer */}
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
          autoFocus
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

function BuildingCard({ building }: { building: BuildingListItem }) {
  const [editing,       setEditing]       = useState(false)
  const [showUpload,    setShowUpload]    = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMut  = useUpdateBuilding()
  const deleteMut  = useDeleteBuilding()
  const delSched   = useDeleteSchedule()

  async function handleSave(name: string, address: string) {
    await updateMut.mutateAsync({ id: building.id, name, address })
    setEditing(false)
  }

  async function handleDelete() {
    await deleteMut.mutateAsync(building.id)
  }

  return (
    <>
      {showUpload && (
        <UploadModal building={building} onClose={() => setShowUpload(false)} />
      )}

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        {editing ? (
          <BuildingForm
            initial={{ id: building.id, name: building.name, address: building.address }}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
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
      {/* Header */}
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">
            Schedule Data Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage buildings and upload MS Project PDF schedules
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Building
        </Button>
      </div>

      {/* Add building modal */}
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

      {/* Building grid */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {buildings.map(b => (
              <BuildingCard key={b.id} building={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
