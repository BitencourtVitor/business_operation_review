import { describe, expect, it } from "vitest"
import { interpret, type InterpretInput } from "./interpret"

/** Série diária acumulada a partir de horas por dia. */
function series(start: string, perDay: (i: number) => number, n: number, today: string, horizon = 0) {
  const out: InterpretInput["series"] = []
  let acc = 0
  for (let i = 0; i < n + horizon; i++) {
    const date = new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10)
    if (date <= today) acc += perDay(i)
    out.push({ date, actual: date <= today ? acc : null, projected: date >= today ? acc + (date > today ? 5 : 0) : null })
  }
  return out
}

describe("interpret", () => {
  it("atrasado, com a mão de obra crescendo depois do fim previsto", () => {
    const s = series("2026-01-01", i => (i < 90 ? 2 : 12), 300, "2026-10-27", 30)
    const t = interpret({ status: "open", end: "2026-03-31", today: "2026-10-27", budgetHours: 1200, exceedsOn: "2026-05-20", series: s }).join(" ")
    expect(t).toContain("was missed")
    expect(t).toContain("after the expected end date")
    expect(t).toContain("labor went up")
    expect(t).toContain("no new end date")
  })

  it("no prazo e dentro do orçamento", () => {
    const s = series("2026-09-01", () => 3, 65, "2026-11-04", 70)
    const t = interpret({ status: "open", end: "2027-01-14", today: "2026-11-04", budgetHours: 1200, exceedsOn: null, series: s }).join(" ")
    expect(t).toContain("days away")
    expect(t).toContain("of the labor budget is used")
    expect(t).not.toContain("delay")
  })

  it("parado nas últimas semanas", () => {
    const s = series("2026-05-01", i => (i < 120 ? 5 : 0), 188, "2026-11-04")
    expect(interpret({ status: "open", end: "2026-12-30", today: "2026-11-04", budgetHours: 2000, exceedsOn: null, series: s }).join(" "))
      .toContain("looks stopped")
  })

  it("sem horas", () => {
    expect(interpret({ status: "open", end: "2026-12-30", today: "2026-11-04", budgetHours: 1000, exceedsOn: null, series: [] }))
      .toEqual(["No hours logged on this building yet."])
  })
})

describe("interpret, prédio fechado", () => {
  it("diz quando o trabalho parou em relação ao fim previsto", () => {
    const s = series("2026-01-01", i => (i < 40 ? 4 : 0), 120, "2026-04-30")
    const t = interpret({ status: "closed", end: "2026-02-01", today: "2026-11-04", budgetHours: 100, exceedsOn: "2026-01-26", series: s }).join(" ")
    expect(t).toContain("Work ran until Feb 9, 8 days after the expected end date")
    expect(t).toContain("ended at")
  })
})
