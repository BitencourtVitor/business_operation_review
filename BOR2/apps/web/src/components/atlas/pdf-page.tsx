"use client"

import { useEffect, useRef, useState } from "react"

import { depurar } from "@/lib/depurar"

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
    return pdfjs.getDocument({
      url,
      // Onde ficam os arquivos de apoio publicados pelo scripts/copy-pdfjs-assets.mjs.
      // Sem isto o decodificador de imagem escaneada (JBIG2) não inicializa e a
      // folha fica esperando uma imagem que nunca chega (ATL-112).
      wasmUrl: "/pdfjs/wasm/",
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
    }).promise as unknown as PDFDocument
  })()

  keep(url, promise)
  return promise
}

/**
 * Traz o pdf.js e o worker dele para o cache do aparelho, sem abrir documento.
 *
 * Os dois carregam sob demanda, na primeira prancha aberta. Quem baixa a pasta
 * e perde o sinal antes de abrir alguma teria o arquivo no disco e nada que o
 * desenhasse.
 */
export async function aquecerPdf(): Promise<void> {
  try {
    await import("pdfjs-dist")
    await fetch(new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString())
    // O decodificador de escaneado também: sem ele guardado, a pasta baixada
    // abre sem rede e a prancha escaneada não desenha.
    await Promise.all([
      fetch("/pdfjs/wasm/jbig2.wasm"),
      fetch("/pdfjs/wasm/openjpeg.wasm"),
    ])
  } catch {
    // Sem rede, ou já guardado. Adiantamento não vira erro.
  }
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
  const pdf = await pdfjs.getDocument({
    data,
    // Onde ficam os arquivos de apoio publicados pelo scripts/copy-pdfjs-assets.mjs.
    // Sem isto o decodificador de imagem escaneada (JBIG2) não inicializa e a
    // folha fica esperando uma imagem que nunca chega (ATL-112).
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
  }).promise
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
  return downloadPlans(url, [pageIndex], fileName)
}

/**
 * Salva um trecho do set como **um** PDF.
 *
 * Onze folhas escolhidas viravam onze downloads, uma janela de salvar para cada
 * uma, e no fim onze arquivos soltos na pasta de downloads para a pessoa juntar
 * à mão. O que ela pediu foi o trecho, e trecho é um documento.
 *
 * A ordem é a das páginas no arquivo, e não a da escolha: um caderno de obra se
 * lê na ordem em que foi impresso.
 */
export async function downloadPlans(url: string, pageIndexes: number[], fileName: string) {
  if (!pageIndexes.length) return
  const paginas = [...new Set(pageIndexes)].sort((a, b) => a - b)
  const [{ PDFDocument }, pdf] = await Promise.all([import("pdf-lib"), loadPdf(url)])
  const source = await PDFDocument.load(await pdf.getData())
  const out = await PDFDocument.create()
  for (const page of await out.copyPages(source, paginas)) out.addPage(page)

  // `slice()` devolve um ArrayBuffer próprio: o Blob não aceita a view que o
  // pdf-lib entrega, e copiar página é barato.
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
  // Que folha já está desenhada na tela. Trocar só a escala não é folha nova:
  // o que está à mostra continua valendo enquanto o desenho fino não chega.
  const desenhada = useRef("")

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    const chave = `${url}#${pageIndex}`

    ;(async () => {
      try {
        // O aviso de "desenhando" só aparece quando não há nada no lugar. Numa
        // troca de escala ele piscava por cima da prancha a cada passo do zoom.
        depurar("zoom", "render inicio", { chave, scale })
        if (desenhada.current !== chave) setState("loading")
        const pdf = await loadPdf(url)
        const page = await pdf.getPage(pageIndex + 1)
        if (cancelled) return

        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        onSize?.({ width: viewport.width, height: viewport.height })

        // O desenho vai primeiro para uma tela fora do documento e só depois é
        // copiado: mudar a largura de um canvas o apaga, e apagar o que está à
        // vista para desenhar de novo é o clarão que se via a cada zoom.
        const fora = document.createElement("canvas")
        fora.width = Math.floor(viewport.width)
        fora.height = Math.floor(viewport.height)
        const ctxFora = fora.getContext("2d")
        if (!ctxFora) return
        const render = page.render({ canvasContext: ctxFora, viewport })
        task = render
        await render.promise
        if (cancelled) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return
        canvas.width = fora.width
        canvas.height = fora.height
        ctx.drawImage(fora, 0, 0)
        desenhada.current = chave
        depurar("zoom", "render fim", { chave, scale, w: fora.width, h: fora.height })
        setState("ready")
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

/**
 * Junta PDFs de uma página só num documento, na ordem dada.
 *
 * É o set de uma versão parcial. O arquivo que ela guarda é só o trecho que
 * mudou, e o resto mora nos recortes herdados da versão anterior: quando alguém
 * precisa do caderno inteiro (ler os nomes, baixar um trecho), ele é montado
 * aqui a partir das folhas.
 */
export async function juntarFolhas(urls: string[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib")
  const out = await PDFDocument.create()
  for (const url of urls) {
    const fonte = await PDFDocument.load(await fetch(url).then(r => r.arrayBuffer()))
    for (const pagina of await out.copyPages(fonte, fonte.getPageIndices())) out.addPage(pagina)
  }
  const bytes = await out.save()
  return new Blob([bytes.slice().buffer], { type: "application/pdf" })
}
