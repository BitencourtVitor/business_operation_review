import { describe, expect, it } from "bun:test"

import type { PeriodBlock } from "@/services/qbtime-period-report.service"
import { placeManualBlocks } from "./place-manual"

const bloco = (p: Partial<PeriodBlock>): PeriodBlock => ({
  start: "", end: "", durationMinutes: 0, jobcodePath: [], type: "regular", isPaid: true, ...p,
})

// O caso que originou a regra: Anderson R. Feitosa (HVAC), 07/09/2026.
describe("lançamento manual na linha do dia", () => {
  it("feriado de 8h termina onde começa o primeiro ponto", () => {
    const r = placeManualBlocks([
      bloco({ type: "manual", durationMinutes: 480, jobcodePath: ["Holiday"] }),
      bloco({ start: "2026-09-07T13:41:00-04:00", end: "2026-09-07T18:17:00-04:00", durationMinutes: 276 }),
    ], "2026-09-07")
    expect(r.map(b => [b.start.slice(11, 16), b.end.slice(11, 16)])).toEqual([["05:41", "13:41"], ["13:41", "18:17"]])
    expect(r[0].placed).toBe(true)
    expect(r[1].placed).toBeUndefined()
  })

  it("vários manuais se empilham para trás", () => {
    const r = placeManualBlocks([
      bloco({ type: "manual", durationMinutes: 120, jobcodePath: ["Sick"] }),
      bloco({ type: "manual", durationMinutes: 60, jobcodePath: ["PTO"] }),
      bloco({ start: "2026-09-07T10:00:00-04:00", end: "2026-09-07T12:00:00-04:00", durationMinutes: 120 }),
    ], "2026-09-07")
    expect(r.map(b => b.start.slice(11, 16))).toEqual(["07:00", "09:00", "10:00"])
  })

  it("dia só com manual começa às 7h", () => {
    const r = placeManualBlocks([bloco({ type: "manual", durationMinutes: 480 })], "2026-09-07")
    expect([r[0].start.slice(11, 16), r[0].end.slice(11, 16)]).toEqual(["07:00", "15:00"])
  })

  it("dia sem manual volta igual", () => {
    const orig = [bloco({ start: "2026-09-08T09:00:00-04:00", end: "2026-09-08T11:00:00-04:00", durationMinutes: 120 })]
    expect(placeManualBlocks(orig, "2026-09-08")).toBe(orig)
  })
})
