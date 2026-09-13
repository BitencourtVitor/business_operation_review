"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/atlas/panel"
import { PointDetail } from "@/components/atlas/point-detail"
import { PunchSheet } from "@/components/atlas/punch-sheet"
import { RoleName } from "@/components/atlas/role-icon"
import { PunchReportButton } from "@/components/atlas/punch-report-dialog"
import {
  useAtlasPunchPoints, useAtlasPunchScopes, useAtlasPunches,
  useCloseAtlasPunch, useDeleteAtlasEvent, useOpenAtlasPunch, useReopenAtlasPunch,
} from "@/hooks/use-atlas"
import type { AtlasPunchPoint, AtlasPunchScope } from "@/services/atlas.service"
import {
  Building2, Camera, CheckCircle2, ChevronDown, ClipboardCheck,
  ExternalLink, FileVolume, Layers, MapPin, MessageSquare,
  RotateCcw, Stamp, Tag, Video,
} from "lucide-react"
import { useEffect, useState } from "react"

/**
 * A verificação da obra, escopo por escopo.
 *
 * ── Por que a tela abre em blocos, e não na lista ──
 *
 * Quem chega aqui quase nunca quer "todos os pontos da obra". Quer o primeiro
 * andar, ou a unidade C, ou o permit set. O subcontratado então é o caso
 * extremo: ele abre o Atlas para saber o que falta fazer no andar em que está
 * trabalhando hoje, e uma lista de cento e vinte pontos de sete escopos
 * diferentes não responde isso, responde outra coisa.
 *
 * Então a primeira tela é o mapa: um bloco por escopo, com quantos pendentes e
 * quantos concluídos. O número de pendentes é o que se toca, e ele leva direto
 * para a lista já filtrada, porque é essa a pergunta que trouxe a pessoa aqui.
 *
 * ── Ver e editar são coisas diferentes ──
 *
 * Quem resolve o punch é, em geral, gente da Premium. O subcontratado precisa
 * ver, e não precisa poder mexer. Isso não é uma tela à parte: é a mesma, com os
 * botões de escrita ausentes, porque manter duas telas para o mesmo conteúdo é
 * garantir que uma delas fique para trás.
 */

const dataCurta = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type Aberto = { escopo: AtlasPunchScope; condicao: "" | "open" | "resolved" }

/**
 * Como o escopo se chama na tela.
 *
 * A subcategoria é curta por natureza: "1st", "C". Sozinha ela não diz o que é,
 * e é ela que mais importa aqui, porque a rodada corre por andar e por unidade
 * antes de correr por categoria. O eixo entra junto e vira "1st Floor" e
 * "C Unit", que é como o resto do Atlas já escreve a etiqueta de uma pasta.
 *
 * Categoria continua com o nome dela, que já se explica sozinho.
 */
function nomeDoEscopo(escopo: AtlasPunchScope): string {
  if (escopo.kind !== "subcategory") return escopo.value
  if (escopo.axis === "floor") return `${escopo.value} Floor`
  if (escopo.axis === "unit") return `${escopo.value} Unit`
  return escopo.value
}

