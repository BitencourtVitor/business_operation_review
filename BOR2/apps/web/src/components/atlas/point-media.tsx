"use client"

import { ImageWindow } from "@/components/atlas/image-window"
import { Input } from "@/components/ui/input"
import { useAtlasMedia, useUpdateAtlasMedia, useUploadAtlasMedia } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { Camera, Check, FileVolume, Pencil, Video, X } from "lucide-react"
import { useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * O que está pendurado num ponto: o problema, a solução e o que foi dito.
 *
 * Três faixas, e a separação é o que faz o conjunto valer.
 *
 * **Antes** é a prova de que o problema existe. **Depois** é a prova de que ele
 * acabou. Misturadas numa grade só, uma vira indistinguível da outra e o
 * relatório perde justamente o par que ele existe para mostrar; separadas, fica
 * óbvio olhando por que um ponto ainda não fecha.
 *
 * **A gravação** é a descrição falada, com o texto do que foi ouvido ao lado.
 * Ela fica por último porque é insumo: o que vale é o texto que já está no corpo
 * do ponto, e o áudio está aqui para poder ser conferido.
 *
 * ── Por que cada peça do depois tem título e descrição ──
 *
 * Uma foto de álbum se basta com legenda. A peça que documenta um conserto não:
 * ela responde "o que foi feito", e a resposta tem um título curto, que encabeça
 * o container no relatório impresso, e um parágrafo que conta o que foi feito.
 * Sem isso o relatório mostra quatro fotos de madeira em sequência e deixa quem
 * lê adivinhar qual mostra o quê.
 */

function ehImagem(m: { contentType: string }) { return m.contentType.startsWith("image/") }
function ehVideo(m: { contentType: string }) { return m.contentType.startsWith("video/") }
function ehAudio(m: { contentType: string }) { return m.contentType.startsWith("audio/") }

export function PointMedia({ jobsiteId, eventId, canWrite }: {
  jobsiteId: string; eventId: string; canWrite: boolean
}) {
  const { data: media } = useAtlasMedia(jobsiteId, { eventId })
  // A foto aberta, com o conjunto da faixa a que ela pertence: quem abre a
  // terceira de vinte troca de foto dentro da janela, sem voltar para a lista.
  const [aberta, setAberta] = useState<{ pecas: { url: string; name: string }[]; inicial: number } | null>(null)
  const [editando, setEditando] = useState("")
  const upload = useUploadAtlasMedia(jobsiteId)
  const atualizar = useUpdateAtlasMedia(jobsiteId)
  const cameraRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  // Qual das duas fases a câmera vai anexar. Num ref e não em estado porque
  // muda no clique e é lido no `change` do input, sem nada a re-renderizar
  // entre os dois.
  const faseRef = useRef<"before" | "after">("before")

  const pecas = (media ?? []).filter(m => m.url)
  const visuais = pecas.filter(m => ehImagem(m) || ehVideo(m))
  const antes = visuais.filter(m => m.phase !== "after")
  const depois = visuais.filter(m => m.phase === "after")
  const gravacoes = pecas.filter(ehAudio)

  if (!pecas.length && !canWrite) return null

  function abrirCamera(fase: "before" | "after", tipo: "foto" | "video") {
    faseRef.current = fase
    ;(tipo === "foto" ? cameraRef : videoRef).current?.click()
  }

  const peca = (m: AtlasMedia, faixa: AtlasMedia[] = visuais) => (
    <div key={m.id} className="relative flex w-20 flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          // Vídeo não entra na fita: a janela é de imagem, e misturar os dois
          // faria a seta cair num quadro que ela não sabe mostrar.
          const fotos = faixa.filter(f => !ehVideo(f))
          const i = fotos.findIndex(f => f.id === m.id)
          setAberta({
            pecas: fotos.map(f => ({ url: f.url, name: f.title || f.fileName })),
            inicial: Math.max(0, i),
          })
        }}
        className="relative h-20 w-20 overflow-hidden rounded-lg border border-border/60 transition-opacity hover:opacity-80"
        title={m.title || m.fileName}
      >
        {ehVideo(m) ? (
          <>
            {/* O quadro do vídeo é o próprio vídeo parado no começo. Um ícone
                sobre fundo cinza diria "existe um vídeo aqui" e não diria qual. */}
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

      {editando === m.id && canWrite && (
        <DescreverPeca
          media={m}
          salvando={atualizar.isPending}
          onSave={patch => atualizar.mutate({ mediaId: m.id, patch },
            { onSuccess: () => setEditando("") })}
          onCancel={() => setEditando("")}
        />
      )}
    </div>
  )

  const botao = (fase: "before" | "after", tipo: "foto" | "video", rotulo: string) => (
    <button
      type="button"
      onClick={() => abrirCamera(fase, tipo)}
      disabled={upload.isPending}
      title={fase === "before" ? "Record the problem" : "Record what was done about it"}
      className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
    >
      {upload.isPending
        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        : tipo === "foto" ? <Camera className="h-4 w-4" /> : <Video className="h-4 w-4" />}
      <span className="text-[10px] font-medium">{upload.isPending ? "Sending" : rotulo}</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {(antes.length > 0 || canWrite) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Before
          </span>
          <div className="flex flex-wrap items-start gap-2">
            {antes.map(m => peca(m, antes))}
            {canWrite && botao("before", "foto", antes.length ? "Add" : "Photo")}
            {canWrite && botao("before", "video", "Video")}
          </div>
        </div>
      )}

      {(depois.length > 0 || (canWrite && antes.length > 0)) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            After
            {antes.length > 0 && depois.length === 0 && (
              <span className="ml-1.5 font-normal normal-case text-amber-600 dark:text-amber-400">
                needed to mark this done
              </span>
            )}
          </span>
          <div className="flex flex-wrap items-start gap-2">
            {depois.map(m => peca(m, depois))}
            {canWrite && botao("after", "foto", depois.length ? "Add" : "Proof")}
            {canWrite && botao("after", "video", "Video")}
          </div>
        </div>
      )}

      {gravacoes.length > 0 && (
        <div className="flex flex-col gap-1.5">
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
                await upload.mutateAsync({ file: foto, eventId, phase: faseRef.current })
              }
            }}
          />
          <input
            ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={async e => {
              const escolhidos = Array.from(e.target.files ?? [])
              e.target.value = ""
              for (const v of escolhidos) {
                await upload.mutateAsync({ file: v, eventId, phase: faseRef.current })
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

/** Título e descrição de uma peça, editados onde ela está. */
function DescreverPeca({ media, salvando, onSave, onCancel }: {
  media: AtlasMedia
  salvando: boolean
  onSave: (patch: { title: string; description: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(media.title)
  const [description, setDescription] = useState(media.description)

  return (
    // Solta da miniatura de oitenta, porque um campo de texto de oitenta de
    // largura não serve para escrever nada. Fica por cima do que vem depois,
    // que é o comportamento de quem está editando: a atenção é toda dali.
    <div className="absolute left-0 top-full z-20 mt-1 flex w-[min(15rem,calc(100vw-3rem))] flex-col gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-md">
      <Input
        autoFocus
        value={title}
        placeholder="What it shows"
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave({ title, description }) }}
        className="h-8 text-sm"
      />
      <textarea
        rows={2}
        value={description}
        placeholder="What was done about it"
        onChange={e => setDescription(e.target.value)}
        className="w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring"
      />
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => onSave({ title, description })}
          className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-muted disabled:opacity-50 dark:text-emerald-400"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
