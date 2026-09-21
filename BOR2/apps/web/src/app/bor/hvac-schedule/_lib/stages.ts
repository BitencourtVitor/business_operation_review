import { Fan, Snowflake, Thermometer, Wrench } from "lucide-react"
import type { ForecastProject } from "@bor2/shared"
import type { HVACActual } from "@/services/forecast.service"

// As quatro visitas do ciclo de HVAC, na ordem em que acontecem. Cada uma vale
// 25% da obra: fechou a quarta, a obra fechou.
//
// `leadDays` é a antecedência da compra do material, em dias úteis. As
// anotações do dia 21/09 dizem "3 dias úteis" para o Rough, "48h" para as duas
// do meio e "3 dias" para o Finish. Tratei as quatro na mesma régua, dias
// úteis, porque compra não acontece no sábado; trocar é mexer só neste número.
// Os ícones são os mesmos que o Forecast usa para estas etapas. Repetir o
// símbolo entre as duas telas é o que faz alguém reconhecer a etapa sem ler.
export const STAGES = [
  { key: "rough", label: "Rough", Icon: Wrench, leadDays: 3 },
  { key: "airHandler", label: "Air Handler", Icon: Fan, leadDays: 2 },
  { key: "condenser", label: "Condenser / Tstat", Icon: Thermometer, leadDays: 2 },
  { key: "finish", label: "Finish", Icon: Snowflake, leadDays: 3 },
] as const

export type StageKey = (typeof STAGES)[number]["key"]

export const FIELDS: Record<StageKey, { start: keyof ForecastProject; end: keyof ForecastProject }> = {
  rough: { start: "hvacRoughDate", end: "hvacRoughEndDate" },
  airHandler: { start: "hvacAirHandlerDate", end: "hvacAirHandlerEndDate" },
  condenser: { start: "hvacCondenserDate", end: "hvacCondenserEndDate" },
  finish: { start: "hvacFinishDate", end: "hvacFinishEndDate" },
}

/** Nome da etapa na tabela `forecast_hvac_stages`. */
export const STAGE_DB_NAME: Record<StageKey, string> = {
  rough: "rough",
  airHandler: "air_handler",
  condenser: "condenser",
  finish: "finish",
}

// O estado vem do que **aconteceu**, não do calendário:
//
//   done     — tem fim real
//   running  — tem início real e não tem fim
//   delayed  — o planejado já passou e ninguém marcou que começou
//   upcoming — planejado no futuro, ainda não começou
//   undated  — sem planejado e sem real
//
// É essa separação que faz "atrasado" existir. Enquanto só havia o planejado,
// toda etapa com data no passado parecia terminada e o atraso sumia.
export type StageState = "done" | "running" | "delayed" | "upcoming" | "undated"

export interface Stage {
  Icon: React.ElementType
  key: StageKey
  label: string
  /** Planejado, vindo das Orders. */
  start: Date | null
  end: Date | null
  /** Real, marcado por quem acompanha a obra. */
  actualStart: Date | null
  actualEnd: Date | null
  /** Quando o material tem de ser comprado. Calculada do planejado, nunca digitada. */
  purchaseBy: Date | null
  state: StageState
}

export interface ProjectStages {
  project: ForecastProject
  stages: Stage[]
  /** 25% por etapa de fato terminada. */
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

function stateOf(
  start: Date | null,
  actualStart: Date | null,
  actualEnd: Date | null,
  today: Date,
): StageState {
  if (actualEnd) return "done"
  if (actualStart) return "running"
  if (!start) return "undated"
  return start < today ? "delayed" : "upcoming"
}

export function stagesOf(
  project: ForecastProject,
  today = startOfToday(),
  actuals: HVACActual[] = [],
): ProjectStages {
  const byStage = new Map(actuals.map(a => [a.stage, a]))

  const stages = STAGES.map(({ key, label, Icon, leadDays }) => {
    const start = parseDate(project[FIELDS[key].start] as string | null)
    const end = parseDate(project[FIELDS[key].end] as string | null)
    const actual = byStage.get(STAGE_DB_NAME[key])
    const actualStart = parseDate(actual?.actualStart)
    const actualEnd = parseDate(actual?.actualEnd)
    return {
      key,
      Icon,
      label,
      start,
      end,
      actualStart,
      actualEnd,
      purchaseBy: start ? businessDaysBefore(start, leadDays) : null,
      state: stateOf(start, actualStart, actualEnd, today),
    }
  })

  const starts = stages.map(s => s.start?.getTime()).filter(Boolean)

  return {
    project,
    stages,
    // 25% por etapa de fato terminada, como as anotações pedem.
    percent: stages.filter(s => s.actualEnd).length * 25,
    stacked: new Set(starts).size < starts.length,
  }
}

/** Obra que já começou e ainda não terminou. Começou é alguém ter marcado
 *  início de alguma etapa, não a data planejada ter chegado. */
export function isActive(p: ProjectStages): boolean {
  return p.stages.some(s => s.actualStart) && p.percent < 100
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
