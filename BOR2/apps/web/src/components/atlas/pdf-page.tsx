"use client"

import { useEffect, useRef, useState } from "react"

// pdf.js roda no cliente e traz um worker próprio. O import é dinâmico para o
// bundle do servidor não tentar carregá-lo, e o documento fica em cache por URL:
// um set de 51 páginas é um download só, e trocar de folha não baixa de novo.
type PDFDocument = {
  numPages: number
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number }
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void }
  }>
}

const cache = new Map<string, Promise<PDFDocument>>()

export function loadPdf(url: string): Promise<PDFDocument> {
  const hit = cache.get(url)
  if (hit) return hit

  const promise = (async () => {
    const pdfjs = await import("pdfjs-dist")
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString()
    return pdfjs.getDocument({ url }).promise as unknown as PDFDocument
  })()

  cache.set(url, promise)
  return promise
}

/**
 * Contagem de páginas e dimensão da folha, lidas no navegador antes do upload.
 *
 * É o mínimo estrutural para a folha existir: uma linha por página, com o
 * tamanho real da prancha. **Não** é a fragmentação do AT-10 — ninguém lê
 * carimbo aqui, e número, disciplina e revisão continuam em branco esperando a
 * regra. O que isto entrega é o esqueleto sobre o qual a regra vai escrever.
 */
export async function readPdfOutline(file: File): Promise<{
  pageCount: number
  width: number
  height: number
}> {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  return { pageCount: pdf.numPages, width: viewport.width, height: viewport.height }
}

/**
 * Uma página do PDF renderizada sob demanda, a partir do original.
 *
 * É a resposta ao AT-13 pelo lado do cliente: não existe cópia cortada nem
 * imagem pré-gerada por folha — o navegador desenha a página que está sendo
 * olhada, na escala em que está sendo olhada. Folha que ninguém abre nunca
 * custa byte nenhum.
 */
export function PdfPage({ url, pageIndex, scale = 1.5, onSize }: {
  url: string
  pageIndex: number
  scale?: number
  onSize?: (size: { width: number; height: number }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null

    ;(async () => {
      try {
        setState("loading")
        const pdf = await loadPdf(url)
        const page = await pdf.getPage(pageIndex + 1)
        if (cancelled) return

        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        onSize?.({ width: viewport.width, height: viewport.height })

        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const render = page.render({ canvasContext: ctx, viewport })
        task = render
        await render.promise
        if (!cancelled) setState("ready")
      } catch {
        if (!cancelled) setState("error")
      }
    })()

    return () => {
      cancelled = true
      // Trocar de folha no meio do desenho é o caso normal em tablet; sem
      // cancelar, o render antigo termina por cima do novo.
      task?.cancel()
    }
  }, [url, pageIndex, scale, onSize])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      {state !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
          {state === "loading" ? "Rendering sheet…" : "Could not render this page"}
        </div>
      )}
    </div>
  )
}
