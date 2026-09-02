"use client"

import { Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { tradeIcon } from "../_lib/trade-icons"
import type { Trade } from "../_lib/types"

export function TradeCard({
  trade, onEdit, onDelete,
}: {
  trade: Trade
  // Both absent for read-only access — the card still shows what the trade is.
  onEdit?: () => void
  onDelete?: () => void
}) {
  const Icon = tradeIcon(trade.icon)
  const scopeCount = trade.workIncluded.length + trade.exclusions.length + trade.responsibilityMatrix.length

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{trade.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {trade.code}{!trade.hasBidForm && " · Contract generated from scope"}
          </p>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {onEdit && (
              <button
                onClick={onEdit}
                aria-label={`Edit ${trade.name}`}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                aria-label={`Delete ${trade.name}`}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={trade.hasBidForm ? "secondary" : "outline"} className="text-[10px]">
          {trade.hasBidForm ? "Bid form" : "Direct contract"}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {trade.questions.length} {trade.questions.length === 1 ? "question" : "questions"}
        </Badge>
        {scopeCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {scopeCount} scope {scopeCount === 1 ? "item" : "items"}
          </Badge>
        )}
      </div>

      {trade.standardNote && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{trade.standardNote}</p>
      )}
    </div>
  )
}
