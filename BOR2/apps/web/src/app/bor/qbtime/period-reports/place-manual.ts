import type { PeriodBlock } from "@/services/qbtime-period-report.service"

/** Um bloco da linha do dia. `placed` marca o horário que não veio do QB Time. */
export type PlacedBlock = PeriodBlock & { placed?: boolean }

// Dia só com lançamento manual começa aqui: não há ponto para se apoiar.
const DAY_START_MIN = 7 * 60

const hhmm = (date: string, minutes: number) => {
  const m = Math.max(0, Math.min(minutes, 24 * 60 - 1))
  return `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`
}

const clockMinutes = (iso: string) => {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null
}

/**
 * Dá lugar na linha do tempo ao lançamento manual (Holiday, PTO, Sick).
 *
 * O QB Time guarda só a duração dele, sem entrada nem saída, e a barra o
 * esticava pela linha inteira, empurrando para fora os pontos reais do dia. A
 * regra combinada com o Vitor (15/09) é de representação, não de horário real:
 * as horas manuais terminam onde começa o primeiro ponto do dia. Um feriado de
 * 8h com trabalho a partir das 13:41 fica das 05:41 às 13:41, e o trabalho
 * segue das 13:41 em diante. Vários manuais no mesmo dia se empilham para trás.
 * Sem ponto nenhum, começam às 7h.
 *
 * Só a tela usa isto. Exportações e totais seguem com o dado como veio.
 */
export function placeManualBlocks(blocks: PeriodBlock[], date: string): PlacedBlock[] {
  const manual = blocks.filter(b => !clockMinutesOrNull(b.start))
  if (!manual.length) return blocks

  const timed = blocks.filter(b => clockMinutesOrNull(b.start))
  const firstPunch = timed.length
    ? Math.min(...timed.map(b => clockMinutes(b.start)!))
    : null

  const placed: PlacedBlock[] = []
  if (firstPunch != null) {
    // Para trás a partir do primeiro ponto, o último manual encostado nele.
    let end = firstPunch
    for (let i = manual.length - 1; i >= 0; i--) {
      const start = end - manual[i].durationMinutes
      placed.unshift({ ...manual[i], start: hhmm(date, start), end: hhmm(date, end), placed: true })
      end = start
    }
  } else {
    let start = DAY_START_MIN
    for (const b of manual) {
      placed.push({ ...b, start: hhmm(date, start), end: hhmm(date, start + b.durationMinutes), placed: true })
      start += b.durationMinutes
    }
  }

  return [...placed, ...timed].sort((a, b) => clockMinutes(a.start)! - clockMinutes(b.start)!)
}

function clockMinutesOrNull(iso: string) {
  return iso ? clockMinutes(iso) : null
}
