"use client"

import { ImageWindow } from "@/components/atlas/image-window"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { IconInput } from "@/components/common/icon-input"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateAtlasMedia, useUploadAtlasMedia } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { AlignLeft, Camera, Check, Pencil, Type, Video } from "lucide-react"
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
 * ── Por que cada peça tem título e descrição ──
 *
 * A peça que documenta um conserto responde "o que foi feito", e a resposta tem
 * um título curto, que encabeça o container no relatório impresso, e um
 * parágrafo. Sem isso o relatório mostra quatro fotos de madeira em sequência e
 * deixa quem lê adivinhar qual mostra o quê.
 */

export function ehImagem(m: { contentType: string }) { return m.contentType.startsWith("image/") }
export function ehVideo(m: { contentType: string }) { return m.contentType.startsWith("video/") }
export function ehAudio(m: { contentType: string }) { return m.contentType.startsWith("audio/") }

/** Quantas cartas o baralho mostra. Da quinta em diante a pilha para de crescer. */
const CARTAS = 4
/** A tira que cada carta de baixo deixa à vista. */
const TIRA = 10

export function PointPhase({ jobsiteId, eventId, canWrite, fase, pecas, onRegistrou }: {
  jobsiteId: string
  eventId: string
  canWrite: boolean
  fase: "before" | "after"
  pecas: AtlasMedia[]
  /** Uma peça nova subiu nesta fase. */
  onRegistrou?: () => void
}) {
  // A foto aberta, com o conjunto da fase a que ela pertence.
  const [aberta, setAberta] = useState<{ pecas: { url: string; name: string }[]; inicial: number } | null>(null)
  const [descrevendo, setDescrevendo] = useState(false)
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
      pecas: fotos.map(f => ({ url: f.url, name: f.title || f.fileName })),
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
    <div className="flex w-[116px] shrink-0 flex-col items-end gap-1.5">
      {pecas.length > 0 && (
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
                <img src={m.url} alt={m.title || m.caption} className="h-full w-full object-cover" />
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
        <div className="flex h-8 w-[84px] shrink-0 overflow-hidden rounded-lg border border-dashed border-border/60 text-muted-foreground">
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
              <span className="w-px bg-border/60" />
              <button
                type="button"
                title={fase === "before" ? "Film the problem" : "Film what was done"}
                aria-label="Video"
                onClick={() => videoRef.current?.click()}
                className="flex flex-1 items-center justify-center transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Video className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* O que cada peça mostra, escrito numa janela só para todas: com o
          baralho não há mais uma miniatura por peça onde pendurar o lápis. */}
      {canWrite && pecas.length > 0 && (
        <button
          type="button"
          onClick={() => setDescrevendo(true)}
          className="flex w-[84px] items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Pencil className="h-3 w-3 shrink-0" />
          {pecas.some(p => !p.title) ? "Describe" : "Edit"}
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
          <DescreverPecas
            jobsiteId={jobsiteId}
            pecas={pecas}
            open={descrevendo}
            onClose={() => setDescrevendo(false)}
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

/**
 * Título e descrição das peças de uma fase, numa janela.
 *
 * Era um balão preso à miniatura, que no celular nascia para fora do card. Numa
 * janela própria cada peça tem a foto à vista de quem escreve sobre ela, e o
 * teclado não empurra nada para fora.
 */
function DescreverPecas({ jobsiteId, pecas, open, onClose }: {
  jobsiteId: string
  pecas: AtlasMedia[]
  open: boolean
  onClose: () => void
}) {
  const atualizar = useUpdateAtlasMedia(jobsiteId)
  const [textos, setTextos] = useState<Record<string, { title: string; description: string }>>({})
  const [aberto, setAberto] = useState(open)
  const [salvando, setSalvando] = useState(false)
  // Cada abertura começa do que está gravado, e não do rascunho que ficou.
  if (open !== aberto) {
    setAberto(open)
    if (open) setTextos(Object.fromEntries(pecas.map(p => [p.id, { title: p.title, description: p.description }])))
  }

  async function salvar() {
    setSalvando(true)
    try {
      for (const p of pecas) {
        const t = textos[p.id]
        if (!t || (t.title === p.title && t.description === p.description)) continue
        await atualizar.mutateAsync({ mediaId: p.id, patch: t })
      }
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Describe {pecas.length === 1 ? "this" : `these ${pecas.length}`}</DialogTitle>
        </DialogHeader>
        {/* O respiro por dentro da rolagem é o que deixa o anel de foco inteiro:
            sem ele a borda do campo em foco saía cortada pela caixa que rola. */}
        <div className="-m-1 flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
          {pecas.map((p, i) => (
            // Um contêiner por peça: a foto, o título ao lado dela e a descrição
            // por baixo, com a largura inteira que um parágrafo pede. Soltos, os
            // campos de seis fotos viravam uma coluna só de caixas iguais.
            <div key={p.id} className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="flex items-center gap-2.5">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60">
                  {ehVideo(p) ? (
                    <video src={p.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {pecas.length > 1 && (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {ehVideo(p) ? "Video" : "Photo"} {i + 1} of {pecas.length}
                    </span>
                  )}
                  <IconInput
                    startIcon={Type}
                    value={textos[p.id]?.title ?? ""}
                    placeholder="A short title"
                    aria-label="Title"
                    onChange={e => setTextos(t => ({ ...t, [p.id]: { ...t[p.id], title: e.target.value } }))}
                    className="h-9 bg-background"
                  />
                </div>
              </div>
              <div className="relative">
                <AlignLeft className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Textarea
                  rows={3}
                  value={textos[p.id]?.description ?? ""}
                  placeholder="Details"
                  aria-label="Description"
                  onChange={e => setTextos(t => ({ ...t, [p.id]: { ...t[p.id], description: e.target.value } }))}
                  className="min-h-20 bg-background pl-9 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
        {/* Sem Cancel no pé: o X do topo já fecha sem salvar. */}
        <DialogFooter>
          <Button disabled={salvando} onClick={() => void salvar()}>
            <Check className="h-4 w-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
