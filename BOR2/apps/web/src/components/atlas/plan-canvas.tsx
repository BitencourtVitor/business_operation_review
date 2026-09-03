"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { useEffect, useRef, useState } from "react"

export interface PlanView {
  /** Pixels de tela por ponto do PDF. */
  scale: number
  /** Canto superior esquerdo da página, em pixels do contêiner. */
  x: number
  y: number
}

// Acima disto o ganho é imperceptível e o custo de pixel é real. Tablet costuma
// reportar 2; telas 3x rendem em 2,5 sem diferença visível a olho nu.
const MAX_DPR = 2.5

// Largura da camada de fundo, em pixels. Uma prancha inteira nisto é ~1,8 M de
// pixels e ~7 MB, independente do tamanho do papel: a folha de 42 polegadas
// custa o mesmo que a A1. Desenha uma vez, em ~55 ms, e depois só é esticada.
const BASE_WIDTH = 1600

// Quanto dura a troca entre o quadro esticado e o nítido. Abaixo de ~100 ms o
// olho lê como salto; acima de ~250 ms o desenho parece demorar a firmar.
const FADE_MS = 160

/**
 * A página em camadas: a folha inteira embaixo, o pedaço nítido em cima.
 *
 * O canvas nítido tem o tamanho da área visível e nada mais, e é isso que
 * permite ampliar até 64x sem estourar o limite de dimensão do navegador, que é
 * o que travava o leitor antigo em 4x. O preço é que ele só sabe o que está na
 * tela: ao arrastar, a faixa que entra ainda não foi desenhada.
 *
 * Daí a camada de baixo. Ela é a página inteira, desenhada uma única vez em
 * resolução modesta, e acompanha o gesto só por CSS. Nunca há vazio: o que
 * chega já vem preenchido, e o nítido substitui por cima quando a mão para.
 *
 * A camada nítida é dupla, e alterna. O novo quadro é desenhado no canvas que
 * está escondido e só então aparece, com meio suspiro de transição por cima do
 * anterior. Assim nunca se vê o canvas sendo pintado, e a troca de nitidez deixa
 * de ser um salto: o pop-in não some, porque para sumir seria preciso
 * rasterizar o PDF a cada quadro do gesto, mas para de saltar aos olhos.
 */
export function PlanCanvas({ url, pageIndex, view, width, height, pageWidth, pageHeight }: {
  url: string
  pageIndex: number
  view: PlanView
  width: number
  height: number
  pageWidth: number
  pageHeight: number
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const sharpRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)]
  const [baseReady, setBaseReady] = useState(false)
  // Qual dos dois está na frente. O outro é onde o próximo quadro é desenhado.
  const [front, setFront] = useState(0)

  // O que cada canvas tem desenhado. Enquanto o gesto acontece, a diferença
  // entre isto e `view` vira transformação de CSS: o desenho antigo acompanha o
  // dedo de graça, e o nítido chega quando a mão para.
  const drawn = useRef<(PlanView | null)[]>([null, null])
  const frontRef = useRef(0)
  const frame = useRef(0)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const task = useRef<{ cancel: () => void } | null>(null)
  const busy = useRef(false)

  useEffect(() => { frontRef.current = front }, [front])

  // ── Camada de fundo: uma vez por página ───────────────────────────────────
  useEffect(() => {
    let cancelled = false
    drawn.current = [null, null]
    setBaseReady(false)

    ;(async () => {
      try {
        const pdf = await loadPdf(url)
        const page = await pdf.getPage(pageIndex + 1)
        const natural = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: BASE_WIDTH / natural.width })
        const canvas = baseRef.current
        if (!canvas || cancelled) return

        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext("2d", { alpha: false })
        if (!ctx) return
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport }).promise
        if (!cancelled) setBaseReady(true)
      } catch {
        // Sem fundo o leitor continua funcionando: volta a ser só a camada
        // nítida, como era antes.
      }
    })()

    return () => { cancelled = true }
  }, [url, pageIndex])

  // ── Camada nítida: a cada parada do gesto ─────────────────────────────────
  useEffect(() => {
    if (width <= 0 || height <= 0) return

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)

    // Cada canvas acompanha o gesto a partir do que ele próprio tem desenhado:
    // durante a troca os dois estão na tela, e um transform comum deslocaria o
    // que está saindo.
    function preview() {
      for (let i = 0; i < 2; i++) {
        const c = sharpRefs[i].current
        const base = drawn.current[i]
        if (!c) continue
        if (!base) { c.style.transform = ""; continue }
        const k = view.scale / base.scale
        c.style.transformOrigin = "0 0"
        c.style.transform = `translate(${view.x - base.x * k}px, ${view.y - base.y * k}px) scale(${k})`
      }
    }

    async function draw() {
      if (busy.current) return
      const back = 1 - frontRef.current
      const c = sharpRefs[back].current
      if (!c) return
      busy.current = true
      const target: PlanView = { ...view }
      try {
        const pdf = await loadPdf(url)
        const page = await pdf.getPage(pageIndex + 1)
        const ctx = c.getContext("2d", { alpha: true })
        if (!ctx) return

        const w = Math.max(1, Math.round(width * dpr))
        const h = Math.max(1, Math.round(height * dpr))
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h }

        const viewport = page.getViewport({ scale: target.scale * dpr })
        const px = Math.round(target.x * dpr)
        const py = Math.round(target.y * dpr)

        // Transparente fora da folha: é o que deixa a camada de fundo aparecer
        // por baixo enquanto esta ainda não cobriu o que entrou na tela.
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(px, py, viewport.width, viewport.height)

        task.current?.cancel()
        // A translação entra pelo `transform` do próprio pdf.js: o vetor é
        // desenhado já deslocado e o canvas recorta o que sobra, então só o que
        // está na tela custa rasterização.
        const render = page.render({
          canvasContext: ctx,
          viewport,
          transform: [1, 0, 0, 1, px, py],
        } as Parameters<typeof page.render>[0])
        task.current = render
        await render.promise

        // Pronto e ainda escondido: agora ele vem para a frente, e o anterior
        // se apaga por baixo dele em vez de desaparecer de um quadro para o
        // outro.
        drawn.current[back] = target
        c.style.transform = ""
        frontRef.current = back
        setFront(back)
      } catch {
        // Render cancelado no meio do gesto é o caso normal: o próximo quadro
        // resolve, e o desenho anterior segue na tela até lá.
      } finally {
        busy.current = false
      }
    }

    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(preview)

    if (idle.current) clearTimeout(idle.current)
    // Com a folha inteira desenhada por baixo, esperar menos é seguro: o que
    // aparece antes do nítido já é a página, não um buraco.
    idle.current = setTimeout(() => { void draw() }, drawn.current[frontRef.current] ? 60 : 0)

    return () => {
      cancelAnimationFrame(frame.current)
      if (idle.current) clearTimeout(idle.current)
    }
  }, [url, pageIndex, view, width, height])

  return (
    <>
      <canvas
        ref={baseRef}
        aria-hidden
        className="absolute origin-top-left"
        style={{
          left: 0,
          top: 0,
          width: pageWidth * view.scale,
          height: pageHeight * view.scale,
          transform: `translate(${view.x}px, ${view.y}px)`,
          visibility: baseReady ? "visible" : "hidden",
        }}
      />
      {[0, 1].map(i => (
        <canvas
          key={i}
          ref={sharpRefs[i]}
          className="absolute inset-0"
          style={{
            width,
            height,
            opacity: front === i ? 1 : 0,
            transition: `opacity ${FADE_MS}ms linear`,
          }}
        />
      ))}
    </>
  )
}
