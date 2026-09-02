"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { useEffect, useRef } from "react"

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

/**
 * A página desenhada só onde ela aparece.
 *
 * O leitor antigo dava ao canvas o tamanho da página inteira multiplicado pelo
 * zoom. A 400% numa prancha de 42 polegadas isso já pedia mais de 16 mil pixels
 * de largura, que é o limite de dimensão do navegador: passava dali e o canvas
 * saía em branco. Era esse o teto, não uma escolha de produto.
 *
 * Aqui o canvas tem o tamanho da área visível e mais nada. O zoom entra na
 * escala do vetor e a posição entra como translação, então ampliar não custa
 * memória nenhuma: 6400% desenha a mesma quantidade de pixels que 100%, e cada
 * um deles é um pixel físico da tela. É por isso que a letra fica nítida em vez
 * de esticada.
 */
export function PlanCanvas({ url, pageIndex, view, width, height, onReady }: {
  url: string
  pageIndex: number
  view: PlanView
  width: number
  height: number
  onReady?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // O que está de fato desenhado no canvas agora. Enquanto o gesto acontece, a
  // diferença entre isto e `view` vira transformação de CSS: o desenho antigo
  // acompanha o dedo de graça, e o nítido chega quando a mão para.
  const drawn = useRef<PlanView | null>(null)
  const frame = useRef(0)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const task = useRef<{ cancel: () => void } | null>(null)
  const busy = useRef(false)

  useEffect(() => { drawn.current = null }, [url, pageIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || height <= 0) return

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)

    function preview() {
      const c = canvasRef.current
      const base = drawn.current
      if (!c) return
      if (!base) { c.style.transform = "" ; return }
      const k = view.scale / base.scale
      c.style.transformOrigin = "0 0"
      c.style.transform = `translate(${view.x - base.x * k}px, ${view.y - base.y * k}px) scale(${k})`
    }

    async function draw() {
      const c = canvasRef.current
      if (!c || busy.current) return
      busy.current = true
      const target: PlanView = { ...view }
      try {
        const pdf = await loadPdf(url)
        const page = await pdf.getPage(pageIndex + 1)
        const ctx = c.getContext("2d", { alpha: false })
        if (!ctx) return

        const w = Math.max(1, Math.round(width * dpr))
        const h = Math.max(1, Math.round(height * dpr))
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h }

        const viewport = page.getViewport({ scale: target.scale * dpr })

        // O vazio é escuro e só a folha é branca. Pintar o canvas inteiro de
        // branco fazia a prancha perder as quinas: a pessoa arrastava para o
        // nada achando que ainda estava sobre o desenho.
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = "#171717"
        ctx.fillRect(0, 0, w, h)
        const px = Math.round(target.x * dpr)
        const py = Math.round(target.y * dpr)
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

        // Fio de contorno: a borda da folha branca sobre o fundo escuro já se
        // vê, mas o papel de plano costuma ter margem larga e branca demais
        // para o olho achar onde ele acaba.
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.strokeStyle = "rgba(255,255,255,0.25)"
        ctx.lineWidth = 1
        ctx.strokeRect(px + 0.5, py + 0.5, viewport.width - 1, viewport.height - 1)
        drawn.current = target
        c.style.transform = ""
        onReady?.()
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
    // Sem desenho nenhum ainda, desenha já; com desenho na tela, espera a mão
    // parar. Redesenhar a cada quadro de um gesto é o que trava o tablet.
    idle.current = setTimeout(() => { void draw() }, drawn.current ? 90 : 0)

    return () => {
      cancelAnimationFrame(frame.current)
      if (idle.current) clearTimeout(idle.current)
    }
  }, [url, pageIndex, view, width, height, onReady])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ width, height }}
    />
  )
}
