"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import type { AreaPt } from "./run-trace"

// A prancha lida como dado, e não como imagem (ATL-103).
//
// Cada linha, curva e texto do PDF sai daqui com posição exata em pontos de
// papel, origem no canto superior esquerdo. É o inventário da folha: nada que
// está no arquivo fica fora, porque ninguém precisa enxergar nada. O que o
// inventário não diz é o significado; esse vem do dicionário do set.

export type Pt = [number, number]

export interface VSeg {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Espessura do traço no papel, em pontos. */
  width: number
  /** Qual subcaminho desenhou o segmento, para saber que ele é contorno de tag. */
  path: number
}

export interface VPath {
  id: number
  lines: number
  curves: number
  closed: boolean
  stroked: boolean
  /** Vértices de reta, na ordem, para medir a forma. */
  corners: Pt[]
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface VText {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface VectorRead {
  paths: VPath[]
  segs: VSeg[]
  texts: VText[]
  pageWidth: number
  pageHeight: number
}

type Matrix = [number, number, number, number, number, number]

function mul(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

function apply(m: Matrix, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

// Os códigos do desenho de caminho do pdf.js (DrawOPS) e os operadores que
// importam aqui. Fixos nesta versão (6.3); ler do módulo evitaria esquecer de
// conferir numa atualização.
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 }

export interface PdfPageLike {
  getViewport: (o: { scale: number }) => { width: number; height: number; transform: number[] }
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>
  getTextContent: () => Promise<{ items: { str?: string; transform?: number[]; width?: number; height?: number }[] }>
}

/**
 * Lê caminhos e textos da página. Com `area`, só o que toca o trecho (com uma
 * folga) entra: a hachura de pedra de uma fachada inteira passa de cem mil
 * segmentos, e o que interessa é o pedaço marcado.
 */
export async function readVectors(pdfUrl: string, pageIndex: number, area?: AreaPt): Promise<VectorRead> {
  const pdfjs = await import("pdfjs-dist")
  const pdf = await loadPdf(pdfUrl)
  const page = (await pdf.getPage(pageIndex + 1)) as unknown as PdfPageLike
  return readPageVectors(page, pdfjs.OPS as unknown as Record<string, number>, area)
}

export async function readPageVectors(page: PdfPageLike, OPS: Record<string, number>, area?: AreaPt): Promise<VectorRead> {
  const viewport = page.getViewport({ scale: 1 })
  const base = viewport.transform as Matrix

  const margin = area ? Math.max(area.w, area.h) * 0.05 + 12 : 0
  const inArea = (x0: number, y0: number, x1: number, y1: number) =>
    !area || (x1 >= area.x - margin && x0 <= area.x + area.w + margin && y1 >= area.y - margin && y0 <= area.y + area.h + margin)

  const { fnArray, argsArray } = await page.getOperatorList()
  const paths: VPath[] = []
  const segs: VSeg[] = []
  const stack: { ctm: Matrix; width: number }[] = []
  let ctm = base
  let lineWidth = 1

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[]
    if (fn === OPS.save) {
      stack.push({ ctm, width: lineWidth })
    } else if (fn === OPS.restore) {
      const s = stack.pop()
      if (s) { ctm = s.ctm; lineWidth = s.width }
    } else if (fn === OPS.transform) {
      ctm = mul(ctm, args as Matrix)
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, width: lineWidth })
      const m = args?.[0] as Matrix | null
      if (m && m.length === 6) ctm = mul(ctm, m)
    } else if (fn === OPS.paintFormXObjectEnd) {
      const s = stack.pop()
      if (s) { ctm = s.ctm; lineWidth = s.width }
    } else if (fn === OPS.setLineWidth) {
      lineWidth = Number(args?.[0]) || 0
    } else if (fn === OPS.constructPath) {
      const op = args?.[0] as number
      if (op === OPS.endPath) continue
      const data = (args?.[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined
      if (!data) continue
      const stroked = op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke
      const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1
      const width = Math.max(lineWidth, 0.1) * scale
      readPath(data, ctm, width, stroked, paths, segs, inArea)
    }
  }

  const texts: VText[] = []
  const content = await page.getTextContent()
  for (const item of content.items) {
    const str = item.str?.trim()
    if (!str || !item.transform) continue
    const t = mul(base, item.transform as Matrix)
    const h = Math.hypot(t[2], t[3]) || Math.abs(item.height ?? 0)
    const sx = Math.hypot(item.transform[0], item.transform[1]) || 1
    const w = (item.width ?? 0) * (Math.hypot(t[0], t[1]) / sx)
    const x0 = t[4]
    const y1 = t[5]
    // Uma corrida de texto pode trazer várias palavras ("A3T  SH  35 SF"): cada
    // palavra recebe seu pedaço da largura, em proporção às letras.
    const words = str.split(/\s+/)
    const total = str.length || 1
    let cursor = 0
    for (const word of words) {
      const start = str.indexOf(word, cursor)
      cursor = start + word.length
      const wx0 = x0 + (w * start) / total
      const wx1 = x0 + (w * cursor) / total
      if (inArea(wx0, y1 - h, wx1, y1)) texts.push({ text: word, x0: wx0, y0: y1 - h, x1: wx1, y1 })
    }
  }

  return { paths, segs, texts, pageWidth: viewport.width, pageHeight: viewport.height }
}

function readPath(
  data: ArrayLike<number>, ctm: Matrix, width: number, stroked: boolean,
  paths: VPath[], segs: VSeg[],
  inArea: (x0: number, y0: number, x1: number, y1: number) => boolean,
) {
  let cur: { p: VPath; start: Pt; last: Pt; segs: VSeg[] } | null = null

  const finish = () => {
    if (!cur) return
    const { p } = cur
    if ((p.lines || p.curves) && inArea(p.x0, p.y0, p.x1, p.y1)) {
      p.id = paths.length
      for (const s of cur.segs) s.path = p.id
      paths.push(p)
      segs.push(...cur.segs)
    }
    cur = null
  }
  const grow = (x: number, y: number) => {
    if (!cur) return
    cur.p.x0 = Math.min(cur.p.x0, x); cur.p.y0 = Math.min(cur.p.y0, y)
    cur.p.x1 = Math.max(cur.p.x1, x); cur.p.y1 = Math.max(cur.p.y1, y)
  }
  const begin = (pt: Pt) => {
    finish()
    cur = {
      p: { id: -1, lines: 0, curves: 0, closed: false, stroked, corners: [pt], x0: pt[0], y0: pt[1], x1: pt[0], y1: pt[1] },
      start: pt, last: pt, segs: [],
    }
  }
  const line = (to: Pt) => {
    if (!cur) begin(to)
    const c = cur!
    if (Math.hypot(to[0] - c.last[0], to[1] - c.last[1]) < 1e-3) return
    c.segs.push({ x1: c.last[0], y1: c.last[1], x2: to[0], y2: to[1], width, path: -1 })
    c.p.lines++
    c.p.corners.push(to)
    c.last = to
    grow(to[0], to[1])
  }

  for (let i = 0; i < data.length;) {
    const cmd = data[i++]
    if (cmd === DRAW.moveTo) {
      begin(apply(ctm, data[i++], data[i++]))
    } else if (cmd === DRAW.lineTo) {
      line(apply(ctm, data[i++], data[i++]))
    } else if (cmd === DRAW.curveTo || cmd === DRAW.quadraticCurveTo) {
      const n = cmd === DRAW.curveTo ? 3 : 2
      const pts: Pt[] = []
      for (let k = 0; k < n; k++) pts.push(apply(ctm, data[i++], data[i++]))
      const end = pts[pts.length - 1]
      if (!cur) begin(end)
      const c = cur!
      // A curva entra no inventário como três cordas: basta para desenhar o
      // arco da porta e para medir a caixa, sem virar polígono.
      const p0 = c.last
      for (let k = 1; k <= 3; k++) {
        const t = k / 3
        const q = bezier(p0, pts, t)
        c.segs.push({ x1: c.last[0], y1: c.last[1], x2: q[0], y2: q[1], width, path: -1 })
        c.last = q
        grow(q[0], q[1])
      }
      for (const q of pts) grow(q[0], q[1])
      c.p.curves++
    } else if (cmd === DRAW.closePath) {
      if (cur) {
        const c: { p: VPath; start: Pt; last: Pt; segs: VSeg[] } = cur
        if (Math.hypot(c.start[0] - c.last[0], c.start[1] - c.last[1]) > 1e-3) {
          if (c.p.curves) {
            c.segs.push({ x1: c.last[0], y1: c.last[1], x2: c.start[0], y2: c.start[1], width, path: -1 })
            c.last = c.start
          } else {
            line(c.start)
          }
        }
        c.p.closed = true
      }
    } else {
      break
    }
  }
  finish()
}

function bezier(p0: Pt, pts: Pt[], t: number): Pt {
  if (pts.length === 2) {
    const [c, e] = pts
    const u = 1 - t
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * e[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * e[1]]
  }
  const [c1, c2, e] = pts
  const u = 1 - t
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
  ]
}

export type TagShape = "hexagon" | "ellipse" | "circle" | "rectangle" | "diamond" | "triangle"

/** A forma de um contorno fechado: é ela que diz, pela legenda do set, o que a tag marca. */
export function shapeOf(p: VPath): TagShape | null {
  const w = p.x1 - p.x0
  const h = p.y1 - p.y0
  if (w <= 0 || h <= 0) return null
  if (p.curves >= 2 && p.lines <= 2) {
    const ratio = Math.max(w, h) / Math.min(w, h)
    return ratio < 1.2 ? "circle" : "ellipse"
  }
  if (p.curves) return null
  const pts = dedupe(p.corners)
  const n = pts.length
  if (n === 6) return "hexagon"
  if (n === 3) return "triangle"
  if (n === 4) {
    const axis = pts.every((q, i) => {
      const r = pts[(i + 1) % n]
      return Math.abs(q[0] - r[0]) < 0.5 || Math.abs(q[1] - r[1]) < 0.5
    })
    return axis ? "rectangle" : "diamond"
  }
  return null
}

// O último vértice repete o primeiro quando o caminho fecha por reta: sem tirar,
// o hexágono conta sete cantos.
function dedupe(corners: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const q of corners) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.3) out.push(q)
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.3) out.pop()
  return out
}