export function PunchPanel({ jobsiteId, jobsiteName, canWrite, canManage }: {
  jobsiteId: string
  jobsiteName: string
  canWrite: boolean
  canManage: boolean
}) {
  const { data: escopos, isLoading } = useAtlasPunchScopes(jobsiteId)
  const abrir = useOpenAtlasPunch(jobsiteId)
  const [aberto, setAberto] = useState<Aberto | null>(null)

  if (isLoading) {
    return (
      <Panel title="Punch rounds">
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      </Panel>
    )
  }

  if (aberto) {
    return (
      <PunchScopeView
        jobsiteId={jobsiteId}
        jobsiteName={jobsiteName}
        escopo={aberto.escopo}
        condicaoInicial={aberto.condicao}
        canWrite={canWrite}
        canManage={canManage}
        onBack={() => setAberto(null)}
      />
    )
  }

  // Escopo que ninguém começou só aparece para quem pode começar.
  //
  // O cartão apagado é um convite, e convite só serve para quem pode aceitar.
  // Quem tem acesso de leitura, que é o caso do subcontratado, abre esta tela
  // para saber o que falta fazer no andar em que está hoje: mostrar a ele cinco
  // escopos vazios com um botão que ele não pode tocar é ocupar a tela com o que
  // não lhe diz respeito e ainda insinuar que ele deveria fazer algo ali.
  //
  // Escopo com rodada fechada continua à vista de todos: ali houve verificação,
  // e o histórico é justamente o que ele pode consultar.
  const visiveis = (escopos ?? []).filter(e => canWrite || e.punchId || e.closed > 0)

  if (!visiveis.length) {
    return (
      <Panel title="Punch rounds">
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">
            {escopos?.length ? "Nothing being walked here yet" : "No scope to verify yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {escopos?.length
              ? "When a round opens on a floor, a unit or a folder of this jobsite, it shows up here."
              : "A scope comes from the folders of this jobsite: a floor, a unit, or a folder like the permit set. Attach a document and it shows up here."}
          </p>
        </div>
      </Panel>
    )
  }

  const rodadasAbertas = visiveis.filter(e => e.punchId).length

  return (
    <Panel
      title="Punch rounds"
      action={(
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {rodadasAbertas} open of {visiveis.length} {visiveis.length === 1 ? "scope" : "scopes"}
        </span>
      )}
    >
      {/* A grade se adapta: uma coluna no celular, duas no tablet, três do
          computador para cima. O cartão vive bem com trezentos de largura, e
          esperar o xl deixava meia tela vazia numa lista de nove escopos.

          Cada cartão tem a altura que o conteúdo dele pede. A grade estica os
          itens por padrão, e o escopo sem rodada, que tem um botão onde o outro
          tem três números, ficava com um vão cinza embaixo do botão só para
          acompanhar a altura do vizinho. */}
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map(e => (
          <ScopeCard
            key={`${e.kind}:${e.value}`}
            escopo={e}
            canWrite={canWrite}
            abrindo={abrir.isPending}
            onStart={() => abrir.mutate(
              { scopeKind: e.kind, scopeValue: e.value },
              { onSuccess: () => setAberto({ escopo: e, condicao: "" }) },
            )}
            onOpen={condicao => setAberto({ escopo: e, condicao })}
          />
        ))}
      </div>
    </Panel>
  )
}

/**
 * Um escopo, com o andamento da passagem aberta nele.
 *
 * Container com dois blocos, que é como o resto do Atlas se organiza: em cima a
 * identificação, embaixo os números, separados por uma borda e com fundo
 * próprio. Um bloco só, com tudo empilhado, faz o número e o nome disputarem a
 * mesma leitura.
 *
 * **A metadata fica do lado oposto ao que ela descreve.** O nome de quem abriu a
 * rodada vai à direita do título, e a data à direita da contagem de pastas. É a
 * mesma regra da linha do ponto lá dentro, e é o que permite varrer a coluna da
 * esquerda lendo só o que as coisas são, e a da direita lendo só quem e quando.
 *
 * ── Os números não clicam ──
 *
 * Eles já foram três botões, um por condição, que abriam a lista filtrada. Era
 * conveniente para quem sabia o que estava fazendo e uma armadilha para todo o
 * resto: três alvos de dez por vinte, colados, num cartão que inteiro significa
 * "abrir este escopo". Errar o toque levava a pessoa para uma lista que ela não
 * pediu, e no celular errar é o caso comum.
 *
 * Agora o cartão tem um destino só. Filtrar é escolha de quem já está dentro,
 * onde as abas de condição ficam grandes e separadas.
 */
