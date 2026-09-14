"use client"

import { ImageWindow } from "@/components/atlas/image-window"
import type { AtlasMedia } from "@/services/atlas.service"
import { Pencil, Video } from "lucide-react"
import { useState } from "react"
import { createPortal } from "react-dom"

/**
 * As peças de uma fase do ponto: as do problema, ou as da correção.
 *
 * ── Por que uma fase por vez ──
 *
 * **Antes** é a prova de que o problema existe. **Depois** é a prova de que ele
 * acabou. Misturadas numa grade só, uma vira indistinguível da outra e o
 * relatório perde justamente o par que ele existe para mostrar. Cada metade do
 * ponto monta a sua, e é a metade que diz de qual fase ela é.
 *
 * ── Baralho, e não grade ──
 *
 * Eram miniaturas de 84 lado a lado numa coluna de 176, e no celular essa
 * coluna comia metade do ponto: o problema virava uma palavra por linha. As
 * peças agora ficam empilhadas como cartas no lado oposto ao texto, a última
 * por cima e as outras mostrando uma tira, e a coluna tem a largura de uma
 * carta. Tocar no baralho abre a galeria.
 *
 * ── A peça não tem texto próprio ──
 *
 * O que se escreve sobre o problema e sobre a correção mora no ponto, e não em
 * cada foto. Título e legenda por peça espalhavam o mesmo relato em pedaços, e
 * o relatório tinha que remontar a solução colando descrições de fotos.
 */

export function ehImagem(m: { contentType: string }) { return m.contentType.startsWith("image/") }
export function ehVideo(m: { contentType: string }) { return m.contentType.startsWith("video/") }
export function ehAudio(m: { contentType: string }) { return m.contentType.startsWith("audio/") }

/** Quantas cartas o baralho mostra. Da quinta em diante a pilha para de crescer. */
const CARTAS = 4
/** A tira que cada carta de baixo deixa à vista. */
const TIRA = 10

export function PointPhase({ canWrite, pecas, onEditar }: {
  canWrite: boolean
  pecas: AtlasMedia[]
  /** Editar o escrito desta metade do ponto: o problema, ou a solução. */
  onEditar?: () => void
}) {
  // A foto aberta, com o conjunto da fase a que ela pertence.
  const [aberta, setAberta] = useState<{ pecas: { url: string; name: string }[]; inicial: number } | null>(null)

  if (!pecas.length && !canWrite) return null

  const cartas = pecas.slice(-CARTAS)
  const larguraDoBaralho = 84 + (cartas.length - 1) * TIRA

  function abrirGaleria() {
    // Vídeo não entra na fita: a janela é de imagem.
    const fotos = pecas.filter(f => !ehVideo(f))
    if (!fotos.length) {
      const video = pecas[pecas.length - 1]
      if (video) window.open(video.url, "_blank", "noopener")
      return
    }
    setAberta({
      pecas: fotos.map(f => ({ url: f.url, name: f.fileName })),
      inicial: fotos.length - 1,
    })
  }

  return (
    // Tudo colado no topo, na ordem em que se usa: o baralho centrado na
    // coluna, a câmera e o editar na largura toda logo abaixo dele. O que
    // sobra de altura fica embaixo, e não espalhado entre os botões.
    <div className="flex w-[116px] shrink-0 flex-col items-center gap-1.5">
      {pecas.length > 0 && (
        // O baralho não cresce com a coluna: com várias peças ele se alarga
        // pela tira de cada carta, e é essa conta que não pode mudar.
        <button
          type="button"
          onClick={abrirGaleria}
          title={pecas.length === 1 ? "Open" : `Open ${pecas.length}`}
          style={{ width: larguraDoBaralho }}
          className="relative h-[84px] shrink-0 transition-opacity hover:opacity-90"
        >
          {cartas.map((m, i) => (
            <span
              key={m.id}
              style={{ left: i * TIRA }}
              className="absolute top-0 h-[84px] w-[84px] overflow-hidden rounded-lg border border-border/60 bg-muted shadow-sm ring-2 ring-card"
            >
              {ehVideo(m) ? (
                <>
                  <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 right-1 rounded bg-neutral-900/70 p-0.5 text-white">
                    <Video className="h-3 w-3" />
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.caption || m.fileName} className="h-full w-full object-cover" />
              )}
            </span>
          ))}
          {pecas.length > 1 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold tabular-nums text-background">
              {pecas.length}
            </span>
          )}
        </button>
      )}

      {canWrite && onEditar && (
        <button
          type="button"
          onClick={onEditar}
          className="flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          Edit
        </button>
      )}

      {aberta && createPortal(
        <ImageWindow
          url={aberta.pecas[aberta.inicial]?.url ?? ""}
          name={aberta.pecas[aberta.inicial]?.name ?? ""}
          pecas={aberta.pecas}
          inicial={aberta.inicial}
          onClose={() => setAberta(null)}
        />,
        document.body,
      )}
    </div>
  )
}
