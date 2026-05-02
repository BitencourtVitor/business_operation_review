"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTradeOwnership, useUpsertTradeOwnership } from "@/hooks/use-buildings"
import { resColor, resIcon, toTitleCase } from "../_lib/trade-config"

export function TradeControlModal({
  buildingId,
  allResources,
  onClose,
}: {
  buildingId:   string
  allResources: string[]
  onClose:      () => void
}) {
  const { data: ownership = [], isLoading } = useTradeOwnership(buildingId)
  const upsert = useUpsertTradeOwnership(buildingId)

  const [localTrades, setLocalTrades] = useState<Record<string, boolean>>({})
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (isLoading || initialized) return
    const map: Record<string, boolean> = {}
    for (const t of allResources) {
      const existing = ownership.find(o => o.trade_name === t)
      map[t] = existing?.is_ours ?? true
    }
    setLocalTrades(map)
    setInitialized(true)
  }, [ownership, allResources, isLoading, initialized])

  async function handleSave() {
    await upsert.mutateAsync(
      Object.entries(localTrades).map(([trade_name, is_ours]) => ({ trade_name, is_ours }))
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-sm mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Trade Control</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Which trades does our team perform?</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && allResources.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No trades found in this schedule.</p>
          )}
          {!isLoading && allResources.map(trade => {
            const isOurs = localTrades[trade] ?? true
            const Icon   = resIcon(trade)
            return (
              <button
                key={trade}
                type="button"
                onClick={() => setLocalTrades(prev => ({ ...prev, [trade]: !prev[trade] }))}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
                  isOurs ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30",
                )}
              >
                <span className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", resColor(trade))}>
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-[9px] font-bold">{toTitleCase(trade).slice(0, 2)}</span>}
                </span>
                <span className="flex-1 text-[11px] font-medium truncate">{toTitleCase(trade)}</span>
                <span className={cn(
                  "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full",
                  isOurs ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  {isOurs ? "Our team" : "Subcontractor"}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            disabled={allResources.length === 0 || isLoading}
            onClick={() => {
              const allOurs = allResources.every(t => localTrades[t] ?? true)
              setLocalTrades(Object.fromEntries(allResources.map(t => [t, !allOurs])))
            }}
            className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors disabled:opacity-40"
          >
            {allResources.every(t => localTrades[t] ?? true) ? "Deselect All" : "Select All"}
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={upsert.isPending || isLoading}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
