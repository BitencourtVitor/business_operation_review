import type { ForecastProject } from "@bor2/shared"

// As quatro visitas do ciclo de HVAC, na ordem em que acontecem. Cada uma vale
// 25% da obra: fechou a quarta, a obra fechou.
//
// `leadDays` é a antecedência da compra do material, em dias úteis. As
// anotações do dia 21/09 dizem "3 dias úteis" para o Rough, "48h" para as duas
// do meio e "3 dias" para o Finish. Tratei as quatro na mesma régua, dias
// úteis, porque compra não acontece no sábado; trocar é mexer só neste número.
export const STAGES = [
  { key: "rough", label: "1 · Rough", leadDays: 3 },
  { key: "airHandler", label: "2 · Equipment", leadDays: 2 },
  { key: "condenser", label: "3 · Condenser / Tstat", leadDays: 2 },
  { key: "finish", label: "4 · Finish", leadDays: 3 },
] as const

export type StageKey = (typeof STAGES)[number]["key"]

export const FIELDS: Record<StageKey, { start: keyof ForecastProject; end: keyof ForecastProject }> = {
  rough: { start: "hvacRoughDate", end: "hvacRoughEndDate" },
  airHandler: { start: "hvacAirHandlerDate", end: "hvacAirHandlerEndDate" },
  condenser: { start: "hvacCondenserDate", end: "hvacCondenserEndDate" },
  finish: { start: "hvacFinishDate", end: "hvacFinishEndDate" },
}

// O que a tela sabe hoje. Não há início nem fim reais no banco, só o planejado
// que vem das Orders, então "done" quer dizer "o calendário diz que já passou",
// não "alguém confirmou que acabou". A tela precisa dizer isso com todas as
// letras — ver HS-13 no backlog de 21/09.
export type StageState = "done" | "running" | "upcoming" | "undated"

export interface Stage {
  key: StageKey
  label: string
  start: Date | null
  end: Date | null
  /** Quando o material tem de ser comprado. Calculada, nunca digitada. */
  purchaseBy: Date | null
  state: StageState
}

export interface ProjectStages {
  project: ForecastProject
  stages: Stage[]
  /** 25% por etapa cujo fim já passou. */
  percent: number
  /** O cliente mandou etapas diferentes começando no mesmo dia. */
  stacked: boolean
}

/** "2026-10-05" vira 5 de outubro no fuso local, sem o recuo de um dia que o
 *  construtor do Date faz quando lê a string como UTC. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function startOfToday(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/** Anda `days` dias úteis para trás, pulando sábado e domingo.
 *  ponytail: sem calendário de feriado, que o BOR2 não tem; acrescentar quando
 *  existir um, senão véspera de feriado compra tarde. */
export function businessDaysBefore(date: Date, days: number): Date {
  const out = new Date(date)
  let left = days
  while (left > 0) {
    out.setDate(out.getDate() - 1)
    const weekday = out.getDay()
    if (weekday !== 0 && weekday !== 6) left--
  }
  return out
}

function stateOf(start: Date | null, end: Date | null, today: Date): StageState {
  if (!start && !end) return "undated"
  if (end && end < today) return "done"
  if (start && start <= today) return "running"
  return "upcoming"
}

export function stagesOf(project: ForecastProject, today = startOfToday()): ProjectStages {
  const stages = STAGES.map(({ key, label, leadDays }) => {
    const start = parseDate(project[FIELDS[key].start] as string | null)
    const end = parseDate(project[FIELDS[key].end] as string | null)
    return {
      key,
      label,
      start,
      end,
      purchaseBy: start ? businessDaysBefore(start, leadDays) : null,
      state: stateOf(start, end, today),
    }
  })

  const starts = stages.map(s => s.start?.getTime()).filter(Boolean)

  return {
    project,
    stages,
    percent: stages.filter(s => s.state === "done").length * 25,
    stacked: new Set(starts).size < starts.length,
  }
}

/** Obra que já começou e ainda não terminou. */
export function isActive(p: ProjectStages): boolean {
  return p.percent > 0 && p.percent < 100
}

export function sameWeek(date: Date, today: Date): boolean {
  const monday = new Date(today)
  monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return date >= monday && date <= sunday
}

const DAY = 86_400_000

export function toISO(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date)
  out.setDate(out.getDate() + days)
  return out
}

export interface EditChange {
  label: string
  from: Date | null
  to: Date | null
}

export interface EditPlan {
  /** Pronto para o corpo da requisição: campo do banco -> data ou nulo. */
  dates: Record<string, string | null>
  /** O mesmo, em forma de frase, para a tela mostrar antes de confirmar. */
  changes: EditChange[]
}

/** O que muda ao mexer numa etapa.
 *
 *  Com `cascade`, as etapas seguintes andam o mesmo tanto de dias que o início
 *  desta andou — início e fim juntos, para a etapa não encolher no caminho.
 *  Sem início anterior não há deslocamento a copiar, e a cascata não acontece. */
export function editPlan(
  lot: ProjectStages,
  key: StageKey,
  start: Date | null,
  end: Date | null,
  cascade: boolean,
): EditPlan {
  const dates: Record<string, string | null> = {}
  const changes: EditChange[] = []
  const index = STAGES.findIndex(s => s.key === key)
  const edited = lot.stages[index]

  const put = (field: keyof ForecastProject, label: string, from: Date | null, to: Date | null) => {
    if (from?.getTime() === to?.getTime()) return
    dates[field as string] = to ? toISO(to) : null
    changes.push({ label, from, to })
  }

  put(FIELDS[key].start, `${edited.label} · start`, edited.start, start)
  put(FIELDS[key].end, `${edited.label} · end`, edited.end, end)

  const shift =
    cascade && edited.start && start
      ? Math.round((start.getTime() - edited.start.getTime()) / DAY)
      : 0

  if (shift !== 0) {
    for (const next of lot.stages.slice(index + 1)) {
      if (next.start) put(FIELDS[next.key].start, `${next.label} · start`, next.start, addDays(next.start, shift))
      if (next.end) put(FIELDS[next.key].end, `${next.label} · end`, next.end, addDays(next.end, shift))
    }
  }

  return { dates, changes }
}

export function formatDate(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}
