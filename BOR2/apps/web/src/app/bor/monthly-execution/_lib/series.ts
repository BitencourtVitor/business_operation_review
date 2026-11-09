import type { ExecutionEntry } from "@/services/ofi.service"
import type { FinishedProject, GoalGroup, ImprovementPoint } from "@/services/monthly-execution.service"

export const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
export const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]

export const siteKey = (cliente: string, jobSite: string) => `${cliente}|${jobSite}`

/** Filtro da página: cliente e grupo de meta ("all" = sem filtro). */
export interface Filters { client: string; group: string }

export const clientsOf = (g: GoalGroup) => [...new Set(g.sites.map(s => s.cliente))]

/** Grupos que a página mostra: só os do settings, recortados pelo filtro. */
export function visibleGroups(groups: GoalGroup[], f: Filters) {
  return groups.filter(g =>
    (f.client === "all" || clientsOf(g).includes(f.client)) && (f.group === "all" || g.id === f.group))
}

/** job site → grupo, para os grupos visíveis. */
export function siteIndex(groups: GoalGroup[]) {
  const index = new Map<string, string>()
  for (const g of groups) for (const s of g.sites) index.set(siteKey(s.cliente, s.jobSite), g.id)
  return index
}

export const monthOf = (isoDate: string) => Number(isoDate.slice(5, 7))

export const isStarted = (e: ExecutionEntry) => e.actualStatus === "started" || e.actualStatus === "completed" || e.isCycleCompleted

/** Ponto sem job site só aparece sem filtro; com filtro, só o que cita grupo visível. */
export function pointVisible(p: ImprovementPoint, visible: Set<string>, filtered: boolean) {
  return filtered ? p.groupIds.some(id => visible.has(id)) : true
}

export interface ChartPoint {
  month: string
  planned: number | null
  started: number | null
  finished: number | null
  goal: number | null
  pending: number
  resolved: number
  /** Obras do mês: a que não começa volta planejada no mês seguinte, e o total do ano conta cada uma uma vez só (ME-23). */
  plannedIds: string[]
  startedIds: string[]
}

export interface SeriesTotals { planned: number; started: number; finished: number; goal: number; offPaper: number; months: number }

/**
 * Totais dos meses from..upTo (1 a 12; padrão: o ano até upTo): planejado e iniciado sem repetir obra,
 * terminado e meta somados mês a mês. Off paper = iniciadas + terminadas (ME-24).
 */
export function totals(data: ChartPoint[], upTo = 12, from = 1): SeriesTotals {
  const rows = data.slice(from - 1, upTo)
  const distinct = (k: "plannedIds" | "startedIds") => new Set(rows.flatMap(r => r[k])).size
  const add = (k: "finished" | "goal") => rows.reduce((s, r) => s + (r[k] ?? 0), 0)
  const started = distinct("startedIds"), finished = add("finished")
  return { planned: distinct("plannedIds"), started, finished, goal: add("goal"), offPaper: started + finished, months: rows.length }
}

/**
 * As quatro linhas do ano. Planned e Started saem do retrato mensal como
 * sempre saíram; Finished é o fim real (dia em que a obra fechou); Meta é a
 * soma dos grupos visíveis no mês.
 */
export function buildSeries(args: {
  year: number; today: Date; filters: Filters; groups: GoalGroup[]
  execution: ExecutionEntry[]; finished: FinishedProject[]; points: ImprovementPoint[]
  januaryFallback: { rows: { obraId?: string; cliente?: string; jobSite?: string }[] }
}): ChartPoint[] {
  const { year, today, filters, groups, execution, finished, points } = args
  const visible = visibleGroups(groups, filters)
  const index = siteIndex(visible)
  const ids = new Set(visible.map(g => g.id))
  const filtered = filters.client !== "all" || filters.group !== "all"
  const inScope = (cliente = "", jobSite = "") => index.has(siteKey(cliente, jobSite))
  const lastMonth = year < today.getFullYear() ? 12 : year > today.getFullYear() ? 0 : today.getMonth() + 1

  return MONTH_LABELS.map((label, i) => {
    const m = i + 1
    const exe = execution.filter(e => e.referenceMonth === m && inScope(e.cliente, e.jobSite))
    let plannedIds = [...new Set(exe.map(e => e.obraId.toLowerCase()))]
    let startedIds = [...new Set(exe.filter(isStarted).map(e => e.obraId.toLowerCase()))]
    let planned: number | null = plannedIds.length || null
    let started: number | null = exe.length ? startedIds.length : null
    // Janeiro de 2026 não tem retrato de execução: o planejado sai das linhas do OFI do mês
    // (mesma regra dos grupos) e o iniciado fica vazio, como no kanban (não há registro por obra).
    if (m === 1 && year === 2026 && !exe.length) {
      const jan = args.januaryFallback.rows.filter(r => inScope(r.cliente, r.jobSite))
      plannedIds = [...new Set(jan.map((r, k) => (r.obraId ?? "jan-" + k).toLowerCase()))]
      planned = plannedIds.length || null
      started = null
      startedIds = []
    }
    const monthPoints = points.filter(p => p.month === m && pointVisible(p, ids, filtered))
    return {
      month: label,
      planned,
      started,
      finished: m <= lastMonth ? finished.filter(p => p.finishedOn.startsWith(String(year)) && monthOf(p.finishedOn) === m && inScope(p.cliente, p.jobSite)).length : null,
      goal: visible.length ? visible.reduce((sum, g) => sum + (g.goals?.[i] ?? 0), 0) : null,
      pending: monthPoints.filter(p => p.status === "pending").length,
      resolved: monthPoints.filter(p => p.status === "resolved").length,
      plannedIds,
      startedIds,
    }
  })
}

export interface GoalStanding { group: GoalGroup; goal: number; finished: number; ratio: number; projects: FinishedProject[] }

/** Recorte do painel: as datas que contam e a meta de cada grupo nesse recorte. */
export interface PeriodScope {
  from: string // "YYYY-MM-DD", inclusive
  to: string   // inclusive
  goalOf: (g: GoalGroup) => number
}

/** A meta acumula: soma a meta de cada mês do recorte. */
export const monthsScope = (year: number, months: number[]): PeriodScope => ({
  from: `${year}-${String(months[0]).padStart(2, "0")}-01`,
  to: `${year}-${String(months[months.length - 1]).padStart(2, "0")}-31`,
  goalOf: g => months.reduce((sum, m) => sum + (g.goals?.[m - 1] ?? 0), 0),
})

/**
 * Quinzena de pagamento da Framing (QB Time). A meta é a do mês em que ela
 * termina × 12 ÷ 26, arredondada para cima: 3 casas/mês viram 2 na quinzena.
 */
export const fortnightScope = (from: string, to: string): PeriodScope => ({
  from, to,
  goalOf: g => Math.ceil(((g.goals?.[monthOf(to) - 1] ?? 0) * 12) / 26),
})

/** Painel da meta, ordenado do mais longe para o mais perto. */
export function standings(groups: GoalGroup[], finished: FinishedProject[], scope: PeriodScope): GoalStanding[] {
  return groups
    .map(group => {
      const keys = new Set(group.sites.map(s => siteKey(s.cliente, s.jobSite)))
      const goal = scope.goalOf(group)
      const projects = finished.filter(p => p.finishedOn >= scope.from && p.finishedOn <= scope.to && keys.has(siteKey(p.cliente, p.jobSite)))
      return { group, goal, finished: projects.length, ratio: goal ? projects.length / goal : Infinity, projects }
    })
    .sort((a, b) => a.ratio - b.ratio || a.group.name.localeCompare(b.group.name))
}