function ScopeCard({ escopo, canWrite, abrindo, onStart, onOpen }: {
  escopo: AtlasPunchScope
  canWrite: boolean
  abrindo: boolean
  onStart: () => void
  onOpen: (condicao: "" | "open" | "resolved") => void
}) {
  const semRodada = !escopo.punchId
  // A categoria que dá nome ao escopo não se repete embaixo dele. No escopo de
  // categoria o título já é o nome da pasta, e escrevê-lo de novo na linha de
  // baixo é a mesma informação duas vezes; sobra a contagem, que ali ainda diz
  // algo quando são várias pastas da mesma categoria.
  const pastas = (escopo.folders ?? []).filter(nome => nome !== escopo.value)
  /**
   * A identificação do escopo, em três linhas curtas.
   *
   * Uma coisa por linha, e cada uma com a largura inteira do cartão. A primeira
   * versão punha o nome e o crachá de quem abriu na mesma linha, e num cartão de
   * trezentos o nome longo quebrava no meio da palavra com o crachá boiando ao
   * lado: ficava feio e ainda cortava o que importa.
   *
   *   1. o nome do escopo, sozinho
   *   2. de quais categorias ele é, uma etiqueta por categoria
   *   3. quem abriu, quando, e o tamanho do que se vai percorrer
   *
   * **A segunda linha é o ponto.** Um andar junta categorias diferentes: o
   * primeiro andar tem Wall Panels e Floor Layout, e a rodada dele percorre as
   * duas de uma vez. Cada uma vira uma etiqueta com ícone, e quando forem cinco
   * elas descem para a linha seguinte em vez de sumirem no corte.
   */
  const identificacao = (
    <>
      <span className="flex items-center gap-2">
        {/* O ícone diz de que eixo é o escopo sem gastar uma linha de texto:
            camadas para pavimento ou unidade, prédio para categoria sem eixo. */}
        {escopo.kind === "subcategory"
          ? <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nomeDoEscopo(escopo)}</span>
      </span>

      {pastas.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {pastas.map(nome => (
            <span
              key={nome}
              className="flex max-w-full items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground"
            >
              <Tag className="h-3 w-3 shrink-0" />
              <span className="truncate">{nome}</span>
            </span>
          ))}
        </span>
      )}

      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {escopo.punchId && escopo.openedName && (
            <RoleName name={escopo.openedName} role={escopo.openedRole} />
          )}
          {escopo.punchId && <span className="shrink-0">· {dataCurta(escopo.openedAt)}</span>}
          {!escopo.punchId && escopo.closed > 0 && (
            <span className="truncate">
              {escopo.closed} closed {escopo.closed === 1 ? "round" : "rounds"}
            </span>
          )}
        </span>
        {/* O tamanho do que se vai percorrer. Some quando não há folha: zero
            prancha é a pasta declarada e ainda vazia, e o número não ajuda. */}
        {escopo.sheets > 0 && <span className="shrink-0">{escopo.sheets} sheets</span>}
      </span>
    </>
  )

  // Com rodada, o cartão inteiro é um alvo só: tocar em qualquer parte abre o
  // escopo. Sem rodada, a identificação abre o histórico e o botão de começar
  // fica sozinho no bloco de baixo, que é a única outra coisa que se faz aqui.
  // Escopo que ninguém começou a percorrer se apaga.
  //
  // Numa obra com vinte escopos, a maioria não tem rodada, e com todos os
  // cartões no mesmo peso a grade vira um mural de botões azuis: o olho não
  // encontra os quatro que de fato têm alguma coisa acontecendo. Aqui a moldura
  // é tracejada, o fundo quase não existe e o cartão inteiro fica translúcido,
  // que é como o Atlas já desenha vaga esperando conteúdo. O botão vem como
  // contorno, e não cheio: ele continua sendo a ação, sem gritar.
  //
  // A transparência sai no toque do mouse, para quem for usar o cartão o ver
  // inteiro.
  if (semRodada) {
    return (
      <div className="flex flex-col overflow-hidden rounded-lg border border-dashed border-border/60 bg-card/30 opacity-70 transition-opacity hover:opacity-100">
        <button
          type="button"
          className="flex flex-col gap-1 px-3 py-2.5 text-left"
          onClick={() => onOpen("")}
        >
          {identificacao}
        </button>
        <div className="border-t border-dashed border-border/60 p-2">
          {canWrite ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              disabled={abrindo}
              onClick={onStart}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {escopo.closed > 0 ? "Start a new round" : "Start a punch round"}
            </Button>
          ) : (
            <span className="flex justify-center py-1 text-xs text-muted-foreground">
              Nothing being walked here right now
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpen("")}
      className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-colors hover:border-primary/40"
    >
      <span className="flex flex-col gap-1 px-3 py-2.5">{identificacao}</span>

      {/* Pendentes vem primeiro e é o único com cor: é a pergunta que traz
          alguém a esta tela, e as outras duas existem para dar tamanho a ela.
          Um número de pendentes em zero não fica apagado, fica verde: escopo
          sem nada em aberto é boa notícia e tem que se ler como tal. */}
      <span className="grid w-full grid-cols-3 gap-1.5 border-t border-border/60 bg-muted/20 p-2">
        <Metric valor={escopo.open} rotulo="Pending" tom={escopo.open > 0 ? "aberto" : "feito"} />
        <Metric valor={escopo.resolved} rotulo="Resolved" tom="neutro" />
        <Metric valor={escopo.total} rotulo="Total" tom="neutro" />
      </span>
    </button>
  )
}

