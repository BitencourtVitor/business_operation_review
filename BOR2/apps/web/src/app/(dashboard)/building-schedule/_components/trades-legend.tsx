"use client"

import { useState } from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  resColor,
  resIcon,
  resCategory,
  toTitleCase,
  CATEGORY_ORDER,
} from "../_lib/trade-config"

export function TradesLegend({ displayResources }: { displayResources: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors">
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && displayResources.length > 0 && (() => {
        const groupMap = new Map<string, string[]>()
        for (const r of displayResources) {
          const cat = resCategory(r)
          if (!groupMap.has(cat)) groupMap.set(cat, [])
          groupMap.get(cat)?.push(r)
        }
        const groups = CATEGORY_ORDER
          .filter(l => groupMap.has(l))
          .map(l => ({ label: l, items: groupMap.get(l)! }))
        return (
          <div className="absolute top-full right-0 mt-1.5 bg-popover border border-border rounded-lg shadow-xl z-50 p-4 w-[560px] max-h-[75vh] overflow-y-auto">
            <div className="mb-4 pb-4 border-b border-border/50">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Chart</div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: "Project start", line: "#10b981" },
                  { label: "Project end",   line: "#f43f5e" },
                  { label: "Today",         line: "rgba(255,255,255,0.35)" },
                  { label: "Current month", bg: true },
                ].map(({ label, line, bg }) => (
                  <div key={label} className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                    <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-muted/30">
                      {bg
                        ? <span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/40" />
                        : <span className="h-3" style={{ borderLeft: `1px dashed ${line}` }} />
                      }
                    </span>
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Trades</div>
            <div className="flex flex-col gap-4">
              {groups.map(({ label, items }) => (
                <div key={label}>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5 px-1">{label}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {items.map(r => {
                      const Icon = resIcon(r)
                      return (
                        <div key={r} className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground min-w-0">
                          <span className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", resColor(r))}>
                            {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0, 2)}</span>}
                          </span>
                          <span className="truncate min-w-0 flex-1">{toTitleCase(r)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