export interface TagOutline {
  shape: TagShape
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * A forma desenhada em volta de um texto: o hexágono de "A3T", a elipse de "J".
 *
 * O CAD não exporta a forma como um caminho: o hexágono chega como seis linhas
 * soltas, a elipse como dezenas de pedacinhos, e atrás do texto vem um
 * retângulo branco preenchido que apaga o que passa por baixo. Então a leitura
 * usa essa máscara (ou, sem ela, uma janela em volta do texto) como região,
 * encadeia os segmentos que cabem nela pelas pontas e conta as arestas depois de
 * juntar as que seguem na mesma direção.
 */
export function tagOutline(read: VectorRead, box: { x0: number; y0: number; x1: number; y1: number }): TagOutline | null {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const tw = Math.max(box.x1 - box.x0, 1)
  const th = Math.max(box.y1 - box.y0, 1)

  // Um caminho de verdade, fechado, também vale: nem todo PDF vem do mesmo CAD.
  let region: { x0: number; y0: number; x1: number; y1: number } | null = null
  let bestArea = Infinity
  for (const p of read.paths) {
    if (p.x0 > cx || p.x1 < cx || p.y0 > cy || p.y1 < cy) continue
    const w = p.x1 - p.x0
    const h = p.y1 - p.y0
    if (w < tw * 0.9 || h < th * 0.9 || w * h > tw * th * 30) continue
    if (p.stroked && p.closed) {
      const shape = shapeOf(p)
      if (shape && w * h < bestArea) return { shape, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 }
    }
    if (!p.stroked && p.closed && p.lines === 4 && w * h < bestArea) {
      region = { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 }
      bestArea = w * h
    }
  }
  const pad = region ? 1 : Math.max(th * 1.2, tw * 0.6)
  const r = region ?? { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }
  const rx0 = r.x0 - pad, ry0 = r.y0 - pad, rx1 = r.x1 + pad, ry1 = r.y1 + pad
  const inside = (x: number, y: number) => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1

  const segs = read.segs.filter(sg => read.paths[sg.path]?.stroked && inside(sg.x1, sg.y1) && inside(sg.x2, sg.y2))
  if (segs.length < 3) return null

  // Encadeia pelas pontas: cada ponta arredondada a meio ponto vira um nó.
  const key = (x: number, y: number) => `${Math.round(x * 2)}:${Math.round(y * 2)}`
  const byNode = new Map<string, number[]>()
  segs.forEach((sg, k) => {
    for (const n of [key(sg.x1, sg.y1), key(sg.x2, sg.y2)]) byNode.set(n, [...(byNode.get(n) ?? []), k])
  })
  const used = new Uint8Array(segs.length)
  let bestChain: Pt[] = []
  let bestClosed = false
  for (let k0 = 0; k0 < segs.length; k0++) {
    if (used[k0]) continue
    used[k0] = 1
    const chain: Pt[] = [[segs[k0].x1, segs[k0].y1], [segs[k0].x2, segs[k0].y2]]
    for (let grow = true; grow;) {
      grow = false
      const tail = chain[chain.length - 1]
      for (const k of byNode.get(key(tail[0], tail[1])) ?? []) {
        if (used[k]) continue
        used[k] = 1
        const sg = segs[k]
        const forward = key(sg.x1, sg.y1) === key(tail[0], tail[1])
        chain.push(forward ? [sg.x2, sg.y2] : [sg.x1, sg.y1])
        grow = true
        break
      }
    }
    if (chain.length > bestChain.length) {
      bestChain = chain
      const a = chain[0], b = chain[chain.length - 1]
      bestClosed = key(a[0], a[1]) === key(b[0], b[1])
    }
  }
  if (bestChain.length < 4 || !bestClosed) return null

  const xs = bestChain.map(q => q[0])
  const ys = bestChain.map(q => q[1])
  const outline = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  if (outline.x0 > cx || outline.x1 < cx || outline.y0 > cy || outline.y1 < cy) return null

  // Arestas: segmentos seguidos na mesma direção (menos de 12 graus) são uma só.
  const pts = bestChain.slice(0, -1)
  const n = pts.length
  const dir = (i: number) => {
    const a = pts[i], b = pts[(i + 1) % n]
    return Math.atan2(b[1] - a[1], b[0] - a[0])
  }
  let edges = 0
  for (let i = 0; i < n; i++) {
    let d = Math.abs(dir(i) - dir((i + n - 1) % n))
    if (d > Math.PI) d = 2 * Math.PI - d
    if (d > (12 * Math.PI) / 180) edges++
  }
  const w = outline.x1 - outline.x0
  const h = outline.y1 - outline.y0
  let shape: TagShape | null = null
  if (edges >= 8) shape = Math.max(w, h) / Math.min(w, h) < 1.2 ? "circle" : "ellipse"
  else if (edges === 6) shape = "hexagon"
  else if (edges === 3) shape = "triangle"
  else if (edges === 4) {
    const axis = pts.every((a, i) => {
      const b = pts[(i + 1) % n]
      return Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5
    })
    shape = axis ? "rectangle" : "diamond"
  }
  return shape ? { shape, ...outline } : null
}
