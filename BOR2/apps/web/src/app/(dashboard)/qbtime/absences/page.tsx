"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
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
  // punches, so it needs its own entry or those people are never checked.
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

function DayDot({ day, prev, next, weekend }: {
  day:     AttendanceDay
  prev?:   AttendanceDay
  next?:   AttendanceDay
  weekend: boolean
}) {
  const alerting  = day.status === "absent" && day.streak >= ALERT_STREAK
  // A run is only worth drawing when the neighbour belongs to the same one.
  const joinLeft  = alerting && prev?.status === "absent"
  const joinRight = day.status === "absent" && next?.status === "absent" &&
                    (next?.streak ?? 0) >= ALERT_STREAK

  const label =
    day.status === "off" ? `${fmtShort(day.date)} · weekend, didn't work`
    : day.status === "pending" ? `${fmtShort(day.date)} · hasn't happened yet`
    : day.status === "skipped" ? `${fmtShort(day.date)} · not evaluated (no company-wide activity)`
    : day.status === "present" ? `${fmtShort(day.date)}${weekend ? " · worked the weekend" : " · present"}`
    : `${fmtShort(day.date)} · absent — day ${day.streak} of the run`

  return (
    <div
      className={cn(
        "relative flex h-5 items-center justify-center",
        weekend && "bg-muted/40",
      )}
      title={label}
    >
      {joinLeft  && <span className="absolute left-0  h-0.5 w-1/2 bg-destructive/30" />}
      {joinRight && <span className="absolute right-0 h-0.5 w-1/2 bg-destructive/30" />}

      <span
        className={cn(
          "relative z-10 block rounded-full",
          alerting ? "h-3 w-3 bg-destructive ring-2 ring-destructive/25" : "h-2.5 w-2.5",
          day.status === "present" && (weekend ? "bg-sky-500/80" : "bg-emerald-500/80"),
          day.status === "absent" && !alerting && "bg-amber-500",
          day.status === "skipped" && "border border-dashed border-muted-foreground/40",
          day.status === "pending" && "border border-muted-foreground/25",
          // Weekend off is not a state worth reading — barely there on purpose.
          day.status === "off" && "h-1 w-1 bg-muted-foreground/20",
        )}
      />
    </div>
  )
}

// ─── One team block ───────────────────────────────────────────────────────────

function TeamBlock({
  team, employees, days,
}: {
  team:      string
  employees: AttendanceEmployee[]
  days:      { date: string; weekday: string; evaluated: boolean; weekend: boolean }[]
}) {
  const cols = `minmax(0,1fr) repeat(${days.length}, 1.25rem)`

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">

      <div className="border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {team}
        </p>
      </div>

      <div
        className="grid items-center gap-1 border-b border-border/40 px-2.5 py-1"
        style={{ gridTemplateColumns: cols }}
      >
        <span />
        {days.map(d => (
          <span
            key={d.date}
            className={cn(
              "text-center text-[9px] font-semibold uppercase leading-none",
              d.weekend ? "text-muted-foreground/25"
                : d.evaluated ? "text-muted-foreground/70" : "text-muted-foreground/30",
            )}
          >
            {d.weekday.slice(0, 1)}
          </span>
        ))}
      </div>

      <div>
        {employees.map(e => (
          <div
            key={e.qbtUserId}
            className={cn(
              "grid items-center gap-1 px-2.5 py-0.5",
              e.maxStreak >= ALERT_STREAK && "bg-destructive/5",
            )}
            style={{ gridTemplateColumns: cols }}
          >
            <span className="truncate text-xs" title={e.name}>{e.name}</span>
            {e.days.map((d, i) => (
              <DayDot
                key={d.date}
                day={d}
                prev={e.days[i - 1]}
                next={e.days[i + 1]}
                weekend={days[i]?.weekend ?? false}
              />
            ))}
          </div>
        ))}
      </div>
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
  const active = COMPANIES.find(c => c.value === company)

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Filters / Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

        <div>
          <h1 className="text-xl font-semibold tracking-tight">Absence Control</h1>
          <p className="text-sm text-muted-foreground">Weekly attendance per team</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Company
            </span>
            <Select value={company} onValueChange={v => v && setCompany(v)}>
              <SelectTrigger className="h-8 w-[13rem] gap-2">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 items-center gap-2">
                  {active && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={active.logo} className="h-3.5 w-auto object-contain" />
                  )}
                  <span className="truncate text-xs">{active?.label}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {COMPANIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" src={c.logo} className="h-3.5 w-auto object-contain" />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Week
            </span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <button
                onClick={() => setWeek(w => shiftWeek(w, -1))}
                title="Previous week"
                className="flex h-full w-7 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="flex items-center gap-1.5 px-1 text-xs tabular-nums">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-[7.5rem] text-center">
                  {data ? `${fmtShort(data.weekStart)} – ${fmtShort(data.weekEnd)}` : "—"}
                </span>
              </span>
              <button
                onClick={() => setWeek(w => shiftWeek(w, 1))}
                disabled={isCurrentWeek}
                title="Next week"
                className="flex h-full w-7 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Body ── */}
      {/* gap-0/py-0 override the Card defaults: header, rule, body — nothing
          floating between them. The body carries its own padding instead. */}
      <Card className="flex min-h-0 flex-1 flex-col gap-0 py-0">

        <CardHeader className="border-b pt-4">
          <CardTitle className="flex items-center gap-3">
            Attendance
            {data && (
              <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{data.rosterSize}</span>
                </span>
                <span className="tabular-nums">{data.totalAbsent} missed a day</span>
                <span className="tabular-nums text-destructive">
                  {data.totalFlagged} hit {ALERT_STREAK}+ in a row
                </span>
              </span>
            )}
          </CardTitle>

          <CardAction>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" /> Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Absent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-destructive" /> {ALERT_STREAK}+ in a row
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/40" /> Not evaluated
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/25" /> Pending
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500/80" /> Worked weekend
              </span>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-y-auto py-4">

          {isLoading && (
            <div className="flex h-full min-h-48 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin opacity-60" />
              <p className="text-sm">Loading week…</p>
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(error as Error)?.message ?? "Failed to load attendance."}
            </div>
          )}

          {data && !isLoading && data.teams.length === 0 && (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Users className="h-7 w-7 opacity-30" />
              <p className="text-sm">No roster synced for this company yet.</p>
            </div>
          )}

          {data && !isLoading && data.teams.length > 0 && (
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.teams.map(t => (
                <TeamBlock key={t.team} team={t.team} employees={t.employees} days={data.days} />
              ))}
            </div>
          )}

        </CardContent>
      </Card>

    </div>
  )
}
