"use client"

import { CalendarDays, MapPin, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { tradeIcon } from "../_lib/trade-icons"
import { STATUS_META, PROJECT_STATUS_META } from "../_lib/status-meta"
import { projectProgress } from "../_lib/projects-store"
import { currentStatus, lastEvent } from "../_lib/events"
import { formatDate } from "../_lib/format"
import { PROJECT_STATUS_LABEL, TRADE_EVENT_LABEL, TRADE_STATUS_LABEL } from "../_lib/types"
import type { Project, Trade } from "../_lib/types"

const MAX_ICONS = 10

export function ProjectCard({
  project, trades, onOpen, onDelete,
}: {
  project: Project
  trades: Trade[]
  onOpen: () => void
  onDelete?: () => void   // absent for read-only access — no trash on the card
}) {
  const { done, total } = projectProgress(project)
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const shown = project.trades.slice(0, MAX_ICONS)
  const rest = project.trades.length - shown.length
  const status = PROJECT_STATUS_META[project.status]
  const StatusIcon = status.icon

  return (
    // The whole block opens the project — the trash is the only exception.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen() } }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{project.name || "Untitled project"}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{project.address || "No address"}</span>
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 gap-1 text-[10px] ${status.text} ${status.border} ${status.bg}`}>
          <StatusIcon className="h-3 w-3" />
          {PROJECT_STATUS_LABEL[project.status]}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Trades complete</span>
          <span className="font-medium tabular-nums">{done} of {total}</span>
        </div>
        <Progress value={pct} />
      </div>

      {project.trades.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {shown.map(pt => {
            const trade = trades.find(t => t.id === pt.tradeId)
            if (!trade) return null
            const Icon = tradeIcon(trade.icon)
            const status = currentStatus(trade, pt)
            const meta = STATUS_META[status]
            const last = lastEvent(pt)
            return (
              <TooltipProvider key={pt.tradeId} delay={200}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className={`flex h-6 w-6 cursor-default items-center justify-center rounded-md border ${meta.border} ${meta.bg} ${meta.text}`}
                      />
                    }
                  >
                    <Icon className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent className="flex max-w-[240px] flex-col gap-1">
                    <p className="font-semibold">{trade.name}</p>
                    <p className={`flex items-center gap-1.5 text-xs ${meta.text}`}>
                      <Icon className="h-3 w-3 shrink-0" />
                      {TRADE_STATUS_LABEL[status]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {last && last.type !== "created"
                        ? `${TRADE_EVENT_LABEL[last.type]} on ${formatDate(last.at)}`
                        : `Opened ${last ? formatDate(last.at) : "—"} · no event logged yet`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          })}
          {rest > 0 && <span className="text-[11px] text-muted-foreground">+{rest}</span>}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-2.5">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          Added {formatDate(project.createdAt)}
        </span>
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            aria-label={`Delete ${project.name}`}
            className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
