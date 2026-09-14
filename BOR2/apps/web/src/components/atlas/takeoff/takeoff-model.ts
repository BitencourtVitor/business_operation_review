import type { TakeoffTerm } from "@/services/atlas-takeoff.service"
import type { AreaPt } from "./run-trace"
import type { Stroke, TraceKind } from "./trace"
import { tagOutline, type TagShape, type VectorRead } from "./vector-read"

// O que as duas leituras do Takeoff entregam, e o dicionário que as duas usam
// (ATL-103). O vetor e a IA chegam por caminhos diferentes a uma mesma lista de
// elementos, e a conferência cruzada vale para as duas.

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TakeoffElement {
  id: string
  /** window, door, opening, railing, light_fixture... */
  category: string
  tag: string
  /** O que o dicionário diz da tag, quando diz. */
  meaning: string
  /** Em pontos de papel, na folha. */
  box: Box
  /** Unidades vistas no desenho (a IA conta; o vetor não). */
  units?: number
  /** Unidades que a tag promete pela tabela (A3T são três). */
  expectedUnits?: number
  substrate?: string
  shape?: TagShape
  confidence?: number
  /** Motivos para conferir. Vazio é elemento que fechou com o dicionário. */
  review: string[]
  source: "vector" | "ai"
}

export interface Dictionary {
  tags: Map<string, TakeoffTerm>
  /** Forma do contorno para o que ela marca, já com a legenda do set sobre a base. */
  shapes: Map<string, { target: string; term: TakeoffTerm }>
  abbreviations: Map<string, TakeoffTerm>
  symbols: TakeoffTerm[]
}

const RANK = { project: 0, set: 1, base: 2 } as const

export function buildDictionary(terms: TakeoffTerm[]): Dictionary {
  const tags = new Map<string, TakeoffTerm>()
  const abbreviations = new Map<string, TakeoffTerm>()
  const shapes = new Map<string, { target: string; term: TakeoffTerm }>()
  const better = (a: TakeoffTerm | undefined, b: TakeoffTerm) => !a || RANK[b.level] < RANK[a.level]

  for (const t of terms) {
    const code = t.code.toUpperCase()
    if (t.kind === "tag" && better(tags.get(code), t)) tags.set(code, t)
    if (t.kind === "abbreviation" && better(abbreviations.get(code), t)) abbreviations.set(code, t)
    if (t.kind === "symbol") {
      const shape = typeof t.attrs.shape === "string" ? t.attrs.shape : ""
      const target = typeof t.attrs.target === "string" ? t.attrs.target : ""
      if (shape && target && better(shapes.get(shape)?.term, t)) shapes.set(shape, { target, term: t })
    }
  }
  return { tags, shapes, abbreviations, symbols: terms.filter(t => t.kind === "symbol") }
}

// Código de tag: letra e, no máximo, alguns números e letras ("A3T", "J", "B1A").
// Número sozinho é nota ou eixo, não tag de abertura.
const TAG_TEXT = /^[A-Z]{1,3}\d{0,3}[A-Z]{0,3}$/

function intersects(a: Box, area: AreaPt) {
  return a.x1 >= area.x && a.x0 <= area.x + area.w && a.y1 >= area.y && a.y0 <= area.y + area.h
}

/**
 * O takeoff pelo vetor: cada texto com cara de tag, com contorno em volta ou
 * com linha na tabela, vira elemento. A categoria sai da legenda do set pela
 * forma do contorno; o significado, da tabela pelo código.
 */
export function vectorTakeoff(read: VectorRead, area: AreaPt, dic: Dictionary): { elements: TakeoffElement[]; outlines: Box[] } {
  const elements: TakeoffElement[] = []
  const outlines: Box[] = []

  for (const t of read.texts) {
    const code = t.text.toUpperCase()
    if (!TAG_TEXT.test(code) || !intersects(t, area)) continue
    const term = dic.tags.get(code)
    const outline = tagOutline(read, t)
    if (!outline && !term) continue
    // Abreviação solta ("TYP", "SIM") dentro do desenho não é tag.
    if (!outline && dic.abbreviations.has(code)) continue

    const review: string[] = []
    const byShape = outline ? dic.shapes.get(outline.shape) : undefined
    const byTable = typeof term?.attrs.category === "string" ? term.attrs.category : ""
    let category = byTable || byShape?.target || ""
    if (!term) review.push("Tag not in the schedules")
    if (!outline) review.push("No tag outline around the text")
    else if (!byShape) review.push(`Legend does not say what the ${outline.shape} tags`)
    if (byShape && byTable && byShape.target !== byTable) {
      review.push(`Legend says ${byShape.target}, schedule says ${byTable}`)
    }
    if (!category) category = "unknown_symbol"
    if (category === "keynote" || category === "grid" || category === "revision" || category === "reference" || category === "room") continue

    const tagBox = outline ?? t
    if (outline) outlines.push(outline)
    const frame = frameAround(read, tagBox)
    const box = frame ?? grow(tagBox, 2.5)
    if (!frame) review.push("Element bounds estimated from the tag")

    elements.push({
      id: `v-${elements.length}`,
      category,
      tag: t.text,
      meaning: term?.meaning ?? "",
      box,
      expectedUnits: typeof term?.attrs.units === "number" ? term.attrs.units : undefined,
      substrate: typeof term?.attrs.substrate === "string" ? term.attrs.substrate : undefined,
      shape: outline?.shape,
      review,
      source: "vector",
    })
  }
  return { elements, outlines }
}

