"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button }   from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge }    from "@/components/ui/badge"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useMonthlyExecution, useOfi } from "@/hooks/use-ofi"
import { ofiService, type ExecutionEntry } from "@/services/ofi.service"
import {
  Calendar, CalendarCheck, CheckCircle2,
  Info, MapPin, Pencil, Play,
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const MONTH_NAMES  = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]
const currentYear  = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStarted(e: ExecutionEntry)    { return e.actualStatus === "started"   }
function isCompleted(e: ExecutionEntry)  { return e.actualStatus === "completed" || e.isCycleCompleted }
function isNotStarted(e: ExecutionEntry) { return !isStarted(e) && !isCompleted(e) }

function StatusBadge({ entry }: { entry: ExecutionEntry }) {
  if (isCompleted(entry))
    return <Badge className="bg-green-600/15 text-green-600 border-green-600/20 text-[10px] font-semibold">Completed</Badge>
  if (isStarted(entry))
    return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20 text-[10px] font-semibold">Started</Badge>
  return <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">Not Started</Badge>
}

// ─── Chart ────────────────────────────────────────────────────────────────────

type ChartPoint = { month: string; planned: number | null; started: number | null }

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number | null; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      {payload.map(p => p.value !== null && (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ExecutionChart({ data, year }: { data: ChartPoint[]; year: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-5 pt-4 pb-3">
      {/* Header row: title left, legend right */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Monthly Execution Overview — {year}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-full bg-[#3B82F6]" />
            Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-full bg-[#F59E0B]" />
            Started / Executed
          </span>
        </div>
      </div>

      {/* Chart — wrapper class drives all SVG text fills via Tailwind selector */}
      <div
        className="[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:text-[11px]"
        style={{ height: 200 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPlanned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="gradStarted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            />
            <Area
              type="monotone" dataKey="planned" name="Planned"
              stroke="#3B82F6" strokeWidth={2.5}
              fill="url(#gradPlanned)"
              dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
            />
            <Area
              type="monotone" dataKey="started" name="Started / Executed"
              stroke="#F59E0B" strokeWidth={2.5}
              fill="url(#gradStarted)"
              dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  entry,
  canEdit,
  onEdit,
}: {
  entry: ExecutionEntry
  canEdit: boolean
  onEdit: (entry: ExecutionEntry) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 transition-colors hover:bg-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{entry.projectName || entry.obraId}</p>
        <StatusBadge entry={entry} />
      </div>

      {entry.address && (
        <p className="mt-0.5 text-[11px] text-muted-foreground/60">{entry.address}</p>
      )}

      {entry.subcontractor && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {entry.subcontractor}
        </p>
      )}

      {entry.reason && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs italic leading-relaxed text-muted-foreground/80">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {entry.reason}
        </p>
      )}

      {canEdit && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => onEdit(entry)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 transition-colors hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
            {entry.reason ? "Edit note" : "Add note"}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

type ColVariant = "planned" | "started" | "finished"

const COL_CONFIG: Record<ColVariant, { label: string; icon: React.ElementType; color: string }> = {
  planned:  { label: "Planned Projects",  icon: CalendarCheck, color: "#3B82F6" },
  started:  { label: "Started Projects",  icon: Play,          color: "#F59E0B" },
  finished: { label: "Finished Projects", icon: CheckCircle2,  color: "#10B981" },
}

function KanbanColumn({
  variant, entries, totalCaptured, canEdit, onEdit,
}: {
  variant: ColVariant
  entries: ExecutionEntry[]
  totalCaptured?: number
  canEdit: boolean
  onEdit: (entry: ExecutionEntry) => void
}) {
  const { label, icon: Icon, color } = COL_CONFIG[variant]
  const isPlanned = variant === "planned"

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-muted/20">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0" style={{ color }} />
        <span className="flex-1 text-sm font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums">
          {isPlanned ? totalCaptured : entries.length}
        </span>
      </div>

      {isPlanned && (
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-1.5 text-xs text-muted-foreground">
          <span>Remaining</span>
          <span className="font-semibold tabular-nums text-primary">{entries.length}</span>
        </div>
      )}

      <div className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/30">
            <Icon className="h-8 w-8" style={{ color: "currentColor" }} />
            <p className="text-sm">No projects</p>
          </div>
        ) : (
          entries.map(e => (
            <ProjectCard key={e.id} entry={e} canEdit={canEdit} onEdit={onEdit} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Reason Edit Dialog ───────────────────────────────────────────────────────

function ReasonDialog({
  entry, onClose,
}: {
  entry: ExecutionEntry | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState("")

  useEffect(() => { setText(entry?.reason ?? "") }, [entry])

  const mutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      ofiService.updateExecutionReason(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["monthly-execution"] }); onClose() },
  })

  if (!entry) return null

  return (
    <Dialog open={!!entry} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Note — {entry.projectName || entry.obraId}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type your observation here..."
          rows={5}
          className="resize-none text-sm"
          autoFocus
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ id: entry.id, reason: text })}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MonthlyExecutionPage() {
  const year = String(currentYear)
  const [month,     setMonth]     = useState(String(currentMonth))
  const [editEntry, setEditEntry] = useState<ExecutionEntry | null>(null)

  // BOR2 execution history — all months of the year
  const { data: allYear = [], isLoading } = useMonthlyExecution({ year: Number(year) })

  // BOR2 OFI — all months of the year (for the chart)
  const { data: bor2Ofi = [] } = useOfi({ year: Number(year) })

  // BOR2 OFI — selected month only (for the kanban fallback when no execution yet)
  const { data: ofiForMonth = [] } = useOfi({ year: Number(year), month: Number(month) })

  // ── Chart: purely BOR2 data ───────────────────────────────────────────────

  const chartData = useMemo<ChartPoint[]>(() =>
    MONTH_LABELS.map((label, i) => {
      const m   = i + 1
      const ofi = bor2Ofi.filter(e => e.referenceMonth === m)
      const exe = allYear.filter(e => e.referenceMonth === m)
      const started = exe.length ? (exe.filter(e => !isNotStarted(e)).length || null) : null
      // January 2026: no real execution records exist in any DB — hardcoded from BOR1 legacy
      const startedFinal = (m === 1 && started === null) ? 10 : started
      // Use execution history count when available (matches kanban total);
      // fall back to OFI count for months with no execution records yet.
      const plannedCount = exe.length ? exe.length : (ofi.length || null)
      return {
        month:   label,
        planned: plannedCount,
        started: startedFinal,
      }
    }),
    [allYear, bor2Ofi],
  )

  // ── Kanban: selected month ─────────────────────────────────────────────────
  // Execution history → use real statuses.
  // No execution yet → show OFI obras as Planned (no editing).

  const { forMonth, isOFIFallback } = useMemo(() => {
    const execRecords = allYear.filter(e => e.referenceMonth === Number(month))
    if (execRecords.length > 0) return { forMonth: execRecords, isOFIFallback: false }

    const ofiRecords: ExecutionEntry[] = ofiForMonth.map(o => ({
      id:               o.id,
      obraId:           o.obraId,
      referenceMonth:   o.referenceMonth,
      referenceYear:    o.referenceYear,
      plannedStatus:    "not_started",
      actualStatus:     "not_started" as const,
      reason:           "",
      subcontractor:    "",
      isCycleCompleted: false,
      projectName:      o.projectName,
      address:          o.address,
    }))
    return { forMonth: ofiRecords, isOFIFallback: true }
  }, [allYear, ofiForMonth, month])

  const planned  = useMemo(() => forMonth.filter(isNotStarted),  [forMonth])
  const started  = useMemo(() => forMonth.filter(isStarted),     [forMonth])
  const finished = useMemo(() => forMonth.filter(isCompleted),   [forMonth])

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Monthly Execution</h1>
          <p className="text-sm text-muted-foreground">Track project execution progress by month</p>
        </div>

        {/* Period filter — standardized pill */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Period
          </span>
          <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
            <div className="flex items-center gap-1.5 pl-2.5 pr-2">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{year}</span>
            </div>
            <div className="h-5 w-px shrink-0 bg-border" />
            <Select value={month} onValueChange={v => v && setMonth(v)}>
              <SelectTrigger className="h-8 w-[140px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                <span className="flex-1 truncate text-left text-sm">{MONTH_NAMES[Number(month) - 1]}</span>
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Yearly chart */}
      <ExecutionChart data={chartData} year={year} />

      {/* Kanban — fills remaining viewport height, scroll inside each column */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-3">
        <KanbanColumn
          variant="planned"
          entries={planned}
          totalCaptured={forMonth.length}
          canEdit={!isOFIFallback}
          onEdit={setEditEntry}
        />
        <KanbanColumn variant="started"  entries={started}  canEdit={false} onEdit={setEditEntry} />
        <KanbanColumn variant="finished" entries={finished} canEdit={false} onEdit={setEditEntry} />
      </div>

      <ReasonDialog entry={editEntry} onClose={() => setEditEntry(null)} />
    </div>
  )
}
