"use client"

import { useState } from "react"
import { Check, FileText, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUpsertSchedule } from "@/hooks/use-buildings"
import {
  parseSchedulePDF,
  toDateStr,
  fmtDateFull,
  type ParsedSchedule,
} from "@/lib/pdf-schedule-parser"
import type { BuildingListItem, ParsedScheduleStored } from "@/services/buildings.service"
import { DropZone } from "./drop-zone"

export function UploadModal({ building, onClose }: { building: BuildingListItem; onClose: () => void }) {
  const [stage,  setStage]  = useState<"drop" | "parsing" | "preview" | "uploading">("drop")
  const [error,  setError]  = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null)
  const upsert = useUpsertSchedule(building.id)

  async function handleFile(file: File) {
    setStage("parsing"); setError(null)
    try {
      const result = await parseSchedulePDF(file)
      setParsed(result); setStage("preview")
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5">
          {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}

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
                <p className="text-xs text-muted-foreground text-center mt-3">Uploading a new PDF will replace the current schedule.</p>
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
                    <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">{r}</span>
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
            <Button variant="outline" size="sm" onClick={() => setStage("drop")}>Back</Button>
            <Button size="sm" onClick={confirm}>
              <Check className="h-3.5 w-3.5 mr-1.5" />Save Schedule
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
