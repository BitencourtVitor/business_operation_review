import { describe, expect, it } from "bun:test"

import { hydrateSchedule, parseMSPDate, splitDateCell, splitGluedTail } from "./pdf-schedule-parser"

// Casos tirados do cronograma do Riverview 2, onde o pdf.js entregou a coluna
// Finish grudada na Predecessors e o ano virou 27383.
describe("data grudada na coluna seguinte", () => {
  it("separa a data do que veio depois", () => {
    expect(splitDateCell("Wed 3/10/27383")).toEqual({ date: "Wed 3/10/27", rest: "383" })
    expect(splitDateCell("Tue 10/13/26149FS-1 day Framer (shell)"))
      .toEqual({ date: "Tue 10/13/26", rest: "149FS-1 day Framer (shell)" })
    expect(splitDateCell("Thu 4/22/27")).toEqual({ date: "Thu 4/22/27", rest: "" })
    expect(splitDateCell("4/20/2026")).toEqual({ date: "4/20/2026", rest: "" })
  })

  it("lê o ano certo", () => {
    expect(parseMSPDate("Wed 3/10/27383")?.getFullYear()).toBe(2027)
    expect(parseMSPDate("Wed 9/16/26135SS+2 days")?.getFullYear()).toBe(2026)
    expect(parseMSPDate("Mon 4/20/2026")?.getFullYear()).toBe(2026)
    expect(parseMSPDate("Fri 11/7/25")?.getMonth()).toBe(10)
    expect(parseMSPDate("")).toBeNull()
  })

  it("devolve predecessora e recurso às suas colunas", () => {
    expect(splitGluedTail("383")).toEqual({ predecessors: "383", resources: "" })
    expect(splitGluedTail("135SS+2 days")).toEqual({ predecessors: "135SS+2 days", resources: "" })
    expect(splitGluedTail("149FS-1 day Framer (shell)"))
      .toEqual({ predecessors: "149FS-1 day", resources: "Framer (shell)" })
    expect(splitGluedTail("")).toEqual({ predecessors: "", resources: "" })
  })

  it("cronograma já gravado com o ano errado abre com a data certa", () => {
    const s = hydrateSchedule({
      projectStart: "2026-01-09T03:00:00.000Z",
      projectFinish: "+027383-03-10T03:00:00.000Z",
      rows: [
        { id: "1", start: "Fri 1/9/26", finish: "Thu 4/22/27", startDate: "2026-01-09T03:00:00.000Z", finishDate: "2027-04-22T03:00:00.000Z" },
        { id: "385", start: "Wed 3/10/27", finish: "Wed 3/10/27383", startDate: "2027-03-10T03:00:00.000Z", finishDate: "+027383-03-10T03:00:00.000Z" },
      ],
    })
    expect(s.projectFinish?.getFullYear()).toBe(2027)
    expect(s.projectFinish?.getMonth()).toBe(3)
    expect(s.rows[1].finishDate?.getFullYear()).toBe(2027)
  })
})
