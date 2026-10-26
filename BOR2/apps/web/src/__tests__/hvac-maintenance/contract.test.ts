import { describe, expect, it } from "vitest"
import { amountText, maskAmount, maskPhone, moneyOf } from "@/app/bor/hvac-maintenance/_lib/contract"

// A conta do dinheiro é o que a HVAC vai usar para cobrar: errar aqui é cobrar
// quem já pagou ou deixar de cobrar quem deve.

describe("moneyOf", () => {
  it("soma o faturado, o pago, o aberto e o que falta faturar", () => {
    const m = moneyOf(500, [
      { number: "1", found: true, total: 200, balance: 0 },
      { number: "2", found: true, total: 100, balance: 100 },
    ])
    expect(m).toEqual({ value: 500, invoiced: 300, paid: 200, open: 100, toInvoice: 200 })
  })

  it("ignora invoice anulada e a que o QuickBooks ainda não trouxe", () => {
    const m = moneyOf(499, [
      { number: "1", found: true, total: 0, balance: 0 },
      { number: "2", found: false },
    ])
    expect(m).toEqual({ value: 499, invoiced: 0, paid: 0, open: 0, toInvoice: 499 })
  })

  it("sem valor de contrato não inventa o que falta faturar", () => {
    expect(moneyOf(null, []).toInvoice).toBeNull()
  })
})

describe("maskAmount", () => {
  it("os dois últimos dígitos são os centavos", () => {
    expect(maskAmount("99800")).toBe(998)
    expect(amountText(maskAmount("179700"))).toBe("1,797.00")
    expect(maskAmount("$ 1,797.005")).toBe(17970.05)
  })

  it("apagar tudo deixa sem valor, não zero", () => {
    expect(maskAmount("")).toBeNull()
    expect(maskAmount("0.00")).toBeNull()
  })
})

describe("maskPhone", () => {
  it("formata enquanto digita", () => {
    expect(maskPhone("978")).toBe("(978")
    expect(maskPhone("9785004")).toBe("(978) 500-4")
    expect(maskPhone("(978) 5004871")).toBe("(978) 500-4871")
  })
})
