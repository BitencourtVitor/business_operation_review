"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarX, Loader2, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAbsences } from "@/hooks/use-qbtime-absences"
import type { AbsenceEvent } from "@/services/qbtime-absence.service"

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
  { value: "pcg",     label: "PCG",     logo: "/images/icon_pcg.png"        },
  // Separate QB Time workspace holding the Framing crew — its own roster and
  // punches, so it needs its own tab or those people are never checked.
  { value: "hvacing", label: "Framing (HVAC acct)", logo: "/images/sublogo_framing.png" },
]

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function fmtRange(e: AbsenceEvent) {
  return e.startDate === e.endDate
    ? fmtDate(e.startDate)
    : `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}`
}

function EventRow({ e }: { e: AbsenceEvent }) {
  const severe = e.daysCount >= 3
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-b-0">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          e.open ? (severe ? "bg-destructive" : "bg-amber-500") : "bg-muted-foreground/30",
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.employeeName}</p>
        <p className="text-xs text-muted-foreground">{fmtRange(e)}</p>
      </div>

      {e.open && (
        <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          Ongoing
        </span>
      )}

      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          severe ? "text-destructive" : "text-foreground",
        )}
      >
        {e.daysCount}d
      </span>
    </div>
  )
}

export default function AbsencesPage() {
  return <Suspense><AbsencesContent /></Suspense>
}

function AbsencesContent() {
  const searchParams = useSearchParams()
  const [company, setCompany] = useState("framing")

  // The notification links straight to a company — honour it on first paint.
  useEffect(() => {
    const q = searchParams.get("company")
    if (q && COMPANIES.some(c => c.value === q)) setCompany(q)
  }, [searchParams])

  const { data, isLoading, isError, error } = useAbsences(company)

  const evaluated = data?.evaluatedDays ?? []
  const lastDay   = evaluated.length > 0 ? evaluated[evaluated.length - 1] : null

  return (
    <div className="flex flex-col gap-6">

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Absence Control</h1>
        <p className="text-sm text-muted-foreground">
          Employees on the roster with no QuickBooks Time punch, grouped by team
        </p>
      </div>

      {/* Company tabs */}
      <div className="flex flex-wrap gap-2">
        {COMPANIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCompany(c.value)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-lg border px-3 transition-colors",
              company === c.value
                ? "border-border bg-accent text-accent-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={c.label} src={c.logo} className="h-4 w-auto object-contain" />
            <span className="text-xs font-medium">{c.label}</span>
          </button>
        ))}
      </div>

      {/* Summary */}
      {data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="font-semibold tabular-nums">{data.totalOpen}</span>
            <span className="text-muted-foreground"> ongoing</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums">{data.totalEvents}</span>
            <span className="text-muted-foreground"> total in window</span>
          </span>
          {lastDay && (
            <span className="text-xs text-muted-foreground">
              Last day checked: {fmtDate(lastDay)} · {evaluated.length} business days evaluated
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin opacity-60" />
          <p className="text-sm">Loading absences…</p>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Failed to load absences."}
        </div>
      )}

      {data && !isLoading && data.groups.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
          <UserX className="h-8 w-8 opacity-30" />
          <p className="text-sm">
            {evaluated.length === 0
              ? "No synced work days in the window yet."
              : "Nobody missed a day in this window."}
          </p>
        </div>
      )}

      {data && !isLoading && data.groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.groups.map(g => (
            <div key={g.team} className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {g.team}
                </p>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarX className="h-3.5 w-3.5" />
                  {g.events.length}
                </span>
              </div>
              <div>
                {g.events.map(e => <EventRow key={e.id} e={e} />)}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
