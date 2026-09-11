"use client"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ImageWindow } from "@/components/atlas/image-window"
import { RoleName } from "@/components/atlas/role-icon"
import {
  useAtlasEvents, useAtlasMedia, useAtlasReplies, useCreateAtlasReply,
  useDeleteAtlasEvent, useUpdateAtlasEvent, useUploadAtlasMedia,
} from "@/hooks/use-atlas"
import type { AtlasEvent } from "@/services/atlas.service"
import {
  Building2, Camera, CheckCircle2, ChevronDown, ExternalLink, MapPin,
  MessageSquare, RotateCcw, Send, Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { createPortal } from "react-dom"

// Dois estados, e não três.
//
// Havia um "Answered" no meio, que nascia sozinho quando alguém comentava. Num
// punch list ele mentia: quem escreve "vi, vou olhar amanhã" não mudou nada na
// obra, e anexar a foto do depois também não. A lista responde uma pergunta só,
// se aquilo está pendente ou foi feito, e quem responde é quem executou.
const STATUS: Record<string, { label: string; className: string }> = {
  open:     { label: "Open", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  resolved: { label: "Done", className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
}

/** Data e hora como quem confere: dia curto e relógio de 24 horas. */
function quando(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * A conversa de uma task.
 *
 * Vive aqui e não sobre a prancha de propósito: quem abre o desenho quer ver o
 * desenho, e uma discussão de cinco mensagens flutuando sobre a folha esconde
 * justamente o que ela discute. Na prancha fica a marca; a conversa fica onde
 * há espaço para ela.
 */
function Thread({ event, jobsiteId, canWrite, sheetId, onDelete, deleting }: {
  event: AtlasEvent
  jobsiteId: string
  canWrite: boolean
  sheetId?: string
  /** Apagar mora aqui junto de encerrar: as duas são o fim da task. */
  onDelete: () => void
  deleting: boolean
}) {
  const { data: replies } = useAtlasReplies(event.id)
  const reply = useCreateAtlasReply(event.id, jobsiteId)
  const update = useUpdateAtlasEvent(jobsiteId, sheetId)
  const [text, setText] = useState("")

  function enviar() {
    if (!text.trim()) return
    reply.mutate(text.trim(), { onSuccess: () => setText("") })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
      {replies?.map(r => (
        <div key={r.id} className="flex flex-col gap-0.5 rounded-md bg-muted/60 p-2.5">
          <span className="text-xs font-medium">{r.authorName || "Someone"}</span>
          <span className="whitespace-pre-wrap text-sm">{r.body}</span>
          <span className="text-[11px] text-muted-foreground">{quando(r.createdAt)}</span>
        </div>
      ))}

      {canWrite && (
        <div className="flex items-center gap-2">
          {/* O campo se basta: o ícone à esquerda diz o que ele é, e o envio
              mora dentro dele, à direita. Enviar era um botão do mesmo tamanho
              dos outros dois ao lado, e assim a linha tinha três blocos de peso
              igual para uma ação principal e duas de encerramento. */}
          <div className="relative min-w-0 flex-1">
            <MessageSquare className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Write a comment"
              onKeyDown={e => { if (e.key === "Enter") enviar() }}
              className="pl-8 pr-8"
            />
            <button
              type="button"
              title="Send"
              disabled={!text.trim() || reply.isPending}
              onClick={enviar}
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Encerrar e apagar num bloco só, porque são a mesma família: as duas
              tiram a task da frente, uma dizendo que foi resolvida e a outra
              dizendo que não deveria existir. Soltas, a lixeira ficava numa
              linha própria embaixo, longe da decisão que ela acompanha. */}
          {/* Altura fechada em trinta e dois, contando a borda, que é a altura
              do campo ao lado. Com os botões em trinta e dois por dentro, a
              borda somava dois e a barra ficava mais alta que o campo. */}
          <div className="flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-border">
            {event.status !== "resolved" ? (
              <button
                type="button"
                onClick={() => update.mutate({ eventId: event.id, patch: { status: "resolved" } })}
                className="flex items-center gap-1.5 px-2.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-muted dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => update.mutate({ eventId: event.id, patch: { status: "open" } })}
                className="flex items-center gap-1.5 px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reopen
              </button>
            )}
            <div className="w-px bg-border" />
            <button
              type="button"
              title="Delete this task"
              disabled={deleting}
              onClick={onDelete}
              className="flex w-[30px] items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * As fotos que vieram com o note, no tamanho de quem confere de relance.
 *
 * Abre numa janela dentro do próprio sistema, e não em aba nova. Aba nova é o
 * que parecia natural e não funciona: dentro do painel o `target="_blank"` é
 * engolido, o clique não produz nada, e quem clicou conclui que a foto se
 * perdeu. É a mesma janela do histórico de revisão de folha.
 */
function Photos({ jobsiteId, eventId, canWrite }: {
  jobsiteId: string; eventId: string; canWrite: boolean
}) {
  const { data: media } = useAtlasMedia(jobsiteId, { eventId })
  const [aberta, setAberta] = useState<{ url: string; name: string } | null>(null)
  const upload = useUploadAtlasMedia(jobsiteId)
  const cameraRef = useRef<HTMLInputElement>(null)
  // Qual das duas a câmera vai anexar. Guardado num ref e não em estado porque
  // muda no clique e é lido no `change` do input, sem nada a re-renderizar entre
  // os dois.
  const faseRef = useRef<"before" | "after">("before")

  const fotos = (media ?? []).filter(m => m.url && m.contentType.startsWith("image/"))
  const antes = fotos.filter(m => m.phase !== "after")
  const depois = fotos.filter(m => m.phase === "after")

  if (!fotos.length && !canWrite) return null

  function abrirCamera(fase: "before" | "after") {
    faseRef.current = fase
    cameraRef.current?.click()
  }

  const grade = (lista: typeof fotos) => lista.map(m => (
    <button
      key={m.id}
      type="button"
      onClick={() => setAberta({ url: m.url, name: m.fileName })}
      className="h-20 w-20 overflow-hidden rounded-lg border border-border/60 transition-opacity hover:opacity-80"
      title={m.fileName}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.url} alt={m.caption || m.fileName} className="h-full w-full object-cover" />
    </button>
  ))

  const botao = (fase: "before" | "after", rotulo: string) => (
    <button
      type="button"
      onClick={() => abrirCamera(fase)}
      disabled={upload.isPending}
      title={fase === "before" ? "Photo of the problem" : "Photo proving it was fixed"}
      className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
    >
      {upload.isPending
        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        : <Camera className="h-4 w-4" />}
      <span className="text-[10px] font-medium">{upload.isPending ? "Sending" : rotulo}</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Antes e depois em faixas separadas, e rotuladas.
          Misturadas numa grade só, a prova da correção fica indistinguível da
          foto do problema, e o relatório perde justamente o par que ele existe
          para mostrar. A separação também é o que torna óbvio, olhando, por que
          um ponto ainda não fecha. */}
      {(antes.length > 0 || canWrite) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Before
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {grade(antes)}
            {canWrite && botao("before", antes.length ? "Add" : "Photo")}
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
          <div className="flex flex-wrap items-center gap-2">
            {grade(depois)}
            {canWrite && botao("after", depois.length ? "Add" : "Proof")}
          </div>
        </div>
      )}

      {canWrite && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async e => {
            const escolhidas = Array.from(e.target.files ?? [])
            e.target.value = ""
            for (const foto of escolhidas) {
              await upload.mutateAsync({ file: foto, eventId, phase: faseRef.current })
            }
          }}
        />
      )}

      {aberta && createPortal(
        <ImageWindow url={aberta.url} name={aberta.name} onClose={() => setAberta(null)} />,
        document.body,
      )}
    </div>
  )
}

/**
 * As tasks da obra.
 *
 * Task e note são a mesma coisa vista de dois lugares. Na prancha é um pino num
 * ponto do desenho; aqui é uma linha da lista, com quem abriu, quando, em que
 * obra, e o caminho de volta até o ponto exato.
 *
 * Não há como abrir uma task por aqui, e é de propósito: task nasce de um note
 * sobre a prancha, ancorada num ponto do desenho. Uma aberta solta pelo painel
 * seria justamente o registro sem lugar, que ninguém consegue localizar depois.
 */
export function EventsPanel({ jobsiteId, canWrite, sheetId }: {
  jobsiteId: string; canWrite: boolean; sheetId?: string
}) {
  const { data: events, isLoading } = useAtlasEvents(jobsiteId, sheetId)
  const remove = useDeleteAtlasEvent(jobsiteId, sheetId)
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  if (!events?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
        <p className="text-sm font-medium">Nothing on the punch list</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Points start on the drawing: open a sheet, mark the spot, and it shows
          up here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map(e => {
        const status = STATUS[e.status] ?? STATUS.open
        const isOpen = expanded === e.id
        const obra = [e.jobsiteName, e.jobsiteUnit].filter(Boolean).join(" · ")
        // Só dá para viajar quando o note continua preso a uma folha e a folha
        // ainda pertence a um documento vivo.
        const podeIr = !!e.sheetId && !!e.documentId

        return (
          <div key={e.id} className="rounded-lg border border-border/60 bg-card p-3">
            <div className="flex items-start gap-3">
              {/* Esquerda: o que é, em que pé está, e de que obra. */}
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                onClick={() => setExpanded(isOpen ? null : e.id)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                  {/* O número vem antes do título porque é por ele que o ponto
                      é chamado no canteiro e citado no relatório impresso. Quem
                      procura o 17 procura o número, não a frase. */}
                  {e.number != null && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                      {e.number}
                    </span>
                  )}
                  <span className="truncate text-sm font-medium leading-tight">
                    {e.title || e.body.slice(0, 60) || "Untitled"}
                  </span>
                  <Badge variant="outline" className={`shrink-0 ${status.className}`}>
                    {status.label}
                  </Badge>
                </span>
                {obra && (
                  <span className="flex min-w-0 items-center gap-1.5 pl-[22px] text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{obra}</span>
                  </span>
                )}
              </button>

              {/* Direita: quem abriu, quando, e o que existe pendurado nela. */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RoleName name={e.createdByName} role={e.createdByRole} />
                  <span>{quando(e.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  {e.pageX != null && (
                    <span className="flex items-center gap-1" title="Pinned on the drawing">
                      <MapPin className="h-3 w-3" />
                    </span>
                  )}
                  {/* Contador só quando há o que contar: um zero ao lado de um
                      ícone ocupa a mesma largura de um número e não informa
                      nada. */}
                  {e.media > 0 && (
                    <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                      <Camera className="h-3 w-3" />
                      {e.media}
                    </span>
                  )}
                  {e.replies > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {e.replies}
                    </span>
                  )}
                  {podeIr && (
                    // Viajar até o ponto: a folha abre, a prancha se aproxima da
                    // marca e ela pisca por três segundos. Ler "beam is 2 in.
                    // off" sem ver qual viga é ler metade do recado.
                    <button
                      type="button"
                      title="Open it on the drawing"
                      className="flex items-center gap-1 text-primary transition-opacity hover:opacity-70"
                      onClick={() => router.push(
                        `/atlas/${e.jobsiteId}/documents/${e.documentId}?sheet=${e.sheetId}&note=${e.id}`,
                      )}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            </div>

            {isOpen && (
              <div className="mt-3 flex flex-col gap-3">
                {e.body && <p className="whitespace-pre-wrap text-sm">{e.body}</p>}
                <Photos jobsiteId={jobsiteId} eventId={e.id} canWrite={canWrite} />
                <Thread
                  event={e}
                  jobsiteId={jobsiteId}
                  canWrite={canWrite}
                  sheetId={sheetId}
                  onDelete={() => remove.mutate(e.id)}
                  deleting={remove.isPending}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
