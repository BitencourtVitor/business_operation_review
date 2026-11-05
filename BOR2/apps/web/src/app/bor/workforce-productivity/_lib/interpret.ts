/**
 * Leitura em texto do gráfico de um prédio: prazo, orçamento, ritmo antes e depois
 * do atraso, tendência recente e o que a estimativa diz. Só horas, nunca dinheiro.
 * Regra pura: recebe a série diária e devolve as frases, sem saber de tela.
 */

export interface InterpretInput {
  status: string // "open", "closed", "not started"...
  end: string // fim previsto (Forecast)
  today: string
  budgetHours: number
  exceedsOn: string | null
  series: { date: string; actual: number | null; projected: number | null }[]
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const h = (v: number) => `${Math.round(v).toLocaleString("en-US")} h`
const rate = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} h/day`

/** Horas por dia num trecho [from, to] da série acumulada. */
function pace(acc: Map<string, number>, dates: string[], from: string, to: string) {
  const inRange = dates.filter(d => d >= from && d <= to)
  if (inRange.length < 2) return null
  const first = inRange[0], last = inRange[inRange.length - 1]
  const before = dates[dates.indexOf(first) - 1]
  const start = before ? acc.get(before)! : 0
  return (acc.get(last)! - start) / Math.max(1, days(before ?? first, last))
}

export function interpret(f: InterpretInput): string[] {
  const real = f.series.filter(p => p.actual != null)
  if (real.length === 0) return ["No hours logged on this building yet."]
  const dates = real.map(p => p.date)
  const acc = new Map(real.map(p => [p.date, p.actual!]))
  const used = real[real.length - 1].actual!
  const usedPct = Math.round((used / Math.max(1, f.budgetHours)) * 100)
  const late = f.status !== "closed" && f.today > f.end ? days(f.end, f.today) : 0
  const out: string[] = []
  // Último dia em que o acumulado subiu: quando o trabalho de fato parou.
  const lastWork = real.reduce((d, p, i) => (i > 0 && p.actual! > real[i - 1].actual! ? p.date : d), dates[0])
  const closed = f.status === "closed"

  // Prazo.
  if (closed) {
    const gap = days(f.end, lastWork)
    const when = gap > 0 ? `${gap} days after` : gap < 0 ? `${-gap} days before` : "on"
    out.push(`The building is closed. Work ran until ${day(lastWork)}, ${when} the expected end date (${day(f.end)}).`)
  }
  else if (late > 0) out.push(`The expected end date (${day(f.end)}) was missed: the building is ${late} days late and still open.`)
  else out.push(`The expected end date is ${day(f.end)}, ${days(f.today, f.end)} days away.`)

  // Orçamento.
  if (used > f.budgetHours && f.exceedsOn) {
    const when = f.exceedsOn <= f.end ? "before the expected end date" : "after the expected end date"
    out.push(`The labor budget was passed on ${day(f.exceedsOn)}, ${when}. Hours ${closed ? "ended" : "are now"} at ${usedPct}% of it.`)
  } else if (used > f.budgetHours) {
    out.push(`Hours are at ${usedPct}% of the labor budget.`)
  } else {
    const proj = f.series.filter(p => p.projected != null).at(-1)?.projected
    const tail = proj == null ? "" : proj > f.budgetHours
      ? ` At this pace it passes the budget${f.exceedsOn ? ` on ${day(f.exceedsOn)}` : ""}, ending near ${Math.round((proj / f.budgetHours) * 100)}%.`
      : ` At this pace it ends near ${Math.round((proj / f.budgetHours) * 100)}% of the budget.`
    out.push(`${usedPct}% of the labor budget is used.${tail}`)
  }

  // Ritmo antes e depois do atraso (só com pelo menos duas semanas de atraso).
  if (late >= 14) {
    const before = pace(acc, dates, dates[0], f.end)
    const after = pace(acc, dates, f.end, f.today)
    if (before != null && after != null && before > 0) {
      const ratio = after / before
      if (ratio > 1.2) out.push(`After the delay started, labor went up: ${rate(after)} since ${day(f.end)}, against ${rate(before)} before.`)
      else if (ratio < 0.8) out.push(`After the delay started, labor slowed down: ${rate(after)} since ${day(f.end)}, against ${rate(before)} before.`)
      else out.push(`Labor kept about the same pace after the delay started (${rate(after)}).`)
    } else if (before === 0 && after != null && after > 0) {
      out.push(`Almost no hours were logged before the expected end date; the work happened after it (${rate(after)}).`)
    }
  }

  // Tendência recente: últimas 4 semanas contra as 4 anteriores.
  const last = dates[dates.length - 1]
  const back = (n: number) => new Date(Date.parse(last) - n * 864e5).toISOString().slice(0, 10)
  const recent = pace(acc, dates, back(27), last)
  const prior = pace(acc, dates, back(55), back(28))
  if (recent != null && prior != null && !closed) {
    if (recent === 0) out.push("No hours in the last 4 weeks: the work looks stopped.")
    else if (recent < 2 && prior < 2) out.push(`Only a trickle of hours in the last 4 weeks (${rate(recent)}).`)
    else if (prior > 0 && recent / prior > 1.25) out.push(`The last 4 weeks are speeding up (${rate(recent)}, up from ${rate(prior)}).`)
    else if (prior > 0 && recent / prior < 0.75) out.push(`The last 4 weeks are slowing down (${rate(recent)}, down from ${rate(prior)}).`)
    else out.push(`The last 4 weeks keep a steady pace (${rate(recent)}).`)
  }

  // Estimativa.
  const projPts = f.series.filter(p => p.projected != null)
  if (projPts.length > 1 && !closed) {
    const added = projPts[projPts.length - 1].projected! - projPts[0].projected!
    const span = days(projPts[0].date, projPts[projPts.length - 1].date)
    if (late > 0) out.push(`If this pace keeps up, the building adds about ${h(added)} in the next ${span} days, with no new end date set.`)
    else out.push(`If this pace keeps up, about ${h(added)} more until the expected end date.`)
    // A estimativa usa a média desde o início; se as últimas semanas destoam, vale avisar.
    const avg = used / Math.max(1, days(dates[0], f.today))
    if (recent != null && avg > 0 && Math.abs(recent / avg - 1) > 0.25)
      out.push(`That estimate uses the average pace since the first hours (${rate(avg)}); at the pace of the last 4 weeks it would be about ${h(recent * span)}.`)
  }
  return out
}
