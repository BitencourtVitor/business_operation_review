import { describe, expect, it } from "vitest"
import { borLandingHref } from "@/lib/products"

// Quem entra tem de cair numa página que consegue abrir. Mandar todo mundo
// para o Monthly Execution dava tela vazia a quem não tem essa chave.

describe("borLandingHref", () => {
  it("abre no Monthly Execution quando a pessoa tem a chave", () => {
    expect(borLandingHref({ monthly_execution: "read" }, false)).toBe("/bor/monthly-execution")
  })

  it("cai na primeira página que a pessoa pode ver", () => {
    expect(borLandingHref({ permits: "read" }, false)).toBe("/bor/permits")
  })

  it("quem só tem HVAC não é mandado para o Forecast de Framing", () => {
    const href = borLandingHref({ forecast_hvac: "read" }, false)
    expect(href).toBe("/bor/hvac-forecast")
    expect(href).not.toBe("/bor/forecast")
  })

  it("respeita a ordem da barra lateral quando há várias", () => {
    expect(borLandingHref({ permits: "read", ofi: "read" }, false)).toBe("/bor/ofi")
  })

  it("acesso total entra pela primeira da lista", () => {
    expect(borLandingHref({}, true)).toBe("/bor/monthly-execution")
  })

  it("permissão desligada não conta", () => {
    expect(borLandingHref({ monthly_execution: "", permits: "read" }, false)).toBe("/bor/permits")
  })
})
