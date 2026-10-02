"use client"

import { Children, isValidElement, useMemo, useState } from "react"
import {
  Activity, AlertTriangle, Building2, CalendarClock, Check, CheckCircle2,
  ChevronLeft, ChevronRight, CircleDashed, CircleHelp, Clock, Layers, MapPin, Pencil, Search, ShoppingCart, Truck, X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useForecast, useHVACActuals, useSetHVACPurchase } from "@/hooks/use-forecast"
import type { HVACActual } from "@/services/forecast.service"
import { EditStageDialog } from "./_components/edit-stage-dialog"
import {
  formatDate, isActive, sameWeek, STAGE_DB_NAME, STAGES, stagesOf, startOfToday, toISO,
  type ProjectStages, type Stage, type StageState,
} from "./_lib/stages"

// HVAC Schedule & Material.
//
// Cruza o cronograma das quatro etapas da HVAC com a data em que o material de
// cada uma tem de ser comprado, para responder numa tela só: o que começa, o
// que atrasou e o que precisa ser comprado nesta semana.
//
// O planejado vem do forecast; o que a obra de fato fez mora em
// `forecast_hvac_stages` e é marcado aqui. São os dois juntos que produzem
// "atrasado": planejado no passado e ninguém marcou que começou.
//
// Falta o pedido de material (comprado quando, chegou ou não), e por isso uma
// métrica segue vazia, com o que falta escrito nela. Ver HS-9 no backlog de
// 21/09.
//
// Hierarquia da leitura, de fora para dentro: jobsite → lote → etapa. Cada
// nível é um container, e o de baixo só existe depois de abrir o de cima.

const STATE_LABEL: Record<StageState, string> = {
  delayed: "Delayed",
  running: "In progress",
  done: "Completed",
  upcoming: "Not started",
  undated: "No date",
}

const STATE_ICON: Record<StageState, React.ElementType> = {
  delayed: AlertTriangle,
  running: Activity,
  done: CheckCircle2,
  upcoming: Clock,
  undated: CircleDashed,
}

// Só a cor do traço: o ícone de estado fica solto no canto do cartão, sem
// caixa, para não competir com o ícone da própria etapa.
const STATE_COLOR: Record<StageState, string> = {
  delayed: "text-red-500",
  running: "text-blue-500",
  done: "text-emerald-500",
  upcoming: "text-muted-foreground",
  undated: "text-muted-foreground/60",
}

// A faixa da esquerda de cada etapa, na mesma família de cor.
const STATE_EDGE: Record<StageState, string> = {
  delayed: "border-l-red-500/70",
  running: "border-l-blue-500/70",
  done: "border-l-emerald-500/70",
  upcoming: "border-l-border",
  undated: "border-l-border",
}

// Teto do que a lista da direita desenha de uma vez. Passando disso, a resposta
// certa é filtrar, não rolar mil linhas.
const PURCHASE_LIMIT = 80

// Os nomes que o banco usa para obra encerrada. A HVAC grava 'closed'; os dois
// outros vêm do vocabulário do resto do forecast e entram por precaução, já que
// custam nada e evitam que uma obra encerrada volte à lista por causa de um
// rótulo diferente.
const CLOSED = new Set(["closed", "completed", "cancelled"])