function grow(b: Box, k: number): Box {
  const w = (b.x1 - b.x0) * (k - 1) / 2
  const h = (b.y1 - b.y0) * (k - 1) / 2
  return { x0: b.x0 - w, y0: b.y0 - h, x1: b.x1 + w, y1: b.y1 + h }
}

/**
 * A caixa da janela ou porta em volta da tag: os batentes. Linha horizontal não
 * serve de limite, porque siding é horizontal e passa por todo lado; batente é
 * vertical, cobre a altura da tag e é mais alto que ela.
 */
function frameAround(read: VectorRead, tag: Box): Box | null {
  const cy = (tag.y0 + tag.y1) / 2
  const th = tag.y1 - tag.y0
  const reach = th * 14
  let left: { x: number; y0: number; y1: number } | null = null
  let right: { x: number; y0: number; y1: number } | null = null
  for (const s of read.segs) {
    if (Math.abs(s.x1 - s.x2) > 0.3) continue
    const y0 = Math.min(s.y1, s.y2)
    const y1 = Math.max(s.y1, s.y2)
    if (y0 > cy || y1 < cy || y1 - y0 < th * 1.6) continue
    const x = s.x1
    if (x < tag.x0 && tag.x0 - x < reach && (!left || x > left.x)) left = { x, y0, y1 }
    if (x > tag.x1 && x - tag.x1 < reach && (!right || x < right.x)) right = { x, y0, y1 }
  }
  if (!left || !right) return null

  // A tag de três unidades fica na do meio, e os batentes mais próximos são os
  // dela. As vizinhas têm batentes da mesma altura logo ao lado: a caixa cresce
  // enquanto houver um, e para no primeiro vão maior que uma unidade.
  const y0 = Math.min(left.y0, right.y0)
  const y1 = Math.max(left.y1, right.y1)
  const h = y1 - y0
  const unit = right.x - left.x
  const jambs = read.segs
    .filter(s => Math.abs(s.x1 - s.x2) <= 0.3)
    .map(s => ({ x: s.x1, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2) }))
    .filter(j => Math.abs(j.y0 - y0) < h * 0.15 && Math.abs(j.y1 - y1) < h * 0.15)
    .map(j => j.x)
    .sort((a, b) => a - b)
  let x0 = left.x
  let x1 = right.x
  for (let moved = true; moved;) {
    moved = false
    const nextLeft = jambs.filter(x => x < x0 && x0 - x <= unit * 1.2).at(0)
    if (nextLeft !== undefined && nextLeft < x0 - 0.3) { x0 = nextLeft; moved = true }
    const nextRight = jambs.filter(x => x > x1 && x - x1 <= unit * 1.2).at(-1)
    if (nextRight !== undefined && nextRight > x1 + 0.3) { x1 = nextRight; moved = true }
  }
  return { x0, y0, x1, y1 }
}

const KIND_OF: Record<string, TraceKind> = {
  window: "window", door: "door", opening: "opening", wall: "wall", slope: "slope", roof: "slope",
}

