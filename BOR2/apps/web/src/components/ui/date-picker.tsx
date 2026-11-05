"use client"

import { useState } from "react"
import { CalendarIcon, X } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Data como "yyyy-MM-dd" (o mesmo valor do input nativo), lida no fuso local.
const toDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Seletor de data do sistema (regra 7): Calendar + Popover, ícone como prefixo e limpar como sufixo. */
export function DatePicker({ value, onChange, placeholder = "Pick a date", className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? toDate(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn("flex h-8 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30", className)}>
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
          {selected ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : placeholder}
        </span>
        {value && (
          <span role="button" aria-label="Clear date" onClick={e => { e.stopPropagation(); onChange("") }}
            className="-mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0" positionerStyle={{ width: "auto" }}>
        <Calendar mode="single" selected={selected} defaultMonth={selected}
          onSelect={d => { if (d) { onChange(toIso(d)); setOpen(false) } }} />
      </PopoverContent>
    </Popover>
  )
}
