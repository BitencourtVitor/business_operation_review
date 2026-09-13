"use client"

import { PointAudio, PointPhase, ehAudio, ehImagem, ehVideo } from "@/components/atlas/point-media"
import { RoleName } from "@/components/atlas/role-icon"
import { useAtlasMedia, useAtlasReplies } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { CheckCircle2, Flag, Trash2 } from "lucide-react"

/** Data e hora como quem confere: dia curto e relógio de 24 horas. */
function quando(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Uma metade do ponto: o problema, ou a correção.
 *
 * O escrito à esquerda, as peças à direita, e a assinatura encostada no pé.
 * É a mesma forma que o ponto tem na janelinha sobre a prancha e no relatório
 * impresso: três superfícies mostram a mesma coisa, e quem aprende uma sabe
 * ler as outras.
 */
function Metade({ rotulo, icone: Icone, tom, texto, vazio, nome, cargo, data, children }: {
  rotulo: string
  icone: React.ElementType
  tom: "problema" | "solucao"
  texto: string
  /** O que se diz quando não há texto: a metade existe, o escrito ainda não. */
  vazio: string
  nome?: string
  cargo?: string
  data?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
          tom === "solucao" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
        }`}>
          <Icone className="h-3.5 w-3.5 shrink-0" />
          {rotulo}
        </span>

        {texto
          ? <p className="whitespace-pre-wrap text-sm leading-snug">{texto}</p>
          : <p className="text-sm italic text-muted-foreground">{vazio}</p>}

        {/* `mt-auto` prende a assinatura no pé, mesmo quando a coluna das peças
            é mais alta que a do texto: quem fez e quando é o fecho do registro,
            e fechar no meio deixava um vão. */}
        {(nome || data) && (
          <span className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-[11px] text-muted-foreground">
            {nome && <RoleName name={nome} role={cargo} />}
            {nome && data && <span aria-hidden>·</span>}
            {data && <span>{quando(data)}</span>}
          </span>
        )}
      </div>

      {children}
    </div>
  )
}

/**
 * O miolo de um ponto, onde quer que ele seja aberto.
 *
 * A lista de tasks da obra e a verificação de um escopo mostram o mesmo ponto
 * por dois caminhos, e o que se faz com ele é o mesmo: ler o problema, ver a
 * prova, registrar o conserto. Duas cópias disso divergiriam na primeira
 * mudança, e a primeira mudança já aconteceu duas vezes.
 *
 * ── Duas metades, e não faixas soltas ──
 *
 * Eram três faixas empilhadas ("Before", "After", o que foi dito) com as
 * miniaturas correndo por baixo de cada rótulo, e a descrição do ponto solta
 * acima de tudo. Nada ali dizia que o "before" era a prova daquela descrição, e
 * o ponto se lia de cima para baixo como quatro assuntos em vez de dois.
 * Agora são duas metades, separadas por uma linha: o problema com o texto e a
 * prova dele, e a correção com o que foi feito e a prova disso.
 *
 * ── O que saiu ──
 *
 * O campo de comentário solto. O que ele produzia era conversa perdida, um
 * "ok", um "amanhã", que não vira registro de nada e não entra no relatório. O
 * que já foi escrito continua à vista: apagar o passado de alguém não é decisão
 * de layout. Resolver também saiu, para o cabeçalho do ponto, onde se alcança
 * sem abrir a ficha.
 */
export function PointDetail({ jobsiteId, point, canWrite, onDelete, deleting }: {
  jobsiteId: string
  point: {
    id: string
    status: string
    body: string
    createdName?: string
    createdRole?: string
    createdAt?: string
    resolvedAt?: string
  }
  canWrite: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const { data: media } = useAtlasMedia(jobsiteId, { eventId: point.id })
  const pecas = (media ?? []).filter((m: AtlasMedia) => m.url)
  const visuais = pecas.filter(m => ehImagem(m) || ehVideo(m))
  const antes = visuais.filter(m => m.phase !== "after")
  const depois = visuais.filter(m => m.phase === "after")
  const gravacoes = pecas.filter(ehAudio)

  const { data: replies } = useAtlasReplies(point.id)

  // A correção aparece quando existe prova dela, quando alguém marcou o ponto
  // como resolvido, ou quando há quem registre. Para quem só lê, ponto pendente
  // não ganha metade vazia.
  const temSolucao = depois.length > 0 || point.status === "resolved" || canWrite
  // O que foi feito, escrito peça por peça na hora de documentar a correção.
  const oQueFoiFeito = depois
    .map(m => [m.title, m.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border/60">
        <Metade
          rotulo="Problem"
          icone={Flag}
          tom="problema"
          texto={point.body}
          vazio="No description."
          nome={point.createdName}
          cargo={point.createdRole}
          data={point.createdAt}
        >
          <PointPhase
            jobsiteId={jobsiteId}
            eventId={point.id}
            canWrite={canWrite}
            fase="before"
            pecas={antes}
          />
        </Metade>

        {temSolucao && (
          <Metade
            rotulo="Solution"
            icone={CheckCircle2}
            tom="solucao"
            texto={oQueFoiFeito}
            vazio={point.status === "resolved"
              ? "Marked as resolved, with nothing written about the fix."
              : "Not fixed yet. Photograph what was done and describe it here."}
            data={point.resolvedAt}
          >
            <PointPhase
              jobsiteId={jobsiteId}
              eventId={point.id}
              canWrite={canWrite}
              fase="after"
              pecas={depois}
            />
          </Metade>
        )}
      </div>

      <PointAudio gravacoes={gravacoes} />

      {/* O que já foi dito continua à vista, mesmo sem se poder dizer mais. */}
      {(replies?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
          {replies?.map(r => (
            <div key={r.id} className="flex flex-col gap-0.5 rounded-md bg-muted/60 p-2.5">
              <span className="text-xs font-medium">{r.authorName || "Someone"}</span>
              <span className="whitespace-pre-wrap text-sm">{r.body}</span>
              <span className="text-[11px] text-muted-foreground">{quando(r.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Apagar é o fim do outro tipo: a task que não deveria existir. */}
      {canWrite && (
        <div className="flex justify-end border-t border-border/50 pt-3">
          <button
            type="button"
            title="Delete this point"
            disabled={deleting}
            onClick={onDelete}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

/** Data e hora como quem confere. Exportada porque a verificação usa a mesma. */
export { quando }
