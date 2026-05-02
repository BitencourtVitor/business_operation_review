"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { STAGE_META, fmtDateUS, daysBetween, getStageDate } from "../_lib/utils"
import type { ProjectMonitoringEntry } from "@/services/project-monitoring.service"

function stageStatusColor(status: string): string {
  const lower = (status ?? "").toLowerCase()
  if (lower.includes("complet")) return "#28a745"
  if (lower.includes("progress")) return "#ffc107"
  return "#dc3545"
}

export function ProjectDetailModal({
  project,
  onClose,
}: {
  project: ProjectMonitoringEntry
  onClose: () => void
}) {
  const stageFields = [project.s1Rough, project.s2Machines, project.s3Condenser, project.s4Finish]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Project Monitoring</p>
            <h2 className="text-sm font-semibold">
              {[project.lotNumber ? `Lot ${project.lotNumber}` : null, project.jobSite, project.city]
                .filter(Boolean).join(" • ")}
            </h2>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
          <div className="flex flex-col gap-4">

            {/* Team */}
            {project.team && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Team</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {project.team}
                </span>
              </div>
            )}

            {/* Start / Finish dates */}
            <div className="grid grid-cols-2 gap-3">
              {(["startDate", "finishDate"] as const).map(field => (
                <div key={field} className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/30 py-3">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {field === "startDate" ? "Start Date" : "Finish Date"}
                  </span>
                  <span className="mt-1 text-sm font-semibold">{fmtDateUS(project[field])}</span>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex flex-col">
              <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stage Timeline
              </span>
              <div className="flex flex-col">
                {STAGE_META.map((s, i) => { // s.field is the unique key
                  const status  = stageFields[i] || "Not Started"
                  const date    = getStageDate(project, i)
                  const prevDate = i === 0 ? project.startDate : getStageDate(project, i - 1)
                  const duration = daysBetween(prevDate, date)
                  const color   = stageStatusColor(status)
                  const isLast  = i === STAGE_META.length - 1

                  return (
                    <div key={s.field} className="flex gap-3">
                      {/* Left column: circle + connector line */}
                      <div className="flex flex-col items-center">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold text-white"
                          style={{ background: color, borderColor: color }}
                        >
                          {i + 1}
                        </div>
                        {!isLast && <div className="w-0.5 flex-1 bg-border" style={{ minHeight: "20px" }} />}
                      </div>

                      {/* Right column: stage info */}
                      <div className={cn("flex flex-col pb-3", isLast && "pb-0")}>
                        <span className="text-sm font-semibold">{s.label}</span>
                        <span className="text-xs" style={{ color }}>{status}</span>
                        {date && (
                          <span className="mt-0.5 text-[11px] text-muted-foreground">
                            {fmtDateUS(date)}
                            {duration !== null && duration > 0 && ` · ${duration} day${duration !== 1 ? "s" : ""}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Overall progress */}
            {project.percentCompleted !== undefined && (
              <div
                className="flex items-center justify-between rounded-xl border p-3"
                style={{
                  background: project.percentCompleted >= 100 ? "rgba(40,167,69,0.08)" : "rgba(255,193,7,0.08)",
                  borderColor: project.percentCompleted >= 100 ? "#28a74540" : "#ffc10740",
                }}
              >
                <span className="text-xs font-medium text-muted-foreground">Overall Progress</span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: project.percentCompleted >= 100 ? "#28a745" : "#ffc107" }}
                >
                  {Math.round(project.percentCompleted)}%
                </span>
              </div>
            )}

            {/* Last update */}
            {project.lastUpdate && (
              <div className="rounded-xl border border-blue-400/30 bg-blue-500/5 px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Update</span>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{fmtDateUS(project.lastUpdate)}</p>
              </div>
            )}

            {/* Notes */}
            {project.notes && (
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Notes</span>
                <p className="mt-1 text-sm leading-relaxed">{project.notes}</p>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
