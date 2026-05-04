"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
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
import { useMonthlyExecution } from "@/hooks/use-ofi"
import { useOfi }              from "@/hooks/use-ofi"
import { ofiService, type ExecutionEntry } from "@/services/ofi.service"
import {
  CalendarCheck, CheckCircle2, ChevronDown, ChevronRight,
  Info, MapPin, Pencil, Play,
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const MONTHS       = MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label }))
const currentYear  = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const YEARS        = Array.from({ length: 3 }, (_, i) => String(currentYear - i))

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

// ─── BOR1 stats type ──────────────────────────────────────────────────────────

interface Bor1Stats { planned: number[]; started: number[] }

function useBor1Stats(year: string) {
  const [data, setData]     = useState<Bor1Stats | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/bor1/monthly-execution-stats?year=${year}`)
      .then(r => r.json())
      .then((d: Bor1Stats) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  return { data, loading }
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
    <div className="rounded-xl border border-border bg-card px-5 pt-4 pb-3">
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
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
            <Line
              type="monotone" dataKey="planned" name="Planned"
              stroke="#3B82F6" strokeWidth={2.5}
              dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
            />
            <Line
              type="monotone" dataKey="started" name="Started / Executed"
              stroke="#F59E0B" strokeWidth={2.5}
              dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
            />
          </LineChart>
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

      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{entry.obraId}</p>

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
  const [expanded, setExpanded] = useState(true)
  const { label, icon: Icon, color } = COL_CONFIG[variant]
  const isPlanned = variant === "planned"

  return (
    <div className="flex flex-col rounded-xl border border-border bg-muted/20">
      <button
        className="flex items-center gap-2 rounded-t-xl px-4 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
        <Icon className="h-4 w-4 shrink-0" style={{ color }} />
        <span className="flex-1 text-sm font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums">
          {isPlanned ? totalCaptured : entries.length}
        </span>
      </button>

      {isPlanned && expanded && (
        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-1.5 text-xs text-muted-foreground">
          <span>Remaining</span>
          <span className="font-semibold tabular-nums text-primary">{entries.length}</span>
        </div>
      )}

      {expanded && (
        <div className="no-scrollbar flex flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: "60vh" }}>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground/50">No projects</p>
          ) : (
            entries.map(e => (
              <ProjectCard key={e.id} entry={e} canEdit={canEdit} onEdit={onEdit} />
            ))
          )}
        </div>
      )}
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
  const [year,      setYear]      = useState(String(currentYear))
  const [month,     setMonth]     = useState(String(currentMonth))
  const [editEntry, setEditEntry] = useState<ExecutionEntry | null>(null)

  // BOR2 data — execution history for the selected year
  const { data: allYear = [], isLoading } = useMonthlyExecution({ year: Number(year) })

  // BOR2 OFI — planned counts (includes future months not yet in execution history)
  const { data: bor2Ofi = [] } = useOfi({ year: Number(year) })

  // BOR1 historical stats — monthly aggregates from Supabase
  const { data: bor1Stats } = useBor1Stats(year)

  // ── Chart data: merge BOR1 (historical) + BOR2 (latest cycle) ──────────────
  //
  // BOR2 calculator first ran on 2026-04-30, so BOR2 has execution data for
  // April 2026 onwards and OFI data from May 2026.
  // For months not yet covered by BOR2, fall back to BOR1 Supabase.

  const bor2ExecMonths = useMemo(
    () => new Set(allYear.map(e => e.referenceMonth)),
    [allYear],
  )
  const bor2OfiMonths = useMemo(
    () => new Set(bor2Ofi.map(e => e.referenceMonth)),
    [bor2Ofi],
  )

  const chartData = useMemo<ChartPoint[]>(() =>
    MONTH_LABELS.map((label, i) => {
      const m      = i + 1
      const hasBor2 = bor2ExecMonths.has(m) || bor2OfiMonths.has(m)

      if (hasBor2) {
        const execEntries = allYear.filter(e => e.referenceMonth === m)
        const ofiEntries  = bor2Ofi.filter(e => e.referenceMonth === m)
        // Planned = OFI count (what was captured at snapshot time)
        // Started = execution records with non-not-started status
        const planned = ofiEntries.length  || null
        const started = execEntries.filter(e => !isNotStarted(e)).length || null
        return { month: label, planned, started }
      }

      // BOR1 fallback
      const p = bor1Stats?.planned[i] ?? 0
      const s = bor1Stats?.started[i] ?? 0
      return { month: label, planned: p || null, started: s || null }
    }),
    [allYear, bor2Ofi, bor1Stats, bor2ExecMonths, bor2OfiMonths],
  )

  // ── Kanban: current selected month (always BOR2 data) ─────────────────────

  const forMonth = useMemo(
    () => allYear.filter(e => e.referenceMonth === Number(month)),
    [allYear, month],
  )

  const planned  = useMemo(() => forMonth.filter(isNotStarted),  [forMonth])
  const started  = useMemo(() => forMonth.filter(isStarted),     [forMonth])
  const finished = useMemo(() => forMonth.filter(isCompleted),   [forMonth])

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Monthly Execution</h1>
          <p className="text-sm text-muted-foreground">Track project execution progress by month</p>
        </div>
        <div className="flex gap-2">
          <Select value={year} onValueChange={v => v && setYear(v)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={v => v && setMonth(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Yearly chart */}
      <ExecutionChart data={chartData} year={year} />

      {/* Kanban */}
      <div className="grid gap-4 md:grid-cols-3">
        <KanbanColumn
          variant="planned"
          entries={planned}
          totalCaptured={forMonth.length}
          canEdit
          onEdit={setEditEntry}
        />
        <KanbanColumn variant="started"  entries={started}  canEdit={false} onEdit={setEditEntry} />
        <KanbanColumn variant="finished" entries={finished} canEdit={false} onEdit={setEditEntry} />
      </div>

      <ReasonDialog entry={editEntry} onClose={() => setEditEntry(null)} />
    </div>
  )
}
