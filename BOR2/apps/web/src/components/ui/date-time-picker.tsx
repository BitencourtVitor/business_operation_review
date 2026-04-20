"use client"

import { useState, useEffect } from "react"
import { format, isValid } from "date-fns"
import { CalendarIcon, ChevronDown, ChevronUp } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  value: string
  onChange: (v: string) => void
  min?: string
  disabled?: boolean
  className?: string
}

function parseValue(v: string) {
  if (!v) return { date: undefined, hour: "07", minute: "00", ampm: "AM" as const }
  const d = new Date(v + (v.includes("T") ? "" : "T00:00"))
  if (!isValid(d)) return { date: undefined, hour: "07", minute: "00", ampm: "AM" as const }
  const h24 = d.getHours()
  const ampm = h24 >= 12 ? "PM" as const : "AM" as const
  let h12 = h24 % 12; if (h12 === 0) h12 = 12
  return { date: d, hour: String(h12).padStart(2, "0"), minute: String(d.getMinutes()).padStart(2, "0"), ampm }
}

function toIso(date: Date | undefined, hour: string, minute: string, ampm: "AM" | "PM") {
  if (!date) return ""
  let h = Number(hour)
  if (ampm === "AM") { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
  const d = new Date(date); d.setHours(h, Number(minute), 0, 0)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function SpinButton({ value, onUp, onDown }: { value: string; onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" onClick={onUp} className="flex h-6 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-xl font-bold tabular-nums leading-none">{value}</span>
      <button type="button" onClick={onDown} className="flex h-6 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function DateTimePicker({ value, onChange, min, disabled, className }: DateTimePickerProps) {
  const parsed = parseValue(value)
  const [date,   setDate]   = useState<Date | undefined>(parsed.date)
  const [hour,   setHour]   = useState(parsed.hour)
  const [minute, setMinute] = useState(parsed.minute)
  const [ampm,   setAmpm]   = useState<"AM" | "PM">(parsed.ampm)
  const [open,   setOpen]   = useState(false)

  useEffect(() => {
    const p = parseValue(value)
    setDate(p.date); setHour(p.hour); setMinute(p.minute); setAmpm(p.ampm)
  }, [value])

  function emit(d: Date | undefined, h: string, m: string, ap: "AM" | "PM") {
    const iso = toIso(d, h, m, ap); if (iso) onChange(iso)
  }

  function incrHour(dir: 1 | -1) {
    const h = ((Number(hour) - 1 + dir + 12) % 12) + 1
    const next = String(h).padStart(2, "0"); setHour(next); emit(date, next, minute, ampm)
  }
  function incrMinute(dir: 1 | -1) {
    const m = (Number(minute) + dir + 60) % 60
    const next = String(m).padStart(2, "0"); setMinute(next); emit(date, hour, next, ampm)
  }
  function toggleAmpm() {
    const next: "AM" | "PM" = ampm === "AM" ? "PM" : "AM"; setAmpm(next); emit(date, hour, minute, next)
  }

  const display = date ? `${format(date, "MMM d, yyyy")}  ${hour}:${minute} ${ampm}` : "Pick a date & time…"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          !date && "text-muted-foreground",
          className
        )}
      >
        <span className="flex items-center gap-2">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {display}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <Calendar
            mode="single"
            selected={date}
            onSelect={d => { setDate(d); emit(d, hour, minute, ampm) }}
            disabled={min ? { before: new Date(min) } : undefined}
            initialFocus
          />

          {/* Time picker */}
          <div className="flex flex-col items-center justify-center gap-4 border-l px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Time</p>

            {/* HH : MM */}
            <div className="flex items-center gap-2">
              <SpinButton value={hour}   onUp={() => incrHour(1)}   onDown={() => incrHour(-1)} />
              <span className="mb-0.5 text-xl font-bold text-muted-foreground">:</span>
              <SpinButton value={minute} onUp={() => incrMinute(1)} onDown={() => incrMinute(-1)} />
            </div>

            {/* AM / PM toggle */}
            <div className="flex w-full overflow-hidden rounded-md border text-xs font-semibold">
              <button type="button" onClick={() => { if (ampm !== "AM") toggleAmpm() }}
                className={cn("flex-1 py-1 transition-colors", ampm === "AM" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                AM
              </button>
              <button type="button" onClick={() => { if (ampm !== "PM") toggleAmpm() }}
                className={cn("flex-1 py-1 transition-colors", ampm === "PM" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                PM
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
