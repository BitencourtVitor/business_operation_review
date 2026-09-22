"use client"

import { useAddForecastObs, useForecastObs } from "@/hooks/use-forecast"
import { FileClock, Gauge, CodeXml, Loader2, MessageSquareText, SendHorizontal, User, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

/** Same role iconography as Settings › Users, so a badge means the same thing everywhere. */
const ROLE_ICON: Record<string, { Icon: React.ElementType; className: string }> = {
  dev:     { Icon: CodeXml,   className: "text-yellow-600 dark:text-yellow-400" },
  owner:   { Icon: Gauge, className: "text-emerald-600 dark:text-emerald-400" },
  manager: { Icon: Users, className: "text-primary" },
  user:    { Icon: User,  className: "text-muted-foreground" },
  // Observations that predate authorship tracking, seeded by migration 000106.
  system:  { Icon: FileClock, className: "text-muted-foreground" },
}

/** First name only — the card and the history rows both credit the author this way. */
export function firstName(full?: string | null): string {
  if (!full) return ""
  return full.trim().split(/\s+/)[0] ?? ""
}

/** Timestamps arrive as UTC instants; render them in the reader's local date. */
export function fmtStamp(ts?: string | null): string {
  if (!ts) return ""
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

export function ObsCredit({
  author,
  role,
  at,
  className,
}: {
  author?: string | null
  role?: string | null
  at?: string | null
  className?: string
}) {
  const who  = firstName(author)
  const when = fmtStamp(at)
  if (!who && !when) return null

  const meta = role ? ROLE_ICON[role] : undefined

  return (
    <span className={cn("flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80", className)}>
      {meta && <meta.Icon className={cn("h-3 w-3 shrink-0", meta.className)} />}
      {who}
      {who && when && " · "}
      {when}
    </span>
  )
}

/**
 * A conversa da obra, do mais antigo para o mais recente, com o campo de
 * escrever no pé. Fica ao lado do corpo do modal, e não dentro dele, para a
 * coluna principal não crescer.
 */
export function ObsHistoryPanel({
  projectId,
  open,
  onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  const { data: entries = [], isLoading } = useForecastObs(projectId, open)
  const publicar = useAddForecastObs(projectId)
  const [texto, setTexto] = useState("")
  // A conversa abre no fim, que é onde está o assunto de agora. Rolar até o
  // começo é escolha de quem quer o histórico, não o estado inicial.
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" })
  }, [entries.length])

  const enviar = () => {
    const corpo = texto.trim()
    if (!corpo || publicar.isPending) return
    publicar.mutate(corpo, { onSuccess: () => setTexto("") })
  }

  return (
    <div className="flex max-h-[85vh] w-full shrink-0 flex-col border-t bg-muted/20 sm:w-[320px] sm:border-l sm:border-t-0">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Comments
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close comments"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No comments yet. Write the first one below.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => (
              <div key={e.id} className="rounded-lg border bg-background px-3 py-2">
                <p className="whitespace-pre-wrap text-xs leading-relaxed">{e.body}</p>
                <div className="mt-1.5 flex items-center justify-end">
                  <ObsCredit author={e.authorName} role={e.authorRole} at={e.createdAt} />
                </div>
              </div>
            ))}
            <div ref={fim} />
          </div>
        )}
      </div>

      {/* Escrever fica no pé, colado na última fala, como em qualquer conversa.
          Enter envia e Shift+Enter quebra linha: o comentário é quase sempre
          de uma linha, e obrigar a mirar no botão para cada um seria trabalho
          repetido. O campo cresce até certo ponto e então rola por dentro, em
          vez de empurrar a conversa para fora da tela. */}
      <div className="shrink-0 border-t bg-background/60 p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
            rows={1}
            placeholder="Write a comment"
            disabled={publicar.isPending}
            className="max-h-24 min-h-8 flex-1 resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/50 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!texto.trim() || publicar.isPending}
            aria-label="Send comment"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {publicar.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <SendHorizontal className="h-3.5 w-3.5" />}
          </button>
        </div>
        {publicar.isError && (
          <p className="mt-1.5 px-0.5 text-[10px] text-destructive">
            The comment was not saved. Try again.
          </p>
        )}
      </div>
    </div>
  )
}
