"use client"

import { Input } from "@/components/ui/input"
import { PointMedia } from "@/components/atlas/point-media"
import {
  useAtlasReplies, useCreateAtlasReply, useUpdateAtlasEvent,
} from "@/hooks/use-atlas"
import { CheckCircle2, MessageSquare, RotateCcw, Send, Trash2 } from "lucide-react"
import { useState } from "react"

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
  event: { id: string; status: string }
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
 * O miolo de um ponto, onde quer que ele seja aberto.
 *
 * A lista de tasks da obra e a verificação de um escopo mostram o mesmo ponto
 * por dois caminhos, e o que se faz com ele é o mesmo: ler a descrição, ver o
 * antes e o depois, ouvir o que foi dito, comentar, encerrar. Duas cópias disso
 * divergiriam na primeira mudança, e a primeira mudança já aconteceu duas vezes.
 */
export function PointDetail({ jobsiteId, point, canWrite, sheetId, onDelete, deleting }: {
  jobsiteId: string
  point: { id: string; status: string; body: string }
  canWrite: boolean
  sheetId?: string
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {point.body && <p className="whitespace-pre-wrap text-sm">{point.body}</p>}
      <PointMedia jobsiteId={jobsiteId} eventId={point.id} canWrite={canWrite} />
      <Thread
        event={point}
        jobsiteId={jobsiteId}
        canWrite={canWrite}
        sheetId={sheetId}
        onDelete={onDelete}
        deleting={deleting}
      />
    </div>
  )
}

/** Data e hora como quem confere. Exportada porque a verificação usa a mesma. */
export { quando }
