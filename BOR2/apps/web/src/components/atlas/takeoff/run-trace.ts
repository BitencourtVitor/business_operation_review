"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import type { Stroke, TraceInput } from "./trace"

export interface AreaPt {
  x: number
  y: number
  w: number
  h: number
}

export interface Crop {
  /** A imagem que vai para baixo do papel vegetal, reduzida ao que a tela mostra. */
  url: string
  width: number
  height: number
  pxPerPt: number
  gray: Uint8Array
}

// O recorte sai do vetor na maior resolução que o navegador aguenta desenhar
// num canvas, e não da imagem que está na tela: a leitura precisa de cada fio
// com a espessura que ele tem no papel. O teto é do navegador (16.384 px de
// lado) e da memória (40 MP, que já são 160 MB de RGBA enquanto se lê).
const MAX_SIDE = 16384
const MAX_PIXELS = 40_000_000
// Acima de 1.200 dpi não aparece mais nada: o fio mais fino do desenho já tem
// vários pixels.
const MAX_SCALE = 1200 / 72
// A imagem de fundo não precisa da resolução da leitura: passar disso só
// atrasa a troca para o decalque sem mudar o que o olho vê.
const DISPLAY_SIDE = 4096

export async function renderCrop(pdfUrl: string, pageIndex: number, area: AreaPt): Promise<Crop> {
  const pdf = await loadPdf(pdfUrl)
  const page = await pdf.getPage(pageIndex + 1)
  const scale = Math.min(
    MAX_SCALE,
    MAX_SIDE / Math.max(area.w, area.h),
    Math.sqrt(MAX_PIXELS / (area.w * area.h)),
  )
  // O tipo local do pdf.js só declara a escala; o deslocamento existe e é ele que
  // recorta o trecho sem desenhar a folha inteira nessa resolução.
  const viewport = (page as unknown as {
    getViewport: (o: { scale: number; offsetX: number; offsetY: number }) => unknown
  }).getViewport({ scale, offsetX: -area.x * scale, offsetY: -area.y * scale })

  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(area.w * scale)
  canvas.height = Math.floor(area.h * scale)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("canvas")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise

  // Luminância lida em faixas: um getImageData do recorte inteiro seria outro
  // bloco de 160 MB ao lado do canvas.
  const gray = new Uint8Array(canvas.width * canvas.height)
  const BAND = 1024
  for (let y0 = 0; y0 < canvas.height; y0 += BAND) {
    const bh = Math.min(BAND, canvas.height - y0)
    const rgba = ctx.getImageData(0, y0, canvas.width, bh).data
    for (let i = 0, p = 0, o = y0 * canvas.width; i < canvas.width * bh; i++, p += 4, o++) {
      gray[o] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8
    }
  }

  const width = canvas.width
  const height = canvas.height
  const k = Math.min(1, DISPLAY_SIDE / Math.max(canvas.width, canvas.height))
  const shown = document.createElement("canvas")
  shown.width = Math.round(canvas.width * k)
  shown.height = Math.round(canvas.height * k)
  const sctx = shown.getContext("2d")
  if (!sctx) throw new Error("canvas")
  sctx.imageSmoothingQuality = "high"
  sctx.drawImage(canvas, 0, 0, shown.width, shown.height)
  canvas.width = 0
  canvas.height = 0
  const blob = await new Promise<Blob | null>(resolve => shown.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("blob")

  return {
    url: URL.createObjectURL(blob),
    width,
    height,
    pxPerPt: scale,
    gray,
  }
}

/** A leitura roda num worker, para a varredura na tela não travar enquanto ela pensa. */
export function runTrace(input: TraceInput): Promise<Stroke[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" })
    } catch {
      import("./trace").then(m => resolve(m.trace(input)), reject)
      return
    }
    worker.onmessage = (event: MessageEvent<Stroke[]>) => {
      resolve(event.data)
      worker.terminate()
    }
    worker.onerror = event => {
      worker.terminate()
      import("./trace").then(m => resolve(m.trace(input)), () => reject(event))
    }
    // Cópia, e não transferência: se o worker falhar, a leitura cai para esta
    // aba e ainda precisa dos pixels.
    worker.postMessage(input)
  })
}