/** Traços para o papel vegetal: o contorno de cada elemento e as linhas da área. */
export function strokesFrom(
  elements: TakeoffElement[],
  lines: { kind: string; x1: number; y1: number; x2: number; y2: number }[],
  area: AreaPt,
  pxPerPt: number,
): Stroke[] {
  const out: Stroke[] = []
  const px = (x: number) => (x - area.x) * pxPerPt
  const py = (y: number) => (y - area.y) * pxPerPt
  for (const l of lines) {
    out.push({
      id: out.length, kind: KIND_OF[l.kind] ?? "line",
      x1: px(l.x1), y1: py(l.y1), x2: px(l.x2), y2: py(l.y2), thick: 2,
    })
  }
  for (const e of elements) {
    const kind = KIND_OF[e.category] ?? "opening"
    const { x0, y0, x1, y1 } = e.box
    const sides: [number, number, number, number][] = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]
    for (const [a, b, c, d] of sides) {
      out.push({ id: out.length, kind, x1: px(a), y1: py(b), x2: px(c), y2: py(d), thick: 3 })
    }
  }
  return out
}

/**
 * As linhas do vetor que valem decalque: parede é traço grosso e longo, telhado
 * é diagonal longa. Pedaço curto é hachura, letra ou contorno de tag, e fica
 * de fora para o decalque não virar a textura da pedra.
 */
export function vectorLines(read: VectorRead, area: AreaPt, outlines: Box[]) {
  const inside = (x: number, y: number) =>
    x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h
  const inOutline = (x: number, y: number) => outlines.some(o => x >= o.x0 - 1 && x <= o.x1 + 1 && y >= o.y0 - 1 && y <= o.y1 + 1)

  const candidates = read.segs.filter(s => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
    return len >= 24 && (inside(s.x1, s.y1) || inside(s.x2, s.y2)) && !(inOutline(s.x1, s.y1) && inOutline(s.x2, s.y2))
  })
  const widths = candidates.map(s => s.width).sort((a, b) => a - b)
  const median = widths[Math.floor(widths.length / 2)] ?? 1

  const all = candidates
    .map(s => {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
      const angle = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180
      const diagonal = angle > 15 && angle < 75 || angle > 105 && angle < 165
      const kind = s.width >= median * 2.2 ? "wall" : diagonal && len >= 36 ? "slope" : "line"
      return { kind, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, len }
    })
    .sort((a, b) => b.len - a.len)
  // Parede e telhado entram todos; linha comum, só as mais longas. Siding e
  // pedra são milhares de traços iguais e cobririam o que se quer conferir.
  return [...all.filter(l => l.kind !== "line"), ...all.filter(l => l.kind === "line").slice(0, 400)]
}

// "9'-3"X5'-4"" da tabela, em pés: largura e altura.
function sizeInFeet(size: unknown): [number, number] | null {
  if (typeof size !== "string") return null
  const side = (s: string) => {
    // "2'-21/2"" é 2 pés e 2 1/2 polegadas: a meia polegada vem colada.
    const m = s.match(/^(\d+)'-?(\d*?)(1\/2)?"?$/)
    return m ? Number(m[1]) + (Number(m[2] || 0) + (m[3] ? 0.5 : 0)) / 12 : NaN
  }
  const [w, h] = size.replace(/\s/g, "").split(/[xX]/).map(side)
  return Number.isFinite(w) && Number.isFinite(h) ? [w, h] : null
}

/**
 * A conferência que vale para as duas leituras: tag contra tabela, unidade
 * contra tag e, com a escala da folha, o tamanho desenhado contra o tamanho da
 * tabela.
 */
export function crossCheck(elements: TakeoffElement[], dic: Dictionary, ptPerFt: number | null): TakeoffElement[] {
  return elements.map(e => {
    const review = [...e.review]
    const term = e.tag ? dic.tags.get(e.tag.toUpperCase()) : undefined
    const expected = e.expectedUnits ?? (typeof term?.attrs.units === "number" ? term.attrs.units : undefined)
    if (e.source === "ai" && e.tag && !term) review.push("Tag not in the schedules")
    if (expected && e.units && e.units !== expected) review.push(`Tag says ${expected} units, drawing shows ${e.units}`)
    if (e.confidence !== undefined && e.confidence < 0.6) review.push("Low confidence")
    const size = sizeInFeet(term?.attrs.size)
    if (size && ptPerFt) {
      const w = (e.box.x1 - e.box.x0) / ptPerFt
      const h = (e.box.y1 - e.box.y0) / ptPerFt
      const off = (a: number, b: number) => Math.abs(a - b) / b > 0.3
      if (off(w, size[0]) || off(h, size[1])) {
        review.push(`Drawn ${w.toFixed(1)}x${h.toFixed(1)} ft, schedule says ${size[0].toFixed(1)}x${size[1].toFixed(1)} ft`)
      }
    }
    return {
      ...e,
      meaning: e.meaning || term?.meaning || "",
      expectedUnits: expected,
      review: Array.from(new Set(review)),
    }
  })
}
