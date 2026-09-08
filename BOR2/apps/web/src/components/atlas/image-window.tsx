"use client"

import { X } from "lucide-react"
import { useRef, useState } from "react"

/**
 * A imagem aberta por cima de tudo, numa janela própria.
 *
 * Nasceu no histórico de revisão de folha, para a foto que justifica uma troca
 * de prancha, e passou a valer também para a foto que acompanha um note. É a
 * mesma pergunta nos dois lugares: a miniatura mostra que existe imagem, e
 * quem quer ver de verdade precisa de tela.
 *
 * O que a pinça amplia é a **janela**, e não a imagem dentro de um quadro fixo.
 * Aumentar a ampliação dentro de uma moldura do mesmo tamanho só corta a foto:
 * o que se quer ao aproximar é ver mais, e para ver mais a moldura tem que
 * crescer junto.
 *
 * Quem chama precisa envolvê-la num `createPortal` para o corpo da página
 * sempre que houver diálogo aberto por perto: popup de diálogo carrega
 * transformação própria, e dentro de um elemento transformado o `fixed` deixa
 * de valer a tela e passa a valer o popup. A janela nasceria presa a ele, do
 * tamanho dele, e o desfoque não alcançaria o resto.
 */
export function ImageWindow({ url, name, onClose }: {
  url: string
  name: string
  onClose: () => void
}) {
  // A largura com que a imagem coube na tela ao abrir, e o quanto ela ainda
  // pode crescer antes de encostar na borda por qualquer um dos dois lados.
  const [base, setBase] = useState(0)
  const [teto, setTeto] = useState(1)
  const [zoom, setZoom] = useState(1)

  const dedos = useRef(new Map<number, { x: number; y: number }>())
  const inicio = useRef<{ dist: number; zoom: number } | null>(null)

  // O tamanho de partida é o piso: ele já é a imagem inteira cabendo na tela, e
  // encolher além disso só devolve uma janela menor do que a que se abriu.
  const limita = (n: number) => Math.min(teto, Math.max(1, n))

  function medir(img: HTMLImageElement) {
    const largura = window.innerWidth * 0.92
    const altura = window.innerHeight * 0.9 - 44
    const proporcao = img.naturalWidth / img.naturalHeight
    const coube = Math.min(1, largura / img.naturalWidth, altura / img.naturalHeight)
    const inicial = img.naturalWidth * coube
    setBase(inicial)
    setTeto(Math.max(1, Math.min(largura / inicial, (altura * proporcao) / inicial)))
  }

  function down(e: React.PointerEvent) {
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {
      // ponteiro que o navegador não conhece: segue sem captura
    }
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()]
      inicio.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }

  function move(e: React.PointerEvent) {
    if (!dedos.current.has(e.pointerId)) return
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.current.size !== 2 || !inicio.current) return
    const [a, b] = [...dedos.current.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (inicio.current.dist > 0) setZoom(limita(inicio.current.zoom * (dist / inicio.current.dist)))
  }

  function up(e: React.PointerEvent) {
    dedos.current.delete(e.pointerId)
    if (dedos.current.size < 2) inicio.current = null
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/60 p-6 backdrop-blur-md"
    >
      <div
        role="presentation"
        onClick={e => e.stopPropagation()}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => setZoom(1)}
        onWheel={e => setZoom(z => limita(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))}
        className="inline-flex touch-none flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        {/* O cabeçalho segue a largura da janela e não muda de altura: ele é a
            identificação, e identificação não cresce com o zoom. */}
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <div className="flex shrink-0 items-center gap-1">
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="rounded px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {zoom.toFixed(1)}x
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* A imagem encosta na moldura: o que arredonda é a janela, e o corte
            dela nas duas quinas de baixo é o mesmo que qualquer modal faz com o
            que carrega. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          draggable={false}
          onLoad={e => medir(e.currentTarget)}
          style={base ? { width: Math.round(base * zoom) } : undefined}
          className="block h-auto max-h-[calc(90vh-2.75rem)] w-auto max-w-[92vw] select-none"
        />
      </div>
    </div>
  )
}
