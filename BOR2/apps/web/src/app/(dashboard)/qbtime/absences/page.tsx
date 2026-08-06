"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAttendance } from "@/hooks/use-qbtime-absences"
import type {
  AttendanceDay,
  AttendanceEmployee,
} from "@/services/qbtime-absence.service"

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
  { value: "pcg",     label: "PCG",     logo: "/images/icon_pcg.png"        },
  // Separate QB Time workspace holding the Framing crew — its own roster and
  // punches, so it needs its own tab or those people are never checked.
  { value: "hvacing", label: "Framing (HVAC acct)", logo: "/images/sublogo_framing.png" },
]

const ALERT_STREAK = 2

function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fmtShort(iso: string) {
  return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function mondayOf(d: Date) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7))
  return copy
}

function shiftWeek(iso: string, weeks: number) {
  const d = parseISO(iso)
  d.setDate(d.getDate() + weeks * 7)
  return toISO(d)
}

// ─── One day cell ─────────────────────────────────────────────────────────────

function DayDot({ day, prev, next }: {
  day:  AttendanceDay
  prev?: AttendanceDay
  next?: AttendanceDay
}) {
  const alerting  = day.status === "absent" && day.streak >= ALERT_STREAK
  // A run is only worth drawing when the neighbour is part of the same one.
  const joinLeft  = alerting && prev?.status === "absent"
  const joinRight = day.status === "absent" && next?.status === "absent" &&
                    (next?.streak ?? 0) >= ALERT_STREAK

  const label =
    day.status === "skipped"
      ? `${fmtShort(day.date)} · not evaluated (no company-wide activity)`
      : day.status === "present"
        ? `${fmtShort(day.date)} · present`
        : `${fmtShort(day.date)} · absent — day ${day.streak} of the run`

  return (
    <div className="relative flex h-8 items-center justify-center" title={label}>
      {/* Connector bar tying a 2+ day run together */}
      {joinLeft  && <span className="absolute left-0  h-1 w-1/2 bg-destructive/25" />}
      {joinRight && <span className="absolute right-0 h-1 w-1/2 bg-destructive/25" />}

      <span
        className={cn(
          "relative z-10 flex h-4 w-4 items-center justify-center rounded-full transition-transform",
          day.status === "present" && "bg-emerald-500/80",
          day.status === "skipped" && "border border-dashed border-muted-foreground/40 bg-transparent",
          day.status === "absent" && !alerting && "bg-amber-500",
          alerting && "bg-destructive ring-2 ring-destructive/30 scale-110",
        )}
      >
        {alerting && (
          <span className="text-[9px] font-bold leading-none text-destructive-foreground">
            {day.streak}
          </span>
        )}
      </span>
    </div>
  )
}

// ─── One employee row ─────────────────────────────────────────────────────────

function EmployeeRow({ e }: { e: AttendanceEmployee }) {
  const flagged = e.maxStreak >= ALERT_STREAK
  return (
    <div
      className={cn(
        "grid items-center gap-2 border-b border-border/40 px-3 py-1 last:border-b-0",
        flagged && "bg-destructive/5",
      )}
      style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${e.days.length}, 2rem)` }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm">{e.name}</span>
        {flagged && (
          <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            {e.maxStreak}d
          </span>
        )}
      </div>

      {e.days.map((d, i) => (
        <DayDot key={d.date} day={d} prev={e.days[i - 1]} next={e.days[i + 1]} />
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AbsencesPage() {
  return <Suspense><AbsencesContent /></Suspense>
}

function AbsencesContent() {
  const searchParams = useSearchParams()
  const [company, setCompany] = useState("framing")
  const [week, setWeek] = useState(() => toISO(mondayOf(new Date())))

  // The notification links straight to a company — honour it on first paint.
  useEffect(() => {
    const q = searchParams.get("company")
    if (q && COMPANIES.some(c => c.value === q)) setCompany(q)
  }, [searchParams])

  const { data, isLoading, isError, error } = useAttendance(company, week)

  const isCurrentWeek = week === toISO(mondayOf(new Date()))
  const dayCount = data?.days.length ?? 5

  return (
    <div className="flex flex-col gap-5">

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Absence Control</h1>
        <p className="text-sm text-muted-foreground">
          Weekly attendance per team — every employee on the QuickBooks Time roster
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

      {/* Week navigation + legend */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeek(w => shiftWeek(w, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium">
            {data ? `${fmtShort(data.weekStart)} – ${fmtShort(data.weekEnd)}` : "—"}
          </span>
          <button
            onClick={() => setWeek(w => shiftWeek(w, 1))}
            disabled={isCurrentWeek}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeek(toISO(mondayOf(new Date())))}
              className="ml-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              This week
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-500" /> Absent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-destructive" /> {ALERT_STREAK}+ in a row
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-dashed border-muted-foreground/40" /> Not evaluated
          </span>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{data.rosterSize}</span>
            <span className="text-muted-foreground">on roster</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums">{data.totalAbsent}</span>
            <span className="text-muted-foreground"> missed a day</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums text-destructive">{data.totalFlagged}</span>
            <span className="text-muted-foreground"> hit {ALERT_STREAK}+ in a row</span>
          </span>
        </div>
      )}

      {isLoading && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin opacity-60" />
          <p className="text-sm">Loading week…</p>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Failed to load attendance."}
        </div>
      )}

      {data && !isLoading && data.teams.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
          <Users className="h-8 w-8 opacity-30" />
          <p className="text-sm">No roster synced for this company yet.</p>
        </div>
      )}

      {data && !isLoading && data.teams.map(team => (
        <div key={team.team} className="overflow-hidden rounded-xl border border-border">

          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {team.team}
            </p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {team.employees.length}
            </span>
          </div>

          {/* Day header */}
          <div
            className="grid items-center gap-2 border-b border-border/60 px-3 py-1.5"
            style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${dayCount}, 2rem)` }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Employee
            </span>
            {data.days.map(d => (
              <div key={d.date} className="flex flex-col items-center leading-tight">
                <span className={cn(
                  "text-[10px] font-semibold uppercase",
                  d.evaluated ? "text-muted-foreground" : "text-muted-foreground/40",
                )}>
                  {d.weekday}
                </span>
                <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                  {parseISO(d.date).getDate()}
                </span>
              </div>
            ))}
          </div>

          <div>
            {team.employees.map(e => <EmployeeRow key={e.qbtUserId} e={e} />)}
          </div>
        </div>
      ))}

    </div>
  )
}
