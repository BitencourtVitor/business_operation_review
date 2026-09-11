import { describe, expect, it } from "bun:test"

import { formatarPes, medir, ortogonalizar, pontoSugerido } from "./plan-geometry"

// A medida é o número pelo qual alguém corta madeira. Errar aqui não produz erro
// na tela: produz um corte errado no canteiro.

describe("ortogonalizar", () => {
  it("trava no horizontal quando andou mais na horizontal", () => {
    const r = ortogonalizar({ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.13 }, 1000, 1000)
    expect(r).toEqual({ x: 0.5, y: 0.1 })
  })

  it("trava no vertical quando andou mais na vertical", () => {
    const r = ortogonalizar({ x: 0.1, y: 0.1 }, { x: 0.13, y: 0.5 }, 1000, 1000)
    expect(r).toEqual({ x: 0.1, y: 0.5 })
  })

  // A prancha não é quadrada, e comparar em coordenada normalizada faria o mesmo
  // deslocamento físico parecer maior no lado curto.
  it("decide pelo deslocamento físico, não pelo normalizado", () => {
    // 0,20 de 3024 pt = 605 pt na horizontal; 0,25 de 2160 pt = 540 pt na
    // vertical. Normalizado, o vertical parece maior; em pontos, não é.
    const r = ortogonalizar({ x: 0, y: 0 }, { x: 0.2, y: 0.25 }, 3024, 2160)
    expect(r).toEqual({ x: 0.2, y: 0 })
  })
})

describe("pontoSugerido", () => {
  // Duas linhas em cruz, e o dedo perto do centro.
  const cruz = [
    { x0: 0.0, y0: 0.5, x1: 1.0, y1: 0.5 },
    { x0: 0.5, y0: 0.0, x1: 0.5, y1: 1.0 },
  ]

  it("pula para o cruzamento", () => {
    const p = pontoSugerido({ x: 0.502, y: 0.503 }, cruz)
    expect(p).not.toBeNull()
    expect(p!.x).toBeCloseTo(0.5, 5)
    expect(p!.y).toBeCloseTo(0.5, 5)
  })

  it("não pula de longe", () => {
    expect(pontoSugerido({ x: 0.2, y: 0.2 }, cruz)).toBeNull()
  })

  it("encosta na linha quando não há canto por perto", () => {
    const so = [{ x0: 0, y0: 0.5, x1: 1, y1: 0.5 }]
    const p = pontoSugerido({ x: 0.3, y: 0.502 }, so)
    expect(p).not.toBeNull()
    expect(p!.y).toBeCloseTo(0.5, 5)
    expect(p!.x).toBeCloseTo(0.3, 5)
  })

  // Paralelas se cruzam no infinito, e o infinito não é canto de parede.
  it("ignora paralelas", () => {
    const paralelas = [
      { x0: 0, y0: 0.5, x1: 1, y1: 0.5 },
      { x0: 0, y0: 0.502, x1: 1, y1: 0.502 },
    ]
    const p = pontoSugerido({ x: 0.5, y: 0.501 }, paralelas)
    // Encosta numa delas, mas nunca inventa um cruzamento.
    expect(p === null || Math.abs(p.y - 0.5) < 0.003).toBe(true)
  })
})

describe("medir", () => {
  it("devolve nulo sem escala, em vez de um número sem unidade", () => {
    expect(medir({ x: 0, y: 0 }, { x: 1, y: 0 }, 3024, 2160, null)).toBeNull()
  })

  it("converte pela escala", () => {
    // 1/4" = 1' dá 1/18 de pé por ponto. Metade de uma prancha de 3024 pt são
    // 1512 pt, ou 84 pés.
    const pes = medir({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 3024, 2160, 1 / 18)
    expect(pes).toBeCloseTo(84, 6)
  })
})

describe("formatarPes", () => {
  it("escreve como o carpinteiro lê", () => {
    expect(formatarPes(12)).toBe("12'-0\"")
    expect(formatarPes(12.5)).toBe("12'-6\"")
    expect(formatarPes(12 + 3.75 / 12)).toBe("12'-3 3/4\"")
  })

  // Arredondar para cima em 11 15/16 tem de virar o pé inteiro, e não 12'-12".
  it("vira o pé quando a polegada estoura", () => {
    expect(formatarPes(11.9999)).toBe("12'-0\"")
  })

  it("simplifica a fração", () => {
    expect(formatarPes(0 + 2.5 / 12)).toBe("0'-2 1/2\"")
  })
})
