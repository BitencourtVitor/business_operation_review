"use client"

import { Button } from "@/components/ui/button"
import { useAtlasDailyLogs, useAtlasEvents } from "@/hooks/use-atlas"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/**
 * Calendário da obra (AT-17): o diário e os eventos no mesmo mês.
 *
 * O diário sozinho é uma lista que cresce e some; posto no calendário ele
 * responde a pergunta que a obra faz de verdade — "o que aconteceu naquela
 * semana?" — e mostra o buraco dos dias em que ninguém registrou nada.
 */
export function CalendarPanel({ jobsiteId }: { jobsiteId: string }) {
  const { data: logs } = useAtlasDailyLogs(jobsiteId)
  const { data: events } = useAtlasEvents(jobsiteId)
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)

  const byDay = useMemo(() => {
    const map = new Map<string, { logs: number; events: number; summary: string }>()
    for (const l of logs ?? []) {
      const entry = map.get(l.logDate) ?? { logs: 0, events: 0, summary: "" }
      entry.logs += 1
      entry.summary = entry.summary || l.summary
      map.set(l.logDate, entry)
    }
    for (const e of events ?? []) {
      const day = e.createdAt.slice(0, 10)
      const entry = map.get(day) ?? { logs: 0, events: 0, summary: "" }
      entry.events += 1
      map.set(day, entry)
    }
    return map
  }, [logs, events])

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      return date
    })
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const today = isoDay(new Date())

  const selectedLogs = (logs ?? []).filter(l => l.logDate === selected)
  const selectedEvents = (events ?? []).filter(e => e.createdAt.slice(0, 10) === selected)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium capitalize">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <Button
            size="icon" variant="ghost"
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Today</Button>
          <Button
            size="icon" variant="ghost"
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60">
        {WEEKDAYS.map(d => (
          <div key={d} className="bg-card px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {grid.map(date => {
          const day = isoDay(date)
          const entry = byDay.get(day)
          const otherMonth = date.getMonth() !== cursor.getMonth()
          return (
            <button
              key={day}
              onClick={() => setSelected(day === selected ? null : day)}
              className={`flex min-h-16 flex-col gap-1 bg-card p-1.5 text-left transition-colors hover:bg-accent/40 ${
                otherMonth ? "opacity-40" : ""
              } ${selected === day ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <span className={`text-[11px] ${day === today ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {date.getDate()}
              </span>
              {entry?.logs ? (
                <span className="truncate rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  {entry.logs} {entry.logs === 1 ? "log" : "logs"}
                </span>
              ) : null}
              {entry?.events ? (
                <span className="truncate rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                  {entry.events} {entry.events === 1 ? "event" : "events"}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-4">
          <p className="text-sm font-medium">
            {new Date(`${selected}T12:00:00`).toLocaleDateString()}
          </p>
          {selectedLogs.length === 0 && selectedEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing recorded on this day.</p>
          )}
          {selectedLogs.map(l => (
            <div key={l.id} className="rounded-md bg-muted/40 p-2.5">
              <p className="text-xs text-muted-foreground">
                {[l.weather, l.temperature != null ? `${l.temperature}°F` : null,
                  l.crewSize != null ? `crew ${l.crewSize}` : null].filter(Boolean).join(" · ")}
              </p>
              {l.summary && <p className="mt-1 whitespace-pre-wrap text-sm">{l.summary}</p>}
            </div>
          ))}
          {selectedEvents.map(e => (
            <div key={e.id} className="rounded-md border border-border/60 p-2.5">
              <p className="text-sm">{e.title || e.body}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{e.kind} · {e.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
