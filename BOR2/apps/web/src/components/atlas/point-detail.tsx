"use client"

import { PointPhase, ehImagem, ehVideo } from "@/components/atlas/point-media"
import { RoleName } from "@/components/atlas/role-icon"
import { useAtlasMedia, useUpdateAtlasEvent } from "@/hooks/use-atlas"
import type { AtlasMedia } from "@/services/atlas.service"
import { SolutionDialog } from "@/components/atlas/solution-dialog"
import { CalendarDays, CheckCircle2, Flag } from "lucide-react"
import { useState } from "react"

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
 * O escrito à esquerda, as peças à direita, e a assinatura embaixo das duas,
 * na largura inteira. Presa dentro da coluna do texto, ela ficava espremida
 * na metade da largura sempre que o baralho de fotos era mais baixo que o
 * texto, com o resto da linha vazio ao lado. É a mesma forma que o ponto tem
 * na janelinha sobre a prancha e no relatório impresso: três superfícies
 * mostram a mesma coisa, e quem aprende uma sabe ler as outras.
 */
function Metade({ rotulo, icone: Icone, tom, titulo, texto, vazio, nome, cargo, data, children }: {
  rotulo: string
  icone: React.ElementType
  tom: "problema" | "solucao"
  /** O título do problema, ou da solução, logo abaixo do rótulo. */
  titulo?: string
  texto: string
  /** O que se diz quando não há texto: a metade existe, o escrito ainda não. */
  vazio: string
  nome?: string
  cargo?: string
  data?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
            tom === "solucao" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          }`}>
            <Icone className="h-3.5 w-3.5 shrink-0" />
            {rotulo}
          </span>

          {titulo && <p className="text-sm font-semibold leading-snug">{titulo}</p>}
          {texto
            ? <p className="whitespace-pre-wrap text-sm leading-snug">{texto}</p>
            : !titulo && <p className="text-sm italic text-muted-foreground">{vazio}</p>}
        </div>

        {children}
      </div>

      {/* Fora da coluna do texto, na largura inteira: quem fez e quando é o
          fecho do registro, e não um detalhe amarrado a uma das duas metades.
          Mesma forma do cabeçalho do ponto (nome, barra, data com ícone): o
          responsável e a hora só aparecem aqui agora, e não lá em cima. */}
      {(nome || data) && (
        <span className="flex flex-wrap items-center justify-evenly gap-2 pt-1 text-[11px] text-muted-foreground">
          {nome && <RoleName name={nome} role={cargo} />}
          {nome && data && <span aria-hidden className="h-3 w-px shrink-0 bg-border" />}
          {data && (
            <span className="flex items-center gap-1.5 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {quando(data)}
            </span>
          )}
        </span>
      )}
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
 * O comentário solto e o áudio. O que eles produziam era conversa perdida, um
 * "ok", um "amanhã", que não vira registro de nada e não entra no relatório.
 * Por decisão do Vitor em 13/09, nem o que já existia aparece mais.
 */
export function PointDetail({ jobsiteId, point, canWrite, rodape }: {
  jobsiteId: string
  point: {
    id: string
    status: string
    title?: string
    body: string
    createdName?: string
    createdRole?: string
    createdAt?: string
    resolvedAt?: string
    resolvedName?: string
    resolvedRole?: string
  }
  canWrite: boolean
  /**
   * As ações do ponto, no pé da ficha.
   *
   * O cabeçalho ficou só com o que identifica o ponto e o chevron que abre: as
   * ações pediam a ficha aberta de qualquer jeito, porque resolver sem ver a
   * prova e apagar sem ler o problema são os dois enganos que se quer evitar.
   * Quem monta a lista decide o que entra aqui, porque é ela que sabe quem pode
   * o quê.
   */
  rodape?: React.ReactNode
}) {
  const { data: media } = useAtlasMedia(jobsiteId, { eventId: point.id })
  const pecas = (media ?? []).filter((m: AtlasMedia) => m.url)
  const visuais = pecas.filter(m => ehImagem(m) || ehVideo(m))
  const antes = visuais.filter(m => m.phase !== "after")
  const depois = visuais.filter(m => m.phase === "after")
  const condicao = useUpdateAtlasEvent(jobsiteId)
  const [registrando, setRegistrando] = useState(false)

  // A correção aparece quando existe prova dela, quando alguém marcou o ponto
  // como resolvido, ou quando há quem registre. Para quem só lê, ponto pendente
  // não ganha metade vazia.
  const temSolucao = depois.length > 0 || point.status === "resolved" || canWrite
  // O que foi feito, escrito peça por peça na hora de documentar a correção.
  // A primeira peça com título dá o título da solução; o que se escreveu nas
  // peças vira o corpo, na ordem em que subiram.
  const pecaTitulo = depois.find(m => m.title)
  const tituloDaSolucao = pecaTitulo?.title ?? ""
  const oQueFoiFeito = depois
    .map(m => m === pecaTitulo ? m.description : [m.title, m.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border/60">
        <Metade
          rotulo="Problem"
          icone={Flag}
          tom="problema"
          titulo={point.title}
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
            tom={depois.length > 0 || point.status === "resolved" ? "solucao" : "problema"}
            titulo={tituloDaSolucao}
            texto={oQueFoiFeito}
            vazio={point.status === "resolved"
              ? "Marked as resolved, with nothing written about the fix."
              : "Not fixed yet."}
            nome={point.resolvedName}
            cargo={point.resolvedRole}
            // A solução tem data como o problema tem. Resolvido, é quando foi
            // marcado; ainda sem marca, é quando a última prova do conserto subiu.
            data={point.resolvedAt || depois[depois.length - 1]?.uploadedAt}
          >
            {/* Sem solução registrada, a metade oferece o registro inteiro, e não
                uma câmera solta: o mesmo formulário com que o problema entrou. */}
            {depois.length === 0 ? (
              canWrite && (
                <button
                  type="button"
                  onClick={() => setRegistrando(true)}
                  className="flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-emerald-500/40 px-3 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Problem solved
                </button>
              )
            ) : (
            <PointPhase
              jobsiteId={jobsiteId}
              eventId={point.id}
              canWrite={canWrite}
              fase="after"
              pecas={depois}
              // Registrar a solução é resolver o ponto: a prova do conserto
              // subiu, e deixar o ponto pendente pedia um segundo gesto que
              // ninguém lembrava de fazer.
              onRegistrou={() => {
                if (point.status !== "resolved") {
                  condicao.mutate({ eventId: point.id, patch: { status: "resolved" } })
                }
              }}
            />
            )}
          </Metade>
        )}
      </div>

      {canWrite && (
        <SolutionDialog
          jobsiteId={jobsiteId}
          eventId={point.id}
          jaResolvido={point.status === "resolved"}
          open={registrando}
          onClose={() => setRegistrando(false)}
        />
      )}

      {rodape && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {rodape}
        </div>
      )}
    </div>
  )
}

/** Data e hora como quem confere. Exportada porque a verificação usa a mesma. */
export { quando }
