"use client"

import { ImageWindow } from "@/components/atlas/image-window"
import { useUploadAtlasMedia } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { Camera, Pencil, Video } from "lucide-react"
import { useRef, useState } from "react"
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

export function PointPhase({ jobsiteId, eventId, canWrite, fase, pecas, onRegistrou, onEditar }: {
  jobsiteId: string
  eventId: string
  canWrite: boolean
  fase: "before" | "after"
  pecas: AtlasMedia[]
  /** Uma peça nova subiu nesta fase. */
  onRegistrou?: () => void
  /** Editar o escrito desta metade do ponto: o problema, ou a solução. */
  onEditar?: () => void
}) {
  // A foto aberta, com o conjunto da fase a que ela pertence.
  const [aberta, setAberta] = useState<{ pecas: { url: string; name: string }[]; inicial: number } | null>(null)
  const upload = useUploadAtlasMedia(jobsiteId)
  const cameraRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

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

  async function subir(arquivos: File[]) {
    for (const f of arquivos) {
      await upload.mutateAsync({ file: f, eventId, phase: fase })
    }
    if (arquivos.length) onRegistrou?.()
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

      {canWrite && (
        <div className="flex h-8 w-full shrink-0 overflow-hidden rounded-lg border border-dashed border-border/60 text-muted-foreground">
          {upload.isPending ? (
            <span className="flex flex-1 items-center justify-center">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </span>
          ) : (
            <>
              <button
                type="button"
                title={fase === "before" ? "Photograph the problem" : "Photograph what was done"}
                aria-label="Photo"
                onClick={() => cameraRef.current?.click()}
                className="flex flex-1 items-center justify-center transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Camera className="h-4 w-4" />
              </button>
              {/* A divisória é a borda tracejada do próprio botão: um traço
                  cheio de 1px no meio lia como linha contínua. */}
              <button
                type="button"
                title={fase === "before" ? "Film the problem" : "Film what was done"}
                aria-label="Video"
                onClick={() => videoRef.current?.click()}
                className="flex flex-1 items-center justify-center border-l border-dashed border-border/60 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Video className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
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

      {canWrite && (
        <>
          {/* Uma porta para cada coisa, e as duas são a câmera: `capture` manda
              o celular abrir a traseira direto. A prova de obra é do que está
              na frente de quem registra, agora. */}
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => {
              const escolhidas = Array.from(e.target.files ?? [])
              e.target.value = ""
              void subir(escolhidas)
            }}
          />
          <input
            ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={e => {
              const escolhidos = Array.from(e.target.files ?? [])
              e.target.value = ""
              void subir(escolhidos)
            }}
          />
        </>
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
