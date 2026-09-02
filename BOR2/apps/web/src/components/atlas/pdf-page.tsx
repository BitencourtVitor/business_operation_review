"use client"

import { useEffect, useRef, useState } from "react"

// pdf.js roda no cliente e traz um worker próprio. O import é dinâmico para o
// bundle do servidor não tentar carregá-lo, e o documento fica em cache por URL:
// um set de 51 páginas é um download só, e trocar de folha não baixa de novo.
type PDFDocument = {
  numPages: number
  destroy?: () => Promise<void>
  getData: () => Promise<Uint8Array>
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number }
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void }
  }>
}

// Janela de três documentos: a página aberta, a anterior e a seguinte. Passar
// da quarta significa que o leitor andou, e o que ficou para trás não volta a
// ser aberto tão cedo — segurar tudo em memória é como abrir o set inteiro de
// novo, só que devagar.
const CACHE_LIMIT = 3
const cache = new Map<string, Promise<PDFDocument>>()

function keep(url: string, doc: Promise<PDFDocument>) {
  // Map em JS preserva ordem de inserção: reinserir move para o fim, e o
  // primeiro da fila é sempre o mais antigo sem uso.
  cache.delete(url)
  cache.set(url, doc)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    const stale = cache.get(oldest)
    cache.delete(oldest)
    // `destroy()` devolve a memória do worker; sem isso o pdf.js segura o
    // arquivo inteiro mesmo depois de a referência sumir daqui.
    void stale?.then(d => d.destroy?.()).catch(() => {})
  }
}

export function loadPdf(url: string): Promise<PDFDocument> {
  const hit = cache.get(url)
  if (hit) {
    keep(url, hit)
    return hit
  }

  const promise = (async () => {
    const pdfjs = await import("pdfjs-dist")
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString()
    return pdfjs.getDocument({ url }).promise as unknown as PDFDocument
  })()

  keep(url, promise)
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
 * Salva um plano como PDF de uma página só.
 *
 * A extração é no navegador, sobre os bytes que o pdf.js já tem em memória — o
 * set não é baixado de novo, e o original no bucket não é tocado. O que sai é o
 * vetor da página, não uma imagem dela: dá para imprimir em escala e medir em
 * cima.
 */
export async function downloadPlan(url: string, pageIndex: number, fileName: string) {
  const [{ PDFDocument }, pdf] = await Promise.all([import("pdf-lib"), loadPdf(url)])
  const source = await PDFDocument.load(await pdf.getData())
  const out = await PDFDocument.create()
  const [page] = await out.copyPages(source, [pageIndex])
  out.addPage(page)

  // `slice()` devolve um ArrayBuffer próprio: o Blob não aceita a view que o
  // pdf-lib entrega, e copiar uma página é barato.
  const bytes = await out.save()
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" })
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = href
  link.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`
  link.click()
  URL.revokeObjectURL(href)
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
