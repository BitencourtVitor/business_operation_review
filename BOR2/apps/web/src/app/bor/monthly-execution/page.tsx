"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button }   from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useMonthlyExecution, useOfi } from "@/hooks/use-ofi"
import { usePermission } from "@/hooks/use-permission"
import { usePayPeriods } from "@/hooks/use-qbtime-period-report"
import { ofiService, type ExecutionEntry } from "@/services/ofi.service"
import { monthlyExecutionService } from "@/services/monthly-execution.service"
import {
  Building2, Calendar, CalendarCheck, CheckCircle2, ChevronDown, CircleCheck, CircleDot,
  Info, MapPin, MessageSquareText, Pencil, Play, Settings2, Users,
} from "lucide-react"
import {
  MONTH_LABELS, MONTH_NAMES, buildSeries, clientsOf, isStarted, monthOf, pointVisible,
  siteIndex, siteKey, standings, visibleGroups, monthsScope, fortnightScope, type ChartPoint, type Filters,
} from "./_lib/series"
import { SettingsDialog } from "./_components/settings-dialog"
import { PointsDialog } from "./_components/points-dialog"

const today        = new Date()
const currentYear  = today.getFullYear()
const currentMonth = today.getMonth() + 1
const YTD          = "ytd"

/** "Sep 20 to Oct 3": a quinzena sem o ano, que já está ao lado no filtro. */
const fortnightLabel = (p: { startDate: string; endDate: string }) => {
  const day = (iso: string) => `${MONTH_LABELS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
  return `${day(p.startDate)} to ${day(p.endDate)}`
}

// Meta em cinza médio: some contra fundo nenhum, claro ou escuro.
const COLORS = { planned: "#3B82F6", started: "#F59E0B", finished: "#10B981", goal: "#8A8A8A" }
const GOAL_DASH = "5 4"

// ─── Chart ────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number | null; color: string; dataKey: string; payload: ChartPoint }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const lines = payload.filter(p => p.value !== null && p.dataKey !== "pending")
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      {lines.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-4 font-semibold tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
      {row.goal !== null && row.finished !== null && row.goal > 0 && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
          Goal reached: <span className={`font-semibold ${row.finished >= row.goal ? "text-emerald-600" : "text-red-600"}`}>
            {Math.round((row.finished / row.goal) * 100)}%
          </span>
        </p>
      )}
      {(row.pending > 0 || row.resolved > 0) && (
        <p className="mt-1 text-muted-foreground">{row.pending} pending · {row.resolved} resolved points</p>
      )}
    </div>
  )
}

/** Fundo do mês inteiro no hover, em vez de só a linha fina do cursor. */
function HoverBand(props: { points?: { x: number }[]; top?: number; left?: number; width?: number; height?: number }) {
  const { points, top = 0, left = 0, width = 0, height = 0 } = props
  if (!points?.length) return null
  const band = width / 12
  const x = Math.min(Math.max(points[0].x - band / 2, left), left + width - band)
  return <rect x={x} y={top} width={band} height={height} fill="var(--muted)" opacity={0.6} pointerEvents="none" />
}

/** Indicador dos pontos do mês, em cima do gráfico: âmbar pendente, verde resolvido. */
function PointsTick(props: { x?: number | string; y?: number | string; payload?: { value: string }; data: ChartPoint[]; onOpen: (m: number) => void }) {
  const { payload, data, onOpen } = props
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const i = MONTH_LABELS.indexOf(payload?.value ?? "")
  const row = data[i]
  if (!row || (!row.pending && !row.resolved)) return null
  return (
    <foreignObject x={x - 30} y={y - 20} width={60} height={20}>
      <button onClick={() => onOpen(i + 1)} className="flex w-full items-center justify-center gap-1.5 text-[10px] font-semibold tabular-nums">
        {row.pending > 0 && <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><CircleDot className="h-3 w-3" />{row.pending}</span>}
        {row.resolved > 0 && <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3 w-3" />{row.resolved}</span>}
      </button>
    </foreignObject>
  )
}

function ExecutionChart({ data, year, month, onPickMonth, onOpenPoints }: {
  data: ChartPoint[]; year: number; month: number | null
  onPickMonth: (m: number) => void; onOpenPoints: (m: number) => void
}) {
  const legend = [
    { label: "Planned", color: COLORS.planned },
    { label: "Started", color: COLORS.started },
    { label: "Finished", color: COLORS.finished },
    { label: "Goal", color: COLORS.goal, dashed: true },
  ]
  return (
    <div className="rounded-xl border border-border bg-card/60 px-5 pt-4 pb-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">Monthly Execution Overview · {year}</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {legend.map(l => (
            <span key={l.label} className="flex items-center gap-1.5">
              {l.dashed ? (
                <svg width="16" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="16" y2="4" stroke={l.color} strokeWidth={2} strokeDasharray={GOAL_DASH} />
                </svg>
              ) : (
                <span className="inline-block h-2 w-4 rounded-full" style={{ background: l.color }} />
              )}
              {l.label}
            </span>
          ))}
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onOpenPoints(month ?? currentMonth)}>
            <MessageSquareText className="h-3.5 w-3.5" />
            Points · {MONTH_LABELS[(month ?? currentMonth) - 1]}
          </Button>
        </div>
      </div>

      <div
        className="[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-surface]:cursor-pointer"
        style={{ height: 230 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            onClick={(state: { activeLabel?: string | number }) => {
              const i = MONTH_LABELS.indexOf(String(state?.activeLabel ?? ""))
              if (i >= 0) onPickMonth(i + 1)
            }}
          >
            <defs>
              <linearGradient id="gradPlanned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLORS.planned} stopOpacity={0.25} />
                <stop offset="95%" stopColor={COLORS.planned} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradStarted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLORS.started} stopOpacity={0.25} />
                <stop offset="95%" stopColor={COLORS.started} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <XAxis
              dataKey="month" xAxisId="points" orientation="top" axisLine={false} tickLine={false} height={22}
              tick={props => <PointsTick {...props} data={data} onOpen={onOpenPoints} />}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <RechartsTooltip content={<ChartTooltip />} cursor={<HoverBand />} />
            <Area type="monotone" dataKey="planned" name="Planned" stroke={COLORS.planned} strokeWidth={2.5}
              fill="url(#gradPlanned)" dot={{ r: 3, fill: COLORS.planned, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
            <Area type="monotone" dataKey="started" name="Started" stroke={COLORS.started} strokeWidth={2.5}
              fill="url(#gradStarted)" dot={{ r: 3, fill: COLORS.started, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
            <Line type="monotone" dataKey="finished" name="Finished" stroke={COLORS.finished} strokeWidth={2.5}
              dot={{ r: 3, fill: COLORS.finished, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
            <Line type="stepAfter" dataKey="goal" name="Goal" stroke={COLORS.goal} strokeWidth={2} strokeDasharray={GOAL_DASH}
              dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Goal panel ───────────────────────────────────────────────────────────────

const fmtDay = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

/**
 * Painel da meta. Cresce com o conteúdo até a altura da tela e rola por dentro;
 * clicar numa linha mostra as casas terminadas no período, várias abertas juntas.
 */
function GoalPanel({ rows, label }: { rows: ReturnType<typeof standings>; label: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(s => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const goal = rows.reduce((s, r) => s + r.goal, 0)
  const done = rows.reduce((s, r) => s + r.finished, 0)
  return (
    <div className="flex flex-col rounded-xl max-lg:order-2 lg:max-h-full lg:min-h-0 lg:self-start border border-border bg-card/60">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Goal · {label}</p>
        <p className="text-xs text-muted-foreground">
          {done} of {goal} houses finished{goal > 0 && ` · ${Math.round((done / goal) * 100)}%`}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No job sites in the settings.</p>}
        {rows.map(r => {
          const met = r.finished >= r.goal
          const pct = r.goal ? Math.min(100, Math.round((r.finished / r.goal) * 100)) : 100
          const isOpen = open.has(r.group.id)
          return (
            <div key={r.group.id}
              className="flex min-h-[52px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
              <button type="button" aria-expanded={isOpen} onClick={() => toggle(r.group.id)}
                className="flex flex-col justify-center px-3 py-2 text-left">
                <div className="flex w-full items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{r.group.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={`font-semibold tabular-nums ${met ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {r.finished} / {r.goal}
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${met ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
              {/* A linha da grade vai de 0 à altura do conteúdo: é o que faz deslizar. */}
              <div inert={!isOpen}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="border-t border-border px-3 py-2">
                    {r.projects.length === 0
                      ? <p className="text-xs text-muted-foreground">No houses finished in this period.</p>
                      : r.projects.map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                            <span className="truncate">
                              {r.group.sites.length > 1 && `${p.jobSite.replace(/,.*$/, "")} · `}Lot {p.projectName.slice(p.jobSite.length + 3) || p.projectName}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{fmtDay(p.finishedOn)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ entry, canEdit, onEdit }: {
  entry: ExecutionEntry
  canEdit: boolean
  onEdit: (entry: ExecutionEntry) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 transition-colors hover:bg-card">
      <p className="text-sm font-medium leading-snug">{entry.projectName || entry.obraId}</p>

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
  planned:  { label: "Planned Projects",  icon: CalendarCheck, color: COLORS.planned },
  started:  { label: "Started Projects",  icon: Play,          color: COLORS.started },
  finished: { label: "Finished Projects", icon: CheckCircle2,  color: COLORS.finished },
}

function KanbanColumn({ variant, month, entries, totalCaptured, canEdit, onEdit, empty = "No projects" }: {
  variant: ColVariant
  month: string
  entries: ExecutionEntry[]
  totalCaptured?: number
  empty?: string
  canEdit: boolean
  onEdit: (entry: ExecutionEntry) => void
}) {
  const { label, icon: Icon, color } = COL_CONFIG[variant]
  const isPlanned = variant === "planned"

  return (
    <div className="flex max-h-[480px] min-h-0 flex-col rounded-xl lg:max-h-none border border-border bg-muted/20">
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0" style={{ color }} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
          <span className="text-[11px] text-muted-foreground">{month}</span>
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
            <p className="text-center text-sm">{empty}</p>
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

function ReasonDialog({ entry, onClose }: { entry: ExecutionEntry | null; onClose: () => void }) {
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
            Note · {entry.projectName || entry.obraId}
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

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterSelect({ label, icon: Icon, value, options, onChange, width = 170 }: {
  label: string; icon: React.ElementType; value: string
  options: { value: string; label: string }[]; onChange: (v: string) => void; width?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={v => v && onChange(v)}>
        <SelectTrigger className="h-8 gap-1.5 text-sm" style={{ width }}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left">{options.find(o => o.value === value)?.label}</span>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MonthlyExecutionPage() {
  const year = currentYear
  const { canEdit } = usePermission()
  const writable = canEdit("monthly_execution")
  const [period, setPeriod]       = useState(String(currentMonth))
  const [filters, setFilters]     = useState<Filters>({ client: "all", group: "all" })
  const [editEntry, setEditEntry] = useState<ExecutionEntry | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pointsMonth, setPointsMonth]   = useState<number | null>(null)

  const { data: allYear = [], isLoading } = useMonthlyExecution({ year })
  const { data: bor2Ofi = [] } = useOfi({ year })
  // Quinzena de pagamento da Framing, a mesma do QB Time Reports. Só as que terminam no ano.
  const { data: payPeriods } = usePayPeriods("framing")
  const fortnights = (payPeriods?.periods ?? []).filter(p => p.endDate.startsWith(String(year)))
  const fortnight = period.startsWith("pp:") ? fortnights.find(p => `pp:${p.startDate}` === period) ?? null : null
  const month = period === YTD ? null : fortnight ? monthOf(fortnight.endDate) : Number(period)
  const kanbanMonth = month ?? currentMonth
  const kanbanLabel = `${MONTH_NAMES[kanbanMonth - 1]} ${year}`
  const { data: ofiForMonth = [] } = useOfi({ year, month: kanbanMonth })
  const { data: groups = [] }   = useQuery({ queryKey: ["monthly-execution", "goals", year],    queryFn: () => monthlyExecutionService.goals(year) })
  const { data: finished = [] } = useQuery({ queryKey: ["monthly-execution", "finished", year], queryFn: () => monthlyExecutionService.finished(year) })
  const { data: points = [] }   = useQuery({ queryKey: ["monthly-execution", "points", year],   queryFn: () => monthlyExecutionService.points(year) })

  const clients = useMemo(() => [...new Set(groups.flatMap(clientsOf))].sort(), [groups])
  const groupOptions = useMemo(
    () => groups.filter(g => filters.client === "all" || clientsOf(g).includes(filters.client)),
    [groups, filters.client],
  )
  const visible  = useMemo(() => visibleGroups(groups, filters), [groups, filters])
  const filtered = filters.client !== "all" || filters.group !== "all"

  const chartData = useMemo(() => buildSeries({
    year, today, filters, groups, execution: allYear, finished, points,
    januaryFallback: { rows: bor2Ofi.filter(e => e.referenceMonth === 1) },
  }), [year, filters, groups, allYear, finished, points, bor2Ofi])

  const scope = fortnight
    ? fortnightScope(fortnight.startDate, fortnight.endDate)
    : monthsScope(year, month ? [month] : Array.from({ length: currentMonth }, (_, i) => i + 1))
  const panel = useMemo(() => standings(visible, finished, scope), [visible, finished, scope.from, scope.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const panelLabel = fortnight ? fortnightLabel(fortnight) : month ? MONTH_NAMES[month - 1] : `Jan to ${MONTH_LABELS[currentMonth - 1]}`

  // ── Kanban: mês escolhido (ou o corrente, no acumulado do ano) ─────────────
  // Planned e Started seguem o retrato mensal como sempre; Finished é o fim real.
  const index = useMemo(() => siteIndex(visible), [visible])
  // Mesma regra do gráfico: só job sites de algum grupo de meta entram, com ou sem filtro.
  const inFilter = (cliente = "", jobSite = "") => index.has(siteKey(cliente, jobSite))

  const { forMonth, isOFIFallback } = useMemo(() => {
    const execRecords = allYear.filter(e => e.referenceMonth === kanbanMonth)
    if (execRecords.length > 0) return { forMonth: execRecords, isOFIFallback: false }
    const ofiRecords: ExecutionEntry[] = ofiForMonth.map(o => ({
      id: o.id, obraId: o.obraId, referenceMonth: o.referenceMonth, referenceYear: o.referenceYear,
      plannedStatus: "not_started", actualStatus: "not_started" as const, reason: "", subcontractor: "",
      isCycleCompleted: false, projectName: o.projectName, address: o.address, cliente: o.cliente, jobSite: o.jobSite,
    }))
    return { forMonth: ofiRecords, isOFIFallback: true }
  }, [allYear, ofiForMonth, kanbanMonth])

  const scoped   = forMonth.filter(e => inFilter(e.cliente, e.jobSite))
  const planned  = scoped.filter(e => !isStarted(e))
  const started  = scoped.filter(isStarted)
  const finishedCards: ExecutionEntry[] = finished
    .filter(p => (fortnight ? p.finishedOn >= scope.from && p.finishedOn <= scope.to : p.finishedOn.startsWith(String(year)) && monthOf(p.finishedOn) === kanbanMonth)
      && inFilter(p.cliente, p.jobSite))
    .map(p => ({
      id: p.id, obraId: p.id, referenceMonth: kanbanMonth, referenceYear: year, plannedStatus: "",
      actualStatus: "completed", reason: "", subcontractor: "", isCycleCompleted: true,
      projectName: p.projectName, address: p.address, jobSite: p.jobSite, cliente: p.cliente,
    }))

  const pointIds = new Set(visible.map(g => g.id))
  const dialogPoints = points.filter(p => pointVisible(p, pointIds, filtered))

  if (isLoading) return <PageSkeleton />

  // Período em dois passos: o tipo e, para quinzena e mês, qual deles.
  const periodType = period === YTD ? "ytd" : period.startsWith("pp:") ? "fortnight" : "month"
  const typeOptions = [
    { value: "ytd", label: "Year to date" },
    { value: "fortnight", label: "Pay period" },
    { value: "month", label: "Month" },
  ]
  const valueOptions = periodType === "fortnight"
    ? fortnights.map(p => ({ value: `pp:${p.startDate}`, label: fortnightLabel(p) }))
    : MONTH_NAMES.map((n, i) => ({ value: String(i + 1), label: n }))
  const pickType = (t: string) => setPeriod(
    t === "ytd" ? YTD : t === "fortnight" ? (fortnights[0] ? `pp:${fortnights[0].startDate}` : YTD) : String(currentMonth))

  return (
    <div className="flex flex-col gap-5 lg:h-full">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Monthly Execution</h1>
          <p className="text-sm text-muted-foreground">Track project execution progress by month</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center gap-1.5 pl-2.5 pr-2">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{year}</span>
              </div>
              <div className="h-5 w-px shrink-0 bg-border" />
              <Select value={periodType} onValueChange={v => v && pickType(v)}>
                <SelectTrigger className="h-8 w-[124px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{typeOptions.find(o => o.value === periodType)?.label}</span>
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {periodType !== "ytd" && (
                <>
                  <div className="h-5 w-px shrink-0 bg-border" />
                  <Select value={period} onValueChange={v => v && setPeriod(v)}>
                    <SelectTrigger className="h-8 w-[150px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                      <span className="flex-1 truncate text-left text-sm">{valueOptions.find(o => o.value === period)?.label}</span>
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {valueOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
          <FilterSelect label="Client" icon={Users} value={filters.client}
            options={[{ value: "all", label: "All clients" }, ...clients.map(c => ({ value: c, label: c }))]}
            onChange={client => setFilters({ client, group: "all" })} />
          <FilterSelect label="Job site" icon={Building2} value={filters.group}
            options={[{ value: "all", label: "All job sites" }, ...groupOptions.map(g => ({ value: g.id, label: g.name }))]}
            onChange={group => setFilters(f => ({ ...f, group }))} />
          {writable && (
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Monthly Execution settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="@container flex flex-col gap-4 max-lg:contents lg:min-h-0">
          <ExecutionChart data={chartData} year={year} month={month}
            onPickMonth={m => setPeriod(String(m))} onOpenPoints={setPointsMonth} />

          <div className="grid gap-4 max-lg:order-3 @2xl:grid-cols-3 lg:min-h-0 lg:flex-1">
            <KanbanColumn variant="planned" month={kanbanLabel} entries={planned} totalCaptured={scoped.length}
              canEdit={!isOFIFallback && writable} onEdit={setEditEntry} />
            <KanbanColumn variant="started"  month={kanbanLabel} entries={started}       canEdit={false} onEdit={setEditEntry}
              empty={isOFIFallback ? "No snapshot for this month" : undefined} />
            <KanbanColumn variant="finished" month={fortnight ? fortnightLabel(fortnight) : kanbanLabel} entries={finishedCards} canEdit={false} onEdit={setEditEntry} />
          </div>
        </div>

        <GoalPanel rows={panel} label={panelLabel} />
      </div>

      <ReasonDialog entry={editEntry} onClose={() => setEditEntry(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} groups={groups} />
      <PointsDialog year={year} month={pointsMonth} points={dialogPoints} groups={visible.length ? visible : groups}
        canEdit={writable} onClose={() => setPointsMonth(null)} />
    </div>
  )
}
