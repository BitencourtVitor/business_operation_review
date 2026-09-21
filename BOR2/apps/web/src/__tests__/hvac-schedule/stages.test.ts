import { describe, expect, it } from "vitest"
import { businessDaysBefore, editPlan, parseDate, sameWeek, stagesOf } from "@/app/bor/hvac-schedule/_lib/stages"
import type { ForecastProject } from "@bor2/shared"

// A conta da data de compra é a única lógica não trivial da página: se ela
// errar, o e-mail do Nicolas avisa no dia errado e o material chega depois da
// equipe. O resto da tela é leitura.

describe("businessDaysBefore", () => {
  it("pula o fim de semana", () => {
    // Segunda 05/10/2026, 3 dias úteis antes = quarta 30/09.
    expect(businessDaysBefore(new Date(2026, 9, 5), 3)).toEqual(new Date(2026, 8, 30))
  })

  it("dois dias úteis antes de uma terça caem na sexta anterior", () => {
    expect(businessDaysBefore(new Date(2026, 9, 6), 2)).toEqual(new Date(2026, 9, 2))
  })

  it("conta dias corridos quando a semana inteira é útil", () => {
    // Sexta 09/10 menos 2 = quarta 07/10.
    expect(businessDaysBefore(new Date(2026, 9, 9), 2)).toEqual(new Date(2026, 9, 7))
  })
})

describe("parseDate", () => {
  it("não recua um dia por causa do fuso", () => {
    expect(parseDate("2026-10-05")).toEqual(new Date(2026, 9, 5))
  })

  it("devolve nulo para data ausente", () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate("")).toBeNull()
  })
})

describe("stagesOf", () => {
  // 16/10: o Rough já terminou (09/10) e o Equipment está em curso (15 a 17/10).
  const hoje = new Date(2026, 9, 16)

  const obra = {
    id: "1",
    hvacRoughDate: "2026-10-05",
    hvacRoughEndDate: "2026-10-09",
    hvacAirHandlerDate: "2026-10-15",
    hvacAirHandlerEndDate: "2026-10-17",
  } as unknown as ForecastProject

  it("só fecha percentual com fim real, não com data planejada no passado", () => {
    // Sem nada marcado, o planejado já ter passado não conclui nada.
    expect(stagesOf(obra, hoje).percent).toBe(0)

    const comFim = stagesOf(obra, hoje, [
      { projectId: "1", stage: "rough", actualStart: "2026-10-05", actualEnd: "2026-10-09", note: "" },
    ])
    expect(comFim.percent).toBe(25)
  })

  it("etapa planejada no passado e não iniciada é atraso", () => {
    // 16/10: o Rough foi planejado para 05/10 e ninguém marcou início.
    expect(stagesOf(obra, hoje).stages[0].state).toBe("delayed")
  })

  it("início real sem fim é etapa em curso", () => {
    const r = stagesOf(obra, hoje, [
      { projectId: "1", stage: "rough", actualStart: "2026-10-06", actualEnd: null, note: "" },
    ])
    expect(r.stages[0].state).toBe("running")
  })

  it("planejado no futuro e não iniciado apenas aguarda", () => {
    const antes = new Date(2026, 9, 1)
    expect(stagesOf(obra, antes).stages[0].state).toBe("upcoming")
  })

  it("calcula a compra com a antecedência de cada etapa", () => {
    const [rough, equipment] = stagesOf(obra, hoje).stages
    // Rough: 3 dias úteis antes de segunda 05/10.
    expect(rough.purchaseBy).toEqual(new Date(2026, 8, 30))
    // Equipment: 2 dias úteis antes de quinta 15/10.
    expect(equipment.purchaseBy).toEqual(new Date(2026, 9, 13))
  })

  it("marca etapa sem data em vez de inventar estado", () => {
    expect(stagesOf(obra, hoje).stages[3].state).toBe("undated")
    expect(stagesOf(obra, hoje).stages[3].purchaseBy).toBeNull()
  })

  it("acusa etapas empilhadas no mesmo dia", () => {
    const empilhada = {
      ...obra,
      hvacAirHandlerDate: "2026-10-05",
      hvacCondenserDate: "2026-10-05",
    } as unknown as ForecastProject
    expect(stagesOf(empilhada, hoje).stacked).toBe(true)
    expect(stagesOf(obra, hoje).stacked).toBe(false)
  })
})

describe("sameWeek", () => {
  it("vai de segunda a domingo", () => {
    const quarta = new Date(2026, 9, 21)
    expect(sameWeek(new Date(2026, 9, 19), quarta)).toBe(true)
    expect(sameWeek(new Date(2026, 9, 25), quarta)).toBe(true)
    expect(sameWeek(new Date(2026, 9, 26), quarta)).toBe(false)
    expect(sameWeek(new Date(2026, 9, 18), quarta)).toBe(false)
  })
})

describe("editPlan", () => {
  const hoje = new Date(2026, 9, 16)
  const lot = stagesOf(
    {
      id: "1",
      hvacRoughDate: "2026-10-05", hvacRoughEndDate: "2026-10-09",
      hvacAirHandlerDate: "2026-10-15", hvacAirHandlerEndDate: "2026-10-17",
      hvacCondenserDate: "2026-10-22", hvacCondenserEndDate: "2026-10-23",
      hvacFinishDate: "2026-11-05", hvacFinishEndDate: "2026-11-07",
    } as unknown as ForecastProject,
    hoje,
  )

  it("sem cascata mexe só na etapa editada", () => {
    const plan = editPlan(lot, "airHandler", new Date(2026, 9, 18), new Date(2026, 9, 20), false)
    expect(plan.dates).toEqual({
      hvacAirHandlerDate: "2026-10-18",
      hvacAirHandlerEndDate: "2026-10-20",
    })
  })

  it("com cascata empurra as seguintes pelo mesmo tanto, início e fim", () => {
    const plan = editPlan(lot, "airHandler", new Date(2026, 9, 18), new Date(2026, 9, 20), true)
    expect(plan.dates).toEqual({
      hvacAirHandlerDate: "2026-10-18",
      hvacAirHandlerEndDate: "2026-10-20",
      hvacCondenserDate: "2026-10-25",
      hvacCondenserEndDate: "2026-10-26",
      hvacFinishDate: "2026-11-08",
      hvacFinishEndDate: "2026-11-10",
    })
  })

  it("nunca mexe nas etapas anteriores", () => {
    const plan = editPlan(lot, "airHandler", new Date(2026, 9, 18), null, true)
    expect(plan.dates).not.toHaveProperty("hvacRoughDate")
  })

  it("data igual não vira escrita", () => {
    expect(editPlan(lot, "rough", new Date(2026, 9, 5), new Date(2026, 9, 9), true).dates).toEqual({})
  })

  it("limpar a data manda nulo", () => {
    expect(editPlan(lot, "finish", null, null, false).dates).toEqual({
      hvacFinishDate: null,
      hvacFinishEndDate: null,
    })
  })

  it("sem início anterior não há deslocamento a copiar", () => {
    const semBase = stagesOf(
      { id: "1", hvacAirHandlerDate: null, hvacCondenserDate: "2026-10-22" } as unknown as ForecastProject,
      hoje,
    )
    const plan = editPlan(semBase, "airHandler", new Date(2026, 9, 18), null, true)
    expect(plan.dates).not.toHaveProperty("hvacCondenserDate")
  })
})
