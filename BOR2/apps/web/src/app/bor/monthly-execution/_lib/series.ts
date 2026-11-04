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
}

/**
 * As quatro linhas do ano. Planned e Started saem do retrato mensal como
 * sempre saíram; Finished é o fim real (dia em que a obra fechou); Meta é a
 * soma dos grupos visíveis no mês.
 */
export function buildSeries(args: {
  year: number; today: Date; filters: Filters; groups: GoalGroup[]
  execution: ExecutionEntry[]; finished: FinishedProject[]; points: ImprovementPoint[]
  januaryFallback: { planned: number | null }
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
    let planned: number | null = exe.length || null
    let started: number | null = exe.length ? exe.filter(isStarted).length : null
    // Janeiro de 2026 não tem retrato: o número veio do BOR1 e só vale sem filtro.
    if (m === 1 && year === 2026 && !exe.length && !filtered) {
      planned = args.januaryFallback.planned
      started = 10
    }
    const monthPoints = points.filter(p => p.month === m && pointVisible(p, ids, filtered))
    return {
      month: label,
      planned,
      started,
      finished: m <= lastMonth ? finished.filter(p => monthOf(p.finishedOn) === m && inScope(p.cliente, p.jobSite)).length : null,
      goal: visible.length ? visible.reduce((sum, g) => sum + (g.goals?.[i] ?? 0), 0) : null,
      pending: monthPoints.filter(p => p.status === "pending").length,
      resolved: monthPoints.filter(p => p.status === "resolved").length,
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
