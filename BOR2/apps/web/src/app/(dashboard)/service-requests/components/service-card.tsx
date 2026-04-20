'use client'

import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ServiceRequest } from "@/services/service-request.service"
import {
  CalendarCheck, CalendarDays, CalendarClock,
  MapPin, ShieldCheck, Clock,
} from "lucide-react"
import { STATUS_CFG } from "../types"
import { getStatus, getResolutionInfo, fmtMMDD, fmtLot } from "../lib"

interface ServiceCardProps {
  r: ServiceRequest
  onClick: () => void
}

export function ServiceCard({ r, onClick }: ServiceCardProps) {
  const status = getStatus(r)
  const { label, color } = STATUS_CFG[status]
  const { days, onTime } = getResolutionInfo(r)
  const visits = (r.additionalVisits ?? []).length

  const DATE_ROWS = [
    { icon: CalendarDays,  label: "Received",  value: fmtMMDD(r.dateReceived)          },
    { icon: CalendarCheck, label: "Completed", value: fmtMMDD(r.dateCompleted)         },
    { icon: CalendarClock, label: "Material",  value: fmtMMDD(r.materialAvailableDate) },
    { icon: CalendarClock, label: "Resident",  value: fmtMMDD(r.residentAvailableDate) },
  ].filter(row => row.value !== "—")

  return (
    <div
      onClick={onClick}
      className="flex w-60 shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-150 hover:border-border hover:shadow-lg"
    >
      {/* Header — status + warranty */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        {r.warranty && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex cursor-default" />}>
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-orange-500" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[180px] text-center text-xs">
                Warranty Request
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col divide-y divide-border/40">

        {/* Location */}
        <div className="flex items-start gap-2.5 px-4 py-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0 flex flex-col gap-0.5">
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {[r.city, r.jobSite].filter(Boolean).join(" · ") || "—"}
            </p>
            <p className="truncate text-sm font-semibold">
              {r.address || fmtLot(r.lot) || r.jobSite || "—"}
            </p>
          </div>
        </div>

        {/* Dates */}
        {DATE_ROWS.length > 0 && (
          <div className="flex flex-col justify-center gap-1.5 px-4 py-2">
            {DATE_ROWS.map(({ icon: Icon, label: lbl, value }) => (
              <div key={lbl} className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-[11px] text-muted-foreground">{lbl}</span>
                <span className="text-[11px] font-semibold tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer — inline: [clock days • issue] ←→ [visits tech] */}
        <div className="flex items-center justify-between gap-2 px-4 py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" style={{ color: onTime ? "#28a745" : "#dc3545" }} />
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: onTime ? "#28a745" : "#dc3545" }}>
              {days}d
            </span>
            {r.issue && (
              <>
                <span className="mx-0.5 text-muted-foreground/40">•</span>
                <span className="min-w-0 truncate text-[10px] italic text-muted-foreground">{r.issue}</span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {visits > 0 && (
              <span className="text-[10px] font-semibold text-red-400">+{visits}</span>
            )}
            {r.tech && (
              <span className="text-[10px] font-semibold text-primary">{r.tech}</span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
