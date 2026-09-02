"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type BuildingItem = {
  id:            string
  name:          string
  has_schedule?: boolean
  task_count?:   number | null
  project_start?: string | null
}

export function BuildingDropdown({
  buildings,
  selectedId,
  onSelect,
  isLoading,
}: {
  buildings:  BuildingItem[]
  selectedId: string | null
  onSelect:   (id: string) => void
  isLoading:  boolean
}) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)
  const selected        = buildings.find(b => b.id === selectedId)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-input bg-transparent dark:bg-input/30 hover:bg-muted/80 transition-colors text-sm max-w-[220px]"
      >
        {isLoading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          : <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.name ?? "Select building"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] max-w-[280px] bg-popover border border-border rounded-md shadow-md z-50 py-1.5 max-h-64 overflow-y-auto">
          {buildings.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No buildings yet.</div>
          )}
          {buildings.map(b => (
            <button
              key={b.id}
              onClick={() => { onSelect(b.id); setOpen(false) }}
              className={cn(
                "w-[calc(100%-12px)] text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors rounded-md mx-1.5",
                selectedId === b.id && "bg-primary/10 text-primary",
              )}
            >
              <div className="font-medium truncate">{b.name}</div>
              {b.has_schedule
                ? <div className="text-[11px] text-muted-foreground">{b.task_count ?? 0} tasks{b.project_start ? ` · ${b.project_start.slice(0, 7)}` : ""}</div>
                : <div className="text-[11px] text-muted-foreground/50">No schedule</div>
              }
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