function Metric({ valor, rotulo, tom }: {
  valor: number
  rotulo: string
  tom: "aberto" | "feito" | "neutro"
}) {
  const cor = tom === "aberto"
    ? "text-amber-600 dark:text-amber-400"
    : tom === "feito"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-foreground"
  return (
    <span className="flex flex-col items-center gap-0.5 rounded-md border border-border/60 bg-card py-2">
      <span className={`text-lg font-semibold leading-none tabular-nums ${cor}`}>{valor}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
    </span>
  )
}

/**
 * As três condições da lista, num controle de três posições.
 *
 * Três pastilhas soltas não diziam que a escolha é excludente: o desenho tem que
 * dizer isso antes de a pessoa descobrir clicando. O número vai junto porque é
 * ele que responde "quanto falta" sem sair da lista.
 *
 * **Compacto** é a versão do cabeçalho: mesma peça, menos folga, para caber na
 * faixa das outras ações sem esticar a altura do cabeçalho.
 */
function Filtros({ escopo, condicao, onChange, compacto = false, className = "" }: {
  escopo: AtlasPunchScope
  condicao: "" | "open" | "resolved"
  onChange: (v: "" | "open" | "resolved") => void
  compacto?: boolean
  className?: string
}) {
  // No cabeçalho o controle tem 32 de altura, que é a medida das ações da
  // faixa: Report, Sign off e ele se leem como uma fileira só, e qualquer
  // diferença de altura aí aparece como desalinho.
  return (
    <div className={`flex w-full items-center gap-1 rounded-lg border border-border/60 bg-muted/20 sm:w-fit ${compacto ? "h-8 p-0.5" : "p-1"} ${className}`}>
      {([
        ["", "All", escopo.total],
        ["open", "Pending", escopo.open],
        ["resolved", "Resolved", escopo.resolved],
      ] as const).map(([valor, rotulo, quantos]) => (
        <button
          key={valor}
          type="button"
          onClick={() => onChange(valor)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors sm:flex-none ${
            compacto ? "h-full px-2.5" : "px-3 py-1.5"
          } ${
            condicao === valor
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          {rotulo}
          <span className={`tabular-nums ${
            valor === "open" && quantos > 0 ? "text-amber-600 dark:text-amber-400"
              : valor === "resolved" && quantos > 0 ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }`}>
            {quantos}
          </span>
        </button>
      ))}
    </div>
  )
}

/** A lista de pontos de um escopo, com o que dá para fazer com a passagem. */
function PunchScopeView({
  jobsiteId, jobsiteName, escopo, condicaoInicial, canWrite, canManage, onBack,
}: {
  jobsiteId: string
  jobsiteName: string
  escopo: AtlasPunchScope
  condicaoInicial: "" | "open" | "resolved"
  canWrite: boolean
  canManage: boolean
  onBack: () => void
}) {
  const [condicao, setCondicao] = useState(condicaoInicial)
  const [expandido, setExpandido] = useState<string | null>(null)
  // A prancha aberta por cima da lista. Ver documento é uma coisa, conduzir a
  // verificação é outra, e trocar de tela para ver o desenho tirava a pessoa do
  // meio do percurso.
  const [noDesenho, setNoDesenho] = useState<AtlasPunchPoint | null>(null)
  const [erro, setErro] = useState("")
  // Onde desenhar o aviso do Sign off travado: o meio do botão e o topo dele.
  //
  // A posição é medida do botão e o aviso sai preso à tela, e não ao painel: o
  // painel corta o que passa das bordas dele, e o aviso mora justamente acima da
  // primeira linha do cabeçalho.
  const [aviso, setAviso] = useState<{ x: number; y: number; toque: boolean } | null>(null)

  // Aberto no toque, ele some sozinho. No celular não existe tirar o ponteiro de
  // cima, e sem isso ele ficaria de pé esperando um gesto que não vem.
  useEffect(() => {
    if (!aviso?.toque) return
    const t = setTimeout(() => setAviso(null), 2600)
    return () => clearTimeout(t)
  }, [aviso])

  const filtro = { scope: escopo.value, status: condicao || undefined }
  const { data: pontos, isLoading } = useAtlasPunchPoints(jobsiteId, filtro)
  const { data: passagens } = useAtlasPunches(jobsiteId, { scope: escopo.value })
  const abrir = useOpenAtlasPunch(jobsiteId)
  const fechar = useCloseAtlasPunch(jobsiteId)
  const reabrir = useReopenAtlasPunch(jobsiteId)
  const remover = useDeleteAtlasEvent(jobsiteId)

  const aberta = (passagens ?? []).find(p => !p.closedAt)
  // Assinar com ponto em aberto é o que o banco recusa de qualquer jeito: a
  // tela passa a dizer isso antes, em vez de deixar a pessoa tentar e falhar.
  const travado = escopo.open > 0
  const fechadas = (passagens ?? []).filter(p => p.closedAt)

  return (
    <Panel
      title={nomeDoEscopo(escopo)}
      onBack={onBack}
      backLabel="Scopes"
      stackActions
      action={(
        // Duas ações de gravidade diferente, e o desenho diz qual é qual: o
        // relatório é contorno, porque só produz um arquivo e se refaz quantas
        // vezes quiser; a ação da rodada é cheia, porque muda o estado da
        // verificação. Antes as duas saíam idênticas, lado a lado.
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {/* Tudo colado à direita, do outro lado do voltar: o filtro é comando
              da lista como Report e Sign off, e os três se leem como um grupo só.
              Espalhado pela largura, o filtro ficava órfão num canto e o
              relatório boiando no meio. */}
          <div className="flex shrink-0 items-center gap-2">
          <Filtros escopo={escopo} condicao={condicao} onChange={setCondicao} compacto className="hidden sm:flex" />
          <PunchReportButton
            jobsiteId={jobsiteId}
            jobsiteName={jobsiteName}
            scope={escopo.value}
          />

          {/* Abrir, assinar e reabrir são de quem conduz a verificação.

              Abrir aparece só quando não há passagem: o primeiro ponto de um
              escopo abre uma sozinho, e o botão existe para quem quer começar a
              rodada antes de sair a campo, com data marcada. */}
          {canWrite && !aberta && (
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              disabled={abrir.isPending}
              onClick={() => abrir.mutate({ scopeKind: escopo.kind, scopeValue: escopo.value })}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span>Start a round</span>
            </Button>
          )}
          {/* "Sign off" e não "Close the round": encerrar a rodada é assinar
              embaixo do que foi percorrido, e é assim que se chama a coisa em
              obra. O rótulo antigo descrevia a mecânica da tela. */}
          {canManage && aberta && (
            travado ? (
              /* Rodada com pendência não assina, e o botão diz isso antes de a
                 pessoa tentar: sai apagado. Ele continua clicável de propósito,
                 porque botão morto não explica por que está morto: passar o
                 ponteiro ou tocar diz quantos pontos ainda faltam. */
              <>
                <Button
                  size="sm"
                  aria-disabled
                  className="h-8 shrink-0 gap-1.5 opacity-50"
                  onPointerEnter={e => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setAviso({ x: r.left + r.width / 2, y: r.top, toque: false })
                  }}
                  onPointerLeave={() => setAviso(a => (a?.toque ? a : null))}
                  onClick={e => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setAviso({ x: r.left + r.width / 2, y: r.top, toque: true })
                  }}
                >
                  <Stamp className="h-3.5 w-3.5" />
                  <span>Sign off</span>
                </Button>
                {aviso && (
                  <span
                    style={{ left: aviso.x, top: aviso.y - 6 }}
                    className="pointer-events-none fixed z-50 flex w-max -translate-x-1/2 -translate-y-full flex-col items-center rounded-md bg-foreground px-3 py-1.5 text-center text-xs text-background"
                  >
                    <span className="font-bold">Not yet</span>
                    <span>
                      {escopo.open} {escopo.open === 1 ? "point" : "points"} still pending
                    </span>
                  </span>
                )}
              </>
            ) : (
              <Button
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                disabled={fechar.isPending}
                onClick={() => {
                  setErro("")
                  fechar.mutate(aberta.id, {
                    onError: () => setErro(
                      "This round still has pending points. Close them first, or reopen them later.",
                    ),
                  })
                }}
              >
                <Stamp className="h-3.5 w-3.5" />
                <span>Sign off</span>
              </Button>
            )
          )}
          </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-3">
      {/* As rodadas já assinadas deste escopo. Existem para provar que a
          verificação aconteceu, e para reabrir quando alguém assinou cedo. */}
      {fechadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="shrink-0">Signed off:</span>
          {fechadas.map(p => (
            <span key={p.id} className="flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5">
              {dataCurta(p.openedAt)} to {dataCurta(p.closedAt)} · {p.total} points
              {canManage && (
                <button
                  type="button"
                  title="Reopen this round"
                  disabled={reabrir.isPending || !!aberta}
                  onClick={() => reabrir.mutate(p.id)}
                  className="ml-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {erro && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {erro}
        </p>
      )}

      {/* No celular o controle mora aqui, em cima da lista, ocupando a largura
          toda: um terço para cada, que é alvo de dedo. Do tablet para cima ele
          sobe para o cabeçalho, onde sobra espaço e ele fica na mesma faixa das
          outras ações da rodada. */}
      <Filtros escopo={escopo} condicao={condicao} onChange={setCondicao} className="sm:hidden" />


      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : !pontos?.length ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-medium">
            {condicao === "open" ? "Nothing pending here" : "Nothing on this scope yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Points start on the drawing: open a sheet, mark the spot, and it
            shows up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pontos.map(p => {
            const isOpen = expandido === p.id
            const temRegistro = p.photos > 0 || p.videos > 0 || p.audios > 0
              || p.comments > 0 || (p.status !== "resolved" && p.after > 0)
            return (
              <div
                key={p.id}
                className={`overflow-hidden rounded-lg border bg-card transition-colors ${
                  isOpen ? "border-primary/40" : "border-border/60 hover:border-border"
                }`}
              >
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                    onClick={() => setExpandido(isOpen ? null : p.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                          isOpen ? "" : "-rotate-90"
                        }`}
                      />
                      {p.number != null && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                          {p.number}
                        </span>
                      )}
                      {/* No celular o título quebra em duas linhas em vez de
                          ser cortado: "King stud out of plumb at the left
                          header" virava "King stud out d…", que não identifica
                          ponto nenhum. Na tela larga ele cabe numa linha só. */}
                      <span className="line-clamp-2 text-sm font-medium leading-tight sm:truncate">
                        {p.title || p.body.slice(0, 60) || "Untitled"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 ${
                          p.status === "resolved"
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                            : "border-amber-500/40 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {p.status === "resolved" ? "Resolved" : "Pending"}
                      </Badge>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 pl-[22px] text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {p.sheetNumber || `p. ${p.pageIndex + 1}`} · {p.document}
                      </span>
                    </span>
                  </button>

                  {/* No celular esta coluna vira uma faixa embaixo do titulo: ao
                      lado dele, ela roubava metade da largura e o titulo do ponto
                      morria em "King stud out of…", que nao identifica ponto
                      nenhum. De quebra, quem registrou passou a aparecer no
                      celular tambem, onde antes ficava escondido. */}
                  <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-start sm:gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RoleName name={p.createdName} role={p.createdRole} />
                      <span>· {dataCurta(p.createdAt)}</span>
                    </span>
                    {/* Contagem é leitura, abrir no desenho é ação, e as duas
                        estavam no mesmo tamanho e na mesma fileira: o ícone de
                        abrir parecia mais um contador. Agora a contagem vive
                        numa pastilha de fundo apagado e o botão tem moldura
                        própria, do lado de fora dela. */}
                    <span className="flex items-center gap-1.5">
                    {temRegistro && (
                    <span className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                      {p.photos > 0 && (
                        <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                          <Camera className="h-3 w-3" />
                          {p.photos}
                        </span>
                      )}
                      {p.videos > 0 && (
                        <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                          <Video className="h-3 w-3" />
                          {p.videos}
                        </span>
                      )}
                      {p.audios > 0 && (
                        <span className="flex items-center gap-1">
                          <FileVolume className="h-3 w-3" />
                          {p.audios}
                        </span>
                      )}
                      {p.comments > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {p.comments}
                        </span>
                      )}
                      {/* Ponto pendente com registro do depois é ponto que já
                          foi resolvido e ninguém marcou. Dizer isso aqui é o que
                          faz alguém marcar, em vez de a lista carregar para
                          sempre um pendente que não é. */}
                      {p.status !== "resolved" && p.after > 0 && (
                        <span
                          className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                          title="There is proof of the fix on this point"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                      )}
                    </span>
                    )}
                      <button
                        type="button"
                        title="Open it on the drawing"
                        aria-label="Open it on the drawing"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 text-primary transition-colors hover:bg-muted"
                        onClick={() => setNoDesenho(p)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                </div>

                {isOpen && (
                  /* Aberto, o ponto vira container com dois blocos: a linha que
                     identifica em cima, e o que se faz com ele embaixo, com
                     borda e fundo próprios. Sem essa separação o antes, o
                     depois e a conversa flutuavam soltos dentro do mesmo
                     retângulo do título. */
                  <div className="border-t border-border/60 bg-muted/20 px-3 py-3">
                    <PointDetail
                      jobsiteId={jobsiteId}
                      point={p}
                      canWrite={canWrite}
                      onDelete={() => remover.mutate(p.id)}
                      deleting={remover.isPending}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </div>

      {noDesenho && (
        <PunchSheet
          jobsiteId={jobsiteId}
          documentId={noDesenho.documentId}
          sheetId={noDesenho.sheetId}
          noteId={noDesenho.id}
          canAnnotate={canWrite}
          canManage={canManage}
          onClose={() => setNoDesenho(null)}
        />
      )}
    </Panel>
  )
}