export default function HVACSchedulePage() {
  const { data, isLoading } = useForecast({ company: "hvac" })
  const { data: actuals } = useHVACActuals()

  const [query, setQuery] = useState("")
  // Project stages tem duas etapas: escolher o jobsite e, depois, ver só os
  // lotes dele. Vazio é a primeira etapa.
  const [site, setSite] = useState("")
  const [stageKey, setStageKey] = useState("all")
  const [status, setStatus] = useState("all")
  // Abre só com o que tem Order: é o que está acontecendo agora (HS-20). O
  // resto, que vem do calendário, fica a um clique.
  const [source, setSource] = useState("orders")

  // Uma vez por montagem. Sem o memo, `startOfToday()` devolve outra instância
  // a cada render, e como ela é dependência de `all`, a cadeia inteira de memos
  // recalculava a cada tecla digitada na busca.
  const today = useMemo(() => startOfToday(), [])

  const actualsByProject = useMemo(() => {
    const map = new Map<string, HVACActual[]>()
    for (const a of actuals ?? []) map.set(a.projectId, [...(map.get(a.projectId) ?? []), a])
    return map
  }, [actuals])

  const all = useMemo(
    () => (data ?? [])
      // Obra fechada não entra. São 137 das 251 da HVAC, quase todas antigas, e
      // nenhuma delas tem etapa por começar nem material por comprar: é só
      // ruído entre as que ainda pedem decisão.
      .filter(p => !CLOSED.has((p.status ?? "").trim().toLowerCase()))
      .map(p => stagesOf(p, today, actualsByProject.get(p.id) ?? []))
      .filter(p => p.stages.some(s => s.start || s.end)),
    [data, today, actualsByProject],
  )

  // Um filtro só, aplicado antes de tudo: o que a métrica conta é exatamente o
  // que a lista mostra. Contar o total enquanto a lista mostra um recorte faria
  // os dois números da mesma tela discordarem.
  const projects = useMemo(() => {
    const term = query.trim().toLowerCase()
    return all
      .filter(p => source === "all" || p.project.hasOrders)
      .filter(p => !term
        || lotLabel(p).toLowerCase().includes(term)
        || siteOf(p).toLowerCase().includes(term)
        || (p.project.address ?? "").toLowerCase().includes(term)
        || (p.project.name ?? "").toLowerCase().includes(term))
      .map(p => ({
        ...p,
        stages: p.stages.filter(s =>
          (stageKey === "all" || s.key === stageKey) && (status === "all" || s.state === status)),
      }))
      .filter(p => p.stages.length > 0)
  }, [all, query, source, stageKey, status])

  const sites = useMemo(() => {
    const map = new Map<string, ProjectStages[]>()
    for (const p of projects) {
      const site = siteOf(p)
      map.set(site, [...(map.get(site) ?? []), p])
    }
    return [...map.entries()]
      .map(([site, lots]) => ({ site, lots: lots.sort(byLot) }))
      .sort((a, b) => a.site.localeCompare(b.site))
  }, [projects])

  const purchases = useMemo(() => {
    const out: { p: ProjectStages; s: Stage }[] = []
    for (const p of projects) {
      for (const s of p.stages) {
        if (toBuy(s)) out.push({ p, s })
      }
    }
    return out.sort((a, b) => a.s.purchaseBy!.getTime() - b.s.purchaseBy!.getTime())
  }, [projects])

  if (isLoading) return <PageSkeleton />

  // Sem o escolhido na lista (um filtro o tirou), volta à primeira etapa.
  const current = sites.find(s => s.site === site)

  const allStages = projects.flatMap(p => p.stages).filter(s => s.state !== "undated")
  const thisWeek = purchases.filter(x => sameWeek(x.s.purchaseBy!, today))

  return (
    // Sem padding próprio: o `<main>` do layout do BOR já aplica p-6. Altura
    // cheia porque aquele main é de altura fixa com overflow-hidden, então quem
    // rola é o corpo de cada bloco, não a página.
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HVAC Schedule &amp; Material</h1>
          <p className="text-sm text-muted-foreground">
            Stage calendar and the purchase date it depends on
          </p>
        </div>

        {/* Busca primeiro: é o filtro de quem já sabe o que procura, e os três
            seletores servem para quem ainda não sabe. */}
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex flex-col gap-1">
            <FilterLabel>Search</FilterLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Lot, jobsite, address…"
                className="h-8 w-[190px] rounded-lg border border-input bg-transparent pr-7 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring dark:bg-input/30"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <Filter label="Lots" value={source} onChange={setSource} className="w-[140px]">
            <SelectItem value="orders">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              With orders
            </SelectItem>
            <SelectItem value="all">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              All lots
            </SelectItem>
          </Filter>

          <Filter label="Stage" value={stageKey} onChange={setStageKey} className="w-[160px]">
            <SelectItem value="all">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              All stages
            </SelectItem>
            {STAGES.map(s => (
              <SelectItem key={s.key} value={s.key}>
                <s.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {s.label}
              </SelectItem>
            ))}
          </Filter>

          <Filter label="Status" value={status} onChange={setStatus} className="w-[150px]">
            <SelectItem value="all">
              <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
              All
            </SelectItem>
            {(Object.keys(STATE_LABEL) as StageState[]).map(s => {
              const Icon = STATE_ICON[s]
              return (
                <SelectItem key={s} value={s}>
                  <Icon className={`h-3.5 w-3.5 ${STATE_COLOR[s]}`} />
                  {STATE_LABEL[s]}
                </SelectItem>
              )
            })}
          </Filter>
        </div>
      </div>

      {/* Métricas fixas no topo, uma linha só e dentro da largura da tela. */}
      <div className="grid shrink-0 grid-cols-6 gap-3">
        <Metric
          title="Active projects"
          value={String(projects.filter(isActive).length)}
          icon={<Building2 className="h-4 w-4" />}
          help="Lots with a stage started and not all four finished."
          tone="slate"
        />
        <Metric
          title="In progress"
          value={String(allStages.filter(s => s.state === "running").length)}
          icon={<Activity className="h-4 w-4" />}
          help="Stages that have a real start date and no real end date yet."
          tone="blue"
        />
        <Metric
          title="Completed"
          value={String(allStages.filter(s => s.state === "done").length)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          help="Stages with a real end date recorded."
          tone="emerald"
        />
        <Metric
          title="Delayed"
          value={String(allStages.filter(s => s.state === "delayed").length)}
          icon={<AlertTriangle className="h-4 w-4" />}
          help="Stages whose planned start has passed and nobody marked them started."
          tone="amber"
        />
        <Metric
          title="Orders overdue"
          value={String(purchases.filter(x => x.s.purchaseBy! < today).length)}
          icon={<ShoppingCart className="h-4 w-4" />}
          help="Stages whose purchase date has passed and nobody marked the material as purchased."
          tone="red"
        />
        <Metric
          title="Buy this week"
          value={String(thisWeek.length)}
          icon={<Truck className="h-4 w-4" />}
          help="Stages whose material must be bought between Monday and Sunday of this week."
          tone="violet"
        />
      </div>

      {/* O Project stages fica com a largura que sobra: são quatro etapas por
          linha, e cada uma traz três datas. A lista de compras é estreita. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <Panel
          className="min-w-0 lg:flex-1"
          icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Project stages"
          right={
            <span className="text-xs text-muted-foreground">
              {current
                ? `${current.lots.length} ${current.lots.length === 1 ? "lot" : "lots"}`
                : `${sites.length} ${sites.length === 1 ? "jobsite" : "jobsites"} · ${projects.length} ${projects.length === 1 ? "lot" : "lots"}`}
            </span>
          }
        >
          {sites.length === 0 ? (
            <Empty>Nothing matches these filters.</Empty>
          ) : current ? (
            <div className="flex flex-col gap-3">
              {/* Presa no topo: rolando os lotes, continua à vista em que jobsite
                  se está e como voltar. As margens negativas cobrem o respiro do
                  painel, para nada passar por trás dela. */}
              <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
                <button
                  onClick={() => setSite("")}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Jobsites
                </button>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">{current.site}</span>
              </div>
              {/* Com o mouse num lote, os outros esmaecem: quatro etapas com três
                  datas cada, em dezenas de linhas, confundem sem um foco. */}
              <div className="group/lots flex flex-col gap-2.5">
                {current.lots.map(lot => <LotRow key={lot.project.id} lot={lot} />)}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sites.map(s => <JobsiteRow key={s.site} site={s.site} lots={s.lots} onOpen={() => setSite(s.site)} />)}
            </div>
          )}
        </Panel>

        <Panel
          className="lg:w-[232px] lg:shrink-0"
          icon={<CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Next purchases"
          right={<span className="text-xs text-muted-foreground">{purchases.length}</span>}
        >
          {purchases.length === 0 ? (
            <Empty>Nothing to buy.</Empty>
          ) : (
            <div className="flex flex-col gap-1.5">
              {purchases.slice(0, PURCHASE_LIMIT).map(({ p, s }) => (
                <PurchaseRow key={`${p.project.id}-${s.key}`} lot={p} stage={s} today={today} />
              ))}
              {purchases.length > PURCHASE_LIMIT && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  {purchases.length - PURCHASE_LIMIT} more. Narrow it down with the filters
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

// O container padrão da casa, o mesmo do Permit Cards: barra de cabeçalho com
// ícone e título, borda embaixo, e corpo que rola por dentro em vez de empurrar
// a página.
function Panel({
  icon, title, right, className, children,
}: {
  icon: React.ReactNode
  title: string
  right?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/60 ${className ?? ""}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {right}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

/** Compra pendente: a etapa tem data de compra, ainda vai começar e ninguém
 *  registrou a compra. */
function toBuy(s: Stage): boolean {
  return !!s.purchaseBy && s.state === "upcoming" && !s.purchasedOn
}

// Primeira etapa do bloco: um jobsite por linha. Clicar leva aos lotes dele.
function JobsiteRow({ site, lots, onOpen }: { site: string; lots: ProjectStages[]; onOpen: () => void }) {
  const delayed = lots.reduce((n, l) => n + l.stages.filter(s => s.state === "delayed").length, 0)
  const running = lots.reduce((n, l) => n + l.stages.filter(s => s.state === "running").length, 0)
  const buy = lots.reduce((n, l) => n + l.stages.filter(toBuy).length, 0)

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50"
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium">{site}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {lots.length} {lots.length === 1 ? "lot" : "lots"}
      </span>
      {delayed > 0 && (
        <span className="flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 px-1.5 py-0.5 text-xs tabular-nums text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" />
          {delayed}
        </span>
      )}
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        {running} running · {buy} to buy
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

// Um lote, numa linha: quem é, à esquerda, e as quatro etapas lado a lado.
//
// O lote se identifica por número e endereço; o jobsite já está escolhido na
// faixa de cima, e por isso não se repete aqui.
function LotRow({ lot }: { lot: ProjectStages }) {
  const [editing, setEditing] = useState<Stage | null>(null)

  return (
    <div className="lot-row flex items-stretch gap-3 rounded-lg border border-border bg-card p-2.5 transition-[opacity,border-color] duration-150 group-has-[.lot-row:hover]/lots:opacity-40 hover:border-primary/50 hover:opacity-100!">
      <div className="flex w-[150px] shrink-0 flex-col justify-center gap-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{lotLabel(lot)}</span>
          {lot.stacked && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-amber-500"
              aria-label="The client scheduled more than one stage to start on the same day"
            />
          )}
        </div>
        {lot.project.address && (
          <span className="truncate text-[11px] text-muted-foreground" title={lot.project.address}>
            {lot.project.address}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Progress value={lot.percent} className="h-1 flex-1" />
          <span className="tabular-nums">{lot.percent}%</span>
        </span>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-4 gap-2.5">
        {lot.stages.map(s => (
          <StageCard key={s.key} stage={s} onEdit={() => setEditing(s)} />
        ))}
      </div>

      {editing && (
        <EditStageDialog
          // Remonta a cada etapa escolhida, para o diálogo abrir com as datas
          // dela e não com as da anterior.
          key={editing.key}
          lot={lot}
          stage={editing}
          open
          onOpenChange={o => !o && setEditing(null)}
        />
      )}
    </div>
  )
}

// Uma etapa, compacta: o estado virou ícone no canto, e as três datas ficam
// lado a lado em vez de empilhadas. O lápis fica sempre à vista.
function StageCard({ stage: s, onEdit }: { stage: Stage; onEdit: () => void }) {
  const StateIcon = STATE_ICON[s.state]

  return (
    <div
      // O hover clareia só as três bordas neutras. `hover:border-foreground/20`
      // valia para os quatro lados e apagava justamente a faixa colorida que
      // diz o estado da etapa.
      className={`group/stage min-w-0 rounded-lg border border-l-[3px] bg-background/60 p-2.5 transition-colors hover:border-y-foreground/20 hover:border-r-foreground/20 ${STATE_EDGE[s.state]}`}
    >
      <div className="flex items-center gap-1.5">
        <s.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs font-medium" title={s.full}>{s.label}</span>

        <span className="ml-auto flex shrink-0 items-center">
          {/* O ícone sozinho não diz por que está aceso. A dica conta o motivo,
              com a data que o justifica. */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className={`flex cursor-default items-center ${STATE_COLOR[s.state]}`}>
                <StateIcon className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                {stateReason(s)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button
            onClick={onEdit}
            aria-label={`Change ${s.full} dates`}
            className="ml-1.5 flex h-5 w-5 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="h-3 w-3 shrink-0" />
          </button>
        </span>
      </div>

      {/* Compra primeiro: é a data que exige ação antes das outras duas. */}
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px] leading-tight">
        <DateCell term="Buy" planned={s.purchaseBy} actual={s.purchasedOn} />
        {/* Âmbar quando outra etapa do lote começa no mesmo dia: o selo diz que
            há colisão, e a cor diz onde ela está. */}
        <DateCell term="Start" planned={s.start} actual={s.actualStart} warn={s.sharesStart} />
        <DateCell term="End" planned={s.end} actual={s.actualEnd} />
      </div>
    </div>
  )
}

/** Por que a etapa está nesse estado, com a data que sustenta a afirmação.
 *  "Delayed" sem dizer qual data passou obriga quem lê a conferir sozinho. */
function stateReason(s: Stage): string {
  switch (s.state) {
    case "done":
      return `Completed on ${formatDate(s.actualEnd)}`
    case "running":
      return `Started on ${formatDate(s.actualStart)}, not finished yet`
    case "delayed":
      return `Was planned to start on ${formatDate(s.start)} and nobody marked it started`
    case "upcoming":
      return `Planned to start on ${formatDate(s.start)}`
    default:
      return "No date planned for this stage"
  }
}

/** Planejado em cima; embaixo, o real, quando alguém marcou. */
function DateCell({
  term, planned, actual, warn,
}: {
  term: string
  planned: Date | null
  actual?: Date | null
  warn?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className={`truncate ${warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
        {term}
      </p>
      <p
        className={`truncate tabular-nums ${warn ? "font-medium text-amber-600 dark:text-amber-400" : ""}`}
        title={warn ? "Another stage of this lot starts on the same day" : formatDate(planned)}
      >
        {formatShort(planned)}
      </p>
      {actual !== undefined && (
        <p className={`truncate tabular-nums ${actual ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}`}>
          {actual ? formatShort(actual) : "—"}
        </p>
      )}
    </div>
  )
}

function PurchaseRow({
  lot, stage: s, today,
}: {
  lot: ProjectStages
  stage: Stage
  today: Date
}) {
  const overdue = !!s.purchaseBy && s.purchaseBy < today
  const week = !!s.purchaseBy && sameWeek(s.purchaseBy, today)
  const purchase = useSetHVACPurchase()

  return (
    <div
      className={`rounded-lg border p-2 transition-colors ${
        overdue
          ? "border-red-500/40 bg-red-500/[0.06] hover:border-red-500/60"
          : "border-border hover:border-foreground/20"
      }`}
    >
      {/* Em cima, três colunas: estado, o que e quando. */}
      <div className="flex items-center gap-2">
        {/* O ícone da etapa, não o do estado: o estado já está dito pela cor da
            borda e pelo alerta da data, e um triângulo igual em toda linha não
            distingue nada. */}
        <s.Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={s.full} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-muted-foreground" title={s.full}>{s.label}</p>
          <p className="truncate text-xs font-medium">{lotLabel(lot)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {overdue ? (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-label="Purchase date has passed" />
          ) : week ? (
            <Clock className="h-3.5 w-3.5 text-amber-500" aria-label="Buy this week" />
          ) : null}
          <p
            className={`text-xs tabular-nums ${
              overdue
                ? "font-medium text-red-600 dark:text-red-400"
                : week
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
            }`}
          >
            {formatShort(s.purchaseBy)}
          </p>
        </div>
      </div>

      {/* Embaixo, a obra, com a linha inteira para si. */}
      {/* Embaixo, a obra e o atalho de marcar a compra com a data de hoje. Para
          outra data, ou para desfazer, o caminho é o lápis da etapa. */}
      <div className="mt-1.5 flex items-end gap-2 border-t border-border/60 pt-1.5">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-pretty text-muted-foreground">
          {siteOf(lot)}
        </p>
        <button
          onClick={() => purchase.mutate({ id: lot.project.id, stage: STAGE_DB_NAME[s.key], purchasedOn: toISO(today) })}
          disabled={purchase.isPending}
          title="Mark as purchased today"
          aria-label={`Mark ${s.full} of ${lotLabel(lot)} as purchased today`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50 dark:hover:text-emerald-400"
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// Cada métrica tem sua cor, e a cor diz o que a métrica significa: verde é o
// que fechou, vermelho é o que já devia ter acontecido, âmbar é o que pede
// atenção agora. As classes vêm inteiras do mapa porque o Tailwind lê o código
// como texto e não enxerga nome de classe montado em tempo de execução.
type Tone = "slate" | "blue" | "emerald" | "amber" | "red" | "violet"

const TONE: Record<Tone, { card: string; icon: string; value: string }> = {
  slate: {
    card: "border-slate-500/25 bg-slate-500/[0.06]",
    icon: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    value: "text-slate-700 dark:text-slate-200",
  },
  blue: {
    card: "border-blue-500/25 bg-blue-500/[0.06]",
    icon: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    value: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    card: "border-emerald-500/25 bg-emerald-500/[0.06]",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    card: "border-amber-500/25 bg-amber-500/[0.06]",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    value: "text-amber-600 dark:text-amber-400",
  },
  red: {
    card: "border-red-500/25 bg-red-500/[0.06]",
    icon: "bg-red-500/15 text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
  },
  violet: {
    card: "border-violet-500/25 bg-violet-500/[0.06]",
    icon: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    value: "text-violet-600 dark:text-violet-400",
  },
}

function Metric({
  title, value, icon, help, tone,
}: {
  title: string
  value: string
  icon: React.ReactNode
  /** O que o número conta, numa frase. Aparece na interrogação. */
  help: string
  tone: Tone
}) {
  const t = TONE[tone]
  return (
    <Card className={`min-w-0 gap-0 py-3 transition-colors hover:border-foreground/20 ${t.card}`}>
      <CardHeader className="flex flex-row items-center gap-2 px-3 pb-1.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
          {icon}
        </span>
        {/* Uma linha sempre: título que quebra em duas desalinha o número de
            todos os cartões vizinhos. */}
        <CardTitle className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground" title={title}>
          {title}
        </CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              aria-label={`What ${title} means`}
              className="shrink-0 cursor-help text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-center text-xs">{help}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="min-w-0 px-3">
        <p className={`text-xl font-bold tabular-nums ${t.value}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}

function Filter({
  label, value, onChange, className, children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <FilterLabel>{label}</FilterLabel>
      <Select value={value} onValueChange={v => v && onChange(v)}>
        <SelectTrigger className={`h-8 transition-colors ${className ?? ""}`}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm">
            {labelOf(children, value)}
          </span>
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

/** O conteúdo do item escolhido, ícone incluído, para o gatilho mostrar a
 *  escolha e não o valor cru. Ler das próprias opções evita manter uma segunda
 *  tabela de rótulos. */
function labelOf(children: React.ReactNode, value: string): React.ReactNode {
  for (const child of Children.toArray(children)) {
    if (isValidElement<{ value?: string; children?: React.ReactNode }>(child) && child.props.value === value) {
      return child.props.children
    }
  }
  return value
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      <CircleDashed className="h-4 w-4" />
      {children}
    </p>
  )
}

function siteOf(p: ProjectStages): string {
  return p.project.jobSite?.trim() || "No jobsite"
}

/** "Lot 12". O campo às vezes já vem com a palavra, às vezes só com o número. */
function lotLabel(p: ProjectStages): string {
  const raw = p.project.loteBld?.trim() || p.project.name?.trim() || ""
  if (!raw) return "Lot —"
  return /^\d/.test(raw) ? `Lot ${raw}` : raw
}

function byLot(a: ProjectStages, b: ProjectStages): number {
  return lotLabel(a).localeCompare(lotLabel(b), undefined, { numeric: true })
}

/** Data curta: em cartão estreito o ano de quatro dígitos rouba a linha. */
function formatShort(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
}
