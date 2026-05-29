'use client'

import { createPortal } from "react-dom"
import type { ServiceRequest } from "@/services/service-request.service"
import {
  CalendarCheck, CalendarDays, CalendarClock,
  MapPin, ShieldCheck, HardHat, Wrench, Database,
  CheckCircle2, Circle, Clock, X,
} from "lucide-react"
import { STATUS_CFG, NODE_COLORS } from "../types"
import { getStatus, getResolutionInfo, fmtShort, parseLot, fmtLot } from "../lib"

interface DetailModalProps {
  r: ServiceRequest
  onClose: () => void
}

export function DetailModal({ r, onClose }: DetailModalProps) {
  const status = getStatus(r)
  const { label, color } = STATUS_CFG[status]
  const { days, onTime, fromResident } = getResolutionInfo(r)
  const visits = r.additionalVisits ?? []

  // Only show optional nodes (Mat, Res) if they have a date
  const allNodes = [
    { label: "Received",  short: "Rec",  icon: CalendarDays,  date: r.dateReceived,          color: NODE_COLORS.received,  optional: false },
    { label: "Material",  short: "Mat",  icon: CalendarClock, date: r.materialAvailableDate, color: NODE_COLORS.material,  optional: true  },
    { label: "Resident",  short: "Res",  icon: CalendarClock, date: r.residentAvailableDate, color: NODE_COLORS.resident,  optional: true  },
    { label: "Completed", short: "Done", icon: CalendarCheck, date: r.dateCompleted,         color: NODE_COLORS.completed, optional: false },
  ]
  const mainNodes = allNodes.filter(n => !n.optional || !!n.date)

  function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
    if (!a || !b) return null
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
    return diff > 0 ? diff : null
  }
  const segDays = mainNodes.slice(0, -1).map((n, i) =>
    daysBetween(n.date, mainNodes[i + 1].date)
  )

  function fmtAbbr(s: string | null | undefined): string {
    if (!s) return ""
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return ""
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — status + warranty + close */}
        <div className="flex shrink-0 items-center justify-between px-6 py-4">
          <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
          <div className="flex items-center gap-2">
            {r.warranty && (
              <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-500">
                <ShieldCheck className="h-3 w-3" />
                Warranty
              </span>
            )}
            {r.subcontractor && (
              <span className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500">
                <HardHat className="h-3 w-3" />
                Subcontractor
              </span>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Identity hero */}
        <div className="flex shrink-0 items-start gap-3 border-y border-border bg-muted/30 px-6 py-5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{r.address || fmtLot(r.lot) || r.jobSite || "Service Request"}</p>
            {(r.city || r.jobSite) && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[r.city, r.jobSite].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* Info rows */}
        <div className="flex flex-1 flex-col divide-y divide-border/40 overflow-y-auto px-6 py-1">
          {r.contractor && (
            <div className="flex items-center gap-3 py-3">
              <Wrench className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <span className="flex-1 text-sm text-muted-foreground">Contractor</span>
              <span className="text-sm font-medium">{r.contractor}</span>
            </div>
          )}
          {parseLot(r.lot) && (() => {
            const lot = parseLot(r.lot)!
            return (
              <div className="flex items-center gap-3 py-3">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                <span className="flex-1 text-sm text-muted-foreground">{lot.label}</span>
                <span className="text-sm font-medium">{lot.value}</span>
              </div>
            )
          })()}
          {r.issue && (
            <div className="flex items-start gap-3 py-3">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
              <p className="text-sm italic leading-relaxed text-muted-foreground">{r.issue}</p>
            </div>
          )}
          {r.tech && (
            <div className="flex items-center gap-3 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <span className="flex-1 text-sm text-muted-foreground">Technician</span>
              <span className="text-sm font-semibold text-primary">{r.tech}</span>
            </div>
          )}
          {(r.dateReceived || r.dateCompleted) && (
            <div className="flex items-center gap-3 py-3">
              <Clock className="h-4 w-4 shrink-0" style={{ color: onTime ? "#22c55e" : "#ef4444" }} />
              <span className="flex-1 text-sm text-muted-foreground">Resolution</span>
              <span className="text-sm font-semibold" style={{ color: onTime ? "#22c55e" : "#ef4444" }}>
                {days}d · {onTime ? "On Time" : "Exceeded"}
              </span>
            </div>
          )}
          {visits.length > 0 && (
            <div className="flex items-center gap-3 py-3">
              <Circle className="h-4 w-4 shrink-0 text-red-400" />
              <span className="flex-1 text-sm text-muted-foreground">Additional Visits</span>
              <div className="flex items-center gap-1.5">
                {visits.map((d, i) => (
                  <span key={i} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500">
                    {fmtShort(d) ?? "—"}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="shrink-0 border-t border-border px-6 pb-6 pt-5">
          <p className="mb-6 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</p>

          {/* Nodes row — flex alternating: node | segment | node | segment | node ... */}
          <div className="flex items-start">
            {mainNodes.map((node, i) => {
              const Icon = node.icon
              const isLast = i === mainNodes.length - 1
              const seg = segDays[i]

              return (
                <div key={node.label} className={`flex items-start ${isLast ? "w-10 shrink-0" : "flex-1"}`}>
                  {/* Node */}
                  <div className="flex w-10 shrink-0 flex-col items-center gap-2">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full border-2 bg-popover transition-colors"
                      style={{ borderColor: node.color }}
                    >
                      <Icon className="h-4 w-4" style={{ color: node.color }} />
                    </div>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {node.short}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-foreground">
                      {fmtAbbr(node.date)}
                    </span>
                  </div>

                  {/* Segment to next node */}
                  {!isLast && (
                    <div className="relative flex-1 self-start" style={{ marginTop: "1.125rem" }}>
                      <div className="h-px w-full bg-border" />
                      {node.date && mainNodes[i + 1].date && (
                        <div
                          className="absolute inset-0 h-px"
                          style={{ background: `linear-gradient(to right, ${node.color}, ${mainNodes[i + 1].color})` }}
                        />
                      )}
                      {seg != null && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[11px] font-semibold tabular-nums text-foreground">
                          {seg}d
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Resolution note */}
          {fromResident && (
            <p className="mt-4 text-center text-[10px] text-muted-foreground/60">
              Resolution counted from resident availability date
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
