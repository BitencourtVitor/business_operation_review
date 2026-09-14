"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { takeoffService, type TakeoffAIText, type TakeoffAIUsage } from "@/services/atlas-takeoff.service"
import type { AreaPt } from "./run-trace"
import type { Box, TakeoffElement } from "./takeoff-model"
import type { VectorRead } from "./vector-read"

// O takeoff pela IA (ATL-103).
//
// A resolução que o modelo enxerga é a do pedaço que ele recebe, e não a da
// folha: a imagem é reduzida a 3072 px no maior lado antes de virar tokens. Por
// isso o trecho marcado é cortado em pedaços de até dez polegadas, com uma de
// sobra para o vizinho, e cada pedaço vai numa chamada. A sobra garante que
// nenhuma janela fique cortada ao meio em todos os pedaços em que aparece.

const TILE_PT = 720
const OVERLAP_PT = 72
const TILE_PX = 3072
const MAX_SCALE = 1200 / 72
const PARALLEL = 2

export interface AITakeoffResult {
  elements: TakeoffElement[]
  lines: { kind: string; x1: number; y1: number; x2: number; y2: number }[]
  usage: TakeoffAIUsage & { tiles: number }
  model: string
}

export function tilesFor(area: AreaPt): AreaPt[] {
  const axis = (start: number, size: number) => {
    if (size <= TILE_PT) return [[start, size]]
    const step = TILE_PT - OVERLAP_PT
    const n = Math.ceil((size - OVERLAP_PT) / step)
    const len = (size + OVERLAP_PT * (n - 1)) / n
    return Array.from({ length: n }, (_, i) => [start + i * (len - OVERLAP_PT), len])
  }
  const out: AreaPt[] = []
  for (const [y, h] of axis(area.y, area.h)) {
    for (const [x, w] of axis(area.x, area.w)) out.push({ x, y, w, h })
  }
  return out
}

async function renderTile(pdfUrl: string, pageIndex: number, tile: AreaPt): Promise<string> {
  const pdf = await loadPdf(pdfUrl)
  const page = await pdf.getPage(pageIndex + 1)
  const scale = Math.min(MAX_SCALE, TILE_PX / Math.max(tile.w, tile.h))
  const viewport = (page as unknown as {
    getViewport: (o: { scale: number; offsetX: number; offsetY: number }) => unknown
  }).getViewport({ scale, offsetX: -tile.x * scale, offsetY: -tile.y * scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(tile.w * scale)
  canvas.height = Math.round(tile.h * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  const data = canvas.toDataURL("image/png")
  canvas.width = 0
  canvas.height = 0
  return data.slice(data.indexOf(",") + 1)
}

function textsIn(read: VectorRead, tile: AreaPt): TakeoffAIText[] {
  const nx = (x: number) => Math.round(((x - tile.x) / tile.w) * 1000)
  const ny = (y: number) => Math.round(((y - tile.y) / tile.h) * 1000)
  return read.texts
    .filter(t => t.x1 >= tile.x && t.x0 <= tile.x + tile.w && t.y1 >= tile.y && t.y0 <= tile.y + tile.h)
    .map(t => ({ text: t.text, box: [nx(t.x0), ny(t.y0), nx(t.x1), ny(t.y1)] as [number, number, number, number] }))
}

function iou(a: Box, b: Box) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  const inter = ix * iy
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter
  return union > 0 ? inter / union : 0
}

export async function aiTakeoff(opts: {
  sheetId: string
  pdfUrl: string
  pageIndex: number
  area: AreaPt
  read: VectorRead
  onProgress?: (done: number, total: number) => void
}): Promise<AITakeoffResult> {
  const tiles = tilesFor(opts.area)
  const results: { tile: AreaPt; res: Awaited<ReturnType<typeof takeoffService.readTile>> }[] = []
  let done = 0
  opts.onProgress?.(0, tiles.length)

  const queue = [...tiles]
  const worker = async () => {
    for (let tile = queue.shift(); tile; tile = queue.shift()) {
      const image = await renderTile(opts.pdfUrl, opts.pageIndex, tile)
      const res = await takeoffService.readTile(opts.sheetId, {
        image, mime: "image/png", texts: textsIn(opts.read, tile), widthIn: tile.w / 72, heightIn: tile.h / 72,
      })
      results.push({ tile, res })
      opts.onProgress?.(++done, tiles.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, tiles.length) }, worker))

  const toPage = (tile: AreaPt, b: [number, number, number, number]): Box => ({
    x0: tile.x + (b[0] / 1000) * tile.w,
    y0: tile.y + (b[1] / 1000) * tile.h,
    x1: tile.x + (b[2] / 1000) * tile.w,
    y1: tile.y + (b[3] / 1000) * tile.h,
  })

  // Na sobra entre dois pedaços o mesmo elemento aparece duas vezes: fica o de
  // maior confiança, e com a caixa maior se um deles veio cortado pela borda.
  const elements: TakeoffElement[] = []
  const lines: AITakeoffResult["lines"] = []
  const usage = { input: 0, output: 0, thoughts: 0, costUsd: 0, tiles: tiles.length }
  let model = ""
  for (const { tile, res } of results) {
    model = res.model
    usage.input += res.usage.input
    usage.output += res.usage.output
    usage.thoughts += res.usage.thoughts
    usage.costUsd += res.usage.costUsd
    for (const l of res.lines ?? []) {
      const a = toPage(tile, [l.x1, l.y1, l.x2, l.y2])
      lines.push({ kind: l.kind, x1: a.x0, y1: a.y0, x2: a.x1, y2: a.y1 })
    }
    for (const e of res.elements ?? []) {
      const box = toPage(tile, e.box)
      const same = elements.find(o =>
        o.category === e.kind && (o.tag || "") === (e.tag || "") && iou(o.box, box) > 0.25)
      const candidate: TakeoffElement = {
        id: `ai-${elements.length}`,
        category: e.kind,
        tag: e.tag,
        meaning: e.label,
        box,
        units: e.units || undefined,
        substrate: e.substrate || undefined,
        confidence: e.confidence,
        review: [e.review ? e.reason || "Model asked for review" : "", e.kind === "unknown_symbol" ? e.reason : ""].filter(Boolean),
        source: "ai",
      }
      if (!same) {
        elements.push(candidate)
        continue
      }
      if ((candidate.confidence ?? 0) > (same.confidence ?? 0)) {
        Object.assign(same, { ...candidate, id: same.id })
      }
      same.box = {
        x0: Math.min(same.box.x0, box.x0), y0: Math.min(same.box.y0, box.y0),
        x1: Math.max(same.box.x1, box.x1), y1: Math.max(same.box.y1, box.y1),
      }
    }
  }
  return { elements, lines, usage, model }
}
