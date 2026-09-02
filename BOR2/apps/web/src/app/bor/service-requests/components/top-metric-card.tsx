'use client'

import { useState } from "react"
import { Eye } from "lucide-react"
import type { TopItem } from "../types"

interface TopMetricCardProps {
  label: string
  items: TopItem[]
}

export function TopMetricCard({ label, items }: TopMetricCardProps) {
  const [open, setOpen] = useState(false)
  const top = items[0]

  return (
    <div className="relative flex flex-col gap-1 rounded-lg border border-border/50 bg-card/60 p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-semibold">{top?.name ?? "—"}</span>
      <span className="text-xs text-muted-foreground">{top?.count ?? 0} req.</span>

      <button
        onClick={() => setOpen(s => !s)}
        className={`absolute right-2 top-2 rounded p-1 transition-colors ${open ? "text-primary" : "text-muted-foreground/40 hover:text-foreground"}`}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-60 max-w-[90vw] rounded-lg border border-border bg-popover p-2 shadow-lg">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            All {label}
          </p>
          <div className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.name} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40">
                <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
                <span className="shrink-0 text-xs font-semibold">{item.count}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
