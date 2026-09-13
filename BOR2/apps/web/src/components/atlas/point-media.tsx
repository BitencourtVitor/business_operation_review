"use client"

import { ImageWindow } from "@/components/atlas/image-window"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateAtlasMedia, useUploadAtlasMedia } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { Camera, Check, FileVolume, Pencil, Video, X } from "lucide-react"
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
 * ponto monta a sua, e é a metade que diz de qual fase ela é: aqui dentro não
 * há rótulo nenhum, só as peças e a porta para anexar mais.
 *
 * ── Por que cada peça tem título e descrição ──
 *
 * Uma foto de álbum se basta com legenda. A peça que documenta um conserto não:
 * ela responde "o que foi feito", e a resposta tem um título curto, que encabeça
 * o container no relatório impresso, e um parágrafo que conta o que foi feito.
 * Sem isso o relatório mostra quatro fotos de madeira em sequência e deixa quem
 * lê adivinhar qual mostra o quê.
 */

export function ehImagem(m: { contentType: string }) { return m.contentType.startsWith("image/") }
export function ehVideo(m: { contentType: string }) { return m.contentType.startsWith("video/") }
export function ehAudio(m: { contentType: string }) { return m.contentType.startsWith("audio/") }

export function PointPhase({ jobsiteId, eventId, canWrite, fase, pecas }: {
  jobsiteId: string
  eventId: string
  canWrite: boolean
  fase: "before" | "after"
  pecas: AtlasMedia[]
}) {
  // A foto aberta, com o conjunto da fase a que ela pertence: quem abre a
  // terceira de vinte troca de foto dentro da janela, sem voltar para a lista.
  const [aberta, setAberta] = useState<{ pecas: { url: string; name: string }[]; inicial: number } | null>(null)
  const [editando, setEditando] = useState("")
  const upload = useUploadAtlasMedia(jobsiteId)
  const atualizar = useUpdateAtlasMedia(jobsiteId)
  const cameraRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  if (!pecas.length && !canWrite) return null

  return (
    <div className="flex w-[176px] shrink-0 flex-wrap content-start items-start gap-1.5">
      {pecas.map(m => (
        <div key={m.id} className="relative flex w-[84px] flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              // Vídeo não entra na fita: a janela é de imagem, e misturar os
              // dois faria a seta cair num quadro que ela não sabe mostrar.
              const fotos = pecas.filter(f => !ehVideo(f))
              const i = fotos.findIndex(f => f.id === m.id)
              setAberta({
                pecas: fotos.map(f => ({ url: f.url, name: f.title || f.fileName })),
                inicial: Math.max(0, i),
              })
            }}
            className="relative h-[84px] w-[84px] overflow-hidden rounded-lg border border-border/60 transition-opacity hover:opacity-80"
            title={m.title || m.fileName}
          >
            {ehVideo(m) ? (
              <>
                {/* O quadro do vídeo é o próprio vídeo parado no começo. Um
                    ícone sobre fundo cinza diria "existe um vídeo aqui" e não
                    diria qual. */}
                <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-neutral-900/70 p-0.5 text-white">
                  <Video className="h-3 w-3" />
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.title || m.caption} className="h-full w-full object-cover" />
            )}
          </button>

          {/* O título embaixo da miniatura, e não só dentro do relatório: quem
              documentou precisa ver o que já escreveu antes de escrever de novo. */}
          {(m.title || canWrite) && (
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => setEditando(editando === m.id ? "" : m.id)}
              className="flex items-center gap-1 text-left text-[10px] leading-tight text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
            >
              {canWrite && <Pencil className="h-2.5 w-2.5 shrink-0" />}
              <span className="line-clamp-2">{m.title || "Describe it"}</span>
            </button>
          )}

          {canWrite && (
            <DescreverPeca
              media={m}
              open={editando === m.id}
              salvando={atualizar.isPending}
              onSave={patch => atualizar.mutate({ mediaId: m.id, patch },
                { onSuccess: () => setEditando("") })}
              onCancel={() => setEditando("")}
            />
          )}
        </div>
      ))}

      {/* Anexar é uma porta só, com a câmera e o vídeo lado a lado dentro dela:
          eram dois quadros do tamanho de uma foto, e numa fase vazia a coluna
          tinha mais botão do que prova. */}
      {canWrite && (
        <div className="flex h-[84px] w-[84px] shrink-0 overflow-hidden rounded-lg border border-dashed border-border/60 text-muted-foreground">
          {upload.isPending ? (
            <span className="flex flex-1 items-center justify-center">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </span>
          ) : (
            <>
              <button
                type="button"
                title={fase === "before" ? "Photograph the problem" : "Photograph what was done"}
                onClick={() => cameraRef.current?.click()}
                className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Camera className="h-4 w-4" />
                <span className="text-[10px] font-medium">Photo</span>
              </button>
              <span className="w-px bg-border/60" />
              <button
                type="button"
                title={fase === "before" ? "Film the problem" : "Film what was done"}
                onClick={() => videoRef.current?.click()}
                className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Video className="h-4 w-4" />
                <span className="text-[10px] font-medium">Video</span>
              </button>
            </>
          )}
        </div>
      )}

      {canWrite && (
        <>
          {/* Uma porta para cada coisa, e as duas são a câmera: `capture` manda
              o celular abrir a traseira direto. A prova de obra é do que está
              na frente de quem registra, agora; imagem vinda do rolo pode ser
              de qualquer lugar e de qualquer dia. */}
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async e => {
              const escolhidas = Array.from(e.target.files ?? [])
              e.target.value = ""
              for (const foto of escolhidas) {
                await upload.mutateAsync({ file: foto, eventId, phase: fase })
              }
            }}
          />
          <input
            ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={async e => {
              const escolhidos = Array.from(e.target.files ?? [])
              e.target.value = ""
              for (const v of escolhidos) {
                await upload.mutateAsync({ file: v, eventId, phase: fase })
              }
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

/**
 * A descrição falada, quando existe.
 *
 * É insumo, e não conteúdo: o que vale é o texto que já está no corpo do ponto,
 * e a gravação está aqui para poder ser conferida. Ponto novo não grava mais
 * áudio, então isto serve ao que foi registrado enquanto o ditado existiu.
 */
export function PointAudio({ gravacoes }: { gravacoes: AtlasMedia[] }) {
  if (!gravacoes.length) return null
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/50 pt-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Said out loud
      </span>
      {gravacoes.map(m => (
        <div key={m.id} className="flex flex-col gap-1 rounded-lg border border-border/60 p-2">
          <div className="flex items-center gap-2">
            <FileVolume className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <audio src={m.url} controls preload="none" className="h-8 min-w-0 flex-1" />
          </div>
          {m.transcript && (
            <p className="whitespace-pre-wrap pl-5 text-xs text-muted-foreground">
              {m.transcript}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Título e descrição de uma peça.
 *
 * Era um balão preso à miniatura. A miniatura mora na coluna da direita do
 * ponto, e no celular o balão nascia dali para fora do card: os campos cortados
 * e o botão de salvar do outro lado da tela. Numa janela própria ele tem a
 * largura que o texto pede, a foto à vista de quem escreve sobre ela, e o
 * teclado do celular não empurra nada para fora.
 */
function DescreverPeca({ media, open, salvando, onSave, onCancel }: {
  media: AtlasMedia
  open: boolean
  salvando: boolean
  onSave: (patch: { title: string; description: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(media.title)
  const [description, setDescription] = useState(media.description)
  const [aberto, setAberto] = useState(open)
  // Cada abertura começa do que está gravado, e não do rascunho que ficou.
  if (open !== aberto) {
    setAberto(open)
    if (open) { setTitle(media.title); setDescription(media.description) }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Describe this {ehVideo(media) ? "video" : "photo"}</DialogTitle></DialogHeader>
        <div className="flex gap-3">
          <span className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border/60">
            {ehVideo(media) ? (
              <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.url} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={`peca-titulo-${media.id}`}>What it shows</Label>
            <Input
              id={`peca-titulo-${media.id}`}
              value={title}
              placeholder="A short title"
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSave({ title, description }) }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`peca-descricao-${media.id}`}>What was done about it</Label>
          <Textarea
            id={`peca-descricao-${media.id}`}
            rows={3}
            value={description}
            placeholder="Where it is, what is wrong, what was done"
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button disabled={salvando} onClick={() => onSave({ title, description })}>
            <Check className="h-4 w-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
