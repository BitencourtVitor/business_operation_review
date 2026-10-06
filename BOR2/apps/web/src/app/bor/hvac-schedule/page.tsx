"use client"

import { Children, isValidElement, useMemo, useState } from "react"
import {
  Activity, CalendarDays, Hash, AlertTriangle, Building2, Check, CheckCircle2,
  ChevronLeft, ChevronRight, CircleDashed, CircleHelp, Clock, Layers, MapPin, Pencil, Plus, Presentation as PresentationIcon, Search, Users, Settings, ShieldCheck, ShoppingCart, Truck, X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useForecast, useHVACActuals, useHVACJobsites, useSetHVACPurchase } from "@/hooks/use-forecast"
import type { HVACActual, HVACJobsite } from "@/services/forecast.service"
import { AddLotDialog } from "./_components/add-lot-dialog"
import { JobsiteDialog, type JobsiteDraft } from "./_components/jobsite-dialog"
import { Presentation, PresentationSetup, type PresentationConfig } from "./_components/presentation"
import { ProjectDetailsDialog } from "./_components/project-details-dialog"
import { ProjectSettingsDialog } from "./_components/project-settings-dialog"
import { Tip } from "./_components/tip"
import {
  formatDate, isActive, sameWeek, STAGE_DB_NAME, stagesOf, startOfToday, toISO,
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
  const { data: catalog } = useHVACJobsites()
  // O jobsite em edição (nome vazio é jobsite novo) e a janela de lote novo.
  const [editing, setEditing] = useState<JobsiteDraft | null>(null)
  const [addingLot, setAddingLot] = useState(false)
  // A apresentação: primeiro a janela de preparo, depois o que ela devolve.
  const [preparing, setPreparing] = useState(false)
  const [presenting, setPresenting] = useState<PresentationConfig | null>(null)

  const [query, setQuery] = useState("")
  // Project stages tem duas etapas: escolher o jobsite e, depois, ver só os
  // lotes dele. Vazio é a primeira etapa.
  const [site, setSite] = useState("")
  const [status, setStatus] = useState("all")
  // Abre só com o que tem Order: é o que está acontecendo agora (HS-20). O
  // resto, que vem do calendário, fica a um clique.
  const [source, setSource] = useState("orders")
  // Dentro do jobsite, o mais urgente primeiro: compra não segue número de lote.
  const [order, setOrder] = useState<"date" | "lot">("date")
  // Abre agrupado por jobsite; desagrupado, os lotes vêm numa lista só.
  const [group, setGroup] = useState<"site" | "none">("site")
  // Só o que tem QuickBooks Time ou Permit por fazer (HS-25).
  const [todo, setTodo] = useState(false)

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
      // Obra sem data nenhuma fica: é assim que nasce a criada pelo Add lot.
      .map(p => stagesOf(p, today, actualsByProject.get(p.id) ?? [])),
    [data, today, actualsByProject],
  )

  // Um filtro só, aplicado antes de tudo: o que a métrica conta é exatamente o
  // que a lista mostra. Contar o total enquanto a lista mostra um recorte faria
  // os dois números da mesma tela discordarem.
  const projects = useMemo(() => {
    const term = query.trim().toLowerCase()
    return all
      .filter(p => source === "all" || (source === "orders") === !!p.project.hasOrders)
      .filter(p => !todo || hasTodo(p))
      .filter(p => !term
        || lotLabel(p).toLowerCase().includes(term)
        || siteOf(p).toLowerCase().includes(term)
        || (p.project.address ?? "").toLowerCase().includes(term)
        || (p.project.name ?? "").toLowerCase().includes(term))
      .map(p => ({
        ...p,
        stages: p.stages.filter(s => status === "all" || s.state === status),
      }))
      .filter(p => p.stages.length > 0)
  }, [all, query, source, status, todo])

  const sites = useMemo(() => {
    const map = new Map<string, ProjectStages[]>()
    for (const p of projects) {
      const site = siteOf(p)
      map.set(site, [...(map.get(site) ?? []), p])
    }
    // Jobsite criado pela tela aparece mesmo sem lote, desde que nenhum filtro
    // de busca ou de status esteja escondendo lotes: aí vazio seria engano.
    if (!query.trim() && status === "all" && !todo) {
      for (const j of catalog ?? []) {
        if (j.hvac && !map.has(j.name)) map.set(j.name, [])
      }
    }
    return [...map.entries()]
      .map(([site, lots]) => ({ site, lots: lots.sort(order === "date" ? byUrgency : byLot) }))
      .sort((a, b) => a.site.localeCompare(b.site))
  }, [projects, order, catalog, query, status, todo])

  const flat = useMemo(() => [...projects].sort(order === "date" ? byUrgency : byLot), [projects, order])

  // O que o catálogo anota de cada jobsite, pelo nome, que é a ligação com a obra.
  const metaOf = useMemo(() => {
    const byName = new Map<string, HVACJobsite>((catalog ?? []).map(j => [j.name.toLowerCase(), j]))
    return (site: string) => byName.get(site.toLowerCase())
  }, [catalog])
  const people = useMemo(
    () => [...new Set((catalog ?? []).flatMap(j => j.responsibles))].sort((a, b) => a.localeCompare(b)),
    [catalog],
  )
  const draftOf = (site: string, lots: ProjectStages[]): JobsiteDraft => {
    const meta = metaOf(site)
    return {
      name: site,
      client: meta?.client || lots[0]?.project.cliente || "",
      responsibles: meta?.responsibles ?? [],
      sourceName: meta?.sourceName,
    }
  }

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
  const current = group === "site" ? sites.find(s => s.site === site) : undefined

  const allStages = projects.flatMap(p => p.stages).filter(s => s.state !== "undated")
  const thisWeek = purchases.filter(x => sameWeek(x.s.purchaseBy!, today))

  return (
    // Sem padding próprio: o `<main>` do layout do BOR já aplica p-6. Altura
    // cheia porque aquele main é de altura fixa com overflow-hidden, então quem
    // rola é o corpo de cada bloco, não a página.
    <div className="@container flex h-full flex-col gap-4 max-lg:overflow-y-auto max-lg:pr-1">
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        {/* O título cede espaço antes dos filtros: quem não pode quebrar em
            duas linhas são eles. */}
        <div className="min-w-0 lg:flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">HVAC Schedule &amp; Material</h1>
          <p className="truncate text-sm text-muted-foreground">
            Stage calendar and the purchase date it depends on
          </p>
        </div>

        {/* Busca primeiro: é o filtro de quem já sabe o que procura, e os três
            seletores servem para quem ainda não sabe. */}
        {/* Uma linha só: a busca é quem encolhe quando o espaço aperta. Só em
            largura de celular os filtros quebram. */}
        <div className="flex flex-wrap items-end gap-2.5 sm:flex-nowrap lg:shrink-0">
          <div className="flex min-w-[120px] flex-1 flex-col gap-1 lg:w-[190px] lg:flex-none">
            <FilterLabel>Search</FilterLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Lot, jobsite, address…"
                className="h-8 w-full rounded-lg border border-input bg-transparent pr-7 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring dark:bg-input/30"
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

          <Filter label="Condition" value={source} onChange={setSource} className="w-[170px]">
            <SelectItem value="orders">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              With orders
            </SelectItem>
            <SelectItem value="schedule">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Just schedule
            </SelectItem>
            <SelectItem value="all">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              All
            </SelectItem>
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

          {/* Só o que tem QuickBooks Time ou Permit por fazer (HS-25). */}
          <Tip text="Only lots with QuickBooks Time off or permit steps not done">
            <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-input px-2.5 text-sm whitespace-nowrap transition-colors hover:border-foreground/20 dark:bg-input/30">
              <Checkbox checked={todo} onCheckedChange={v => setTodo(v === true)} />
              To do
            </label>
          </Tip>

          {/* Com pouco espaço o botão fica só com o ícone, para a linha caber. */}
          <Button className="shrink-0" aria-label="Present" onClick={() => setPreparing(true)}>
            <PresentationIcon className="h-3.5 w-3.5" />
            <span className="hidden @2xl:inline">Present</span>
          </Button>
        </div>
      </div>

      {/* A apresentação não segue os filtros da página: parte de todas as obras,
          e quem recorta é a janela de preparo. */}
      {preparing && (
        <PresentationSetup
          open
          sites={groupBySite(all).map(s => ({ ...s, responsibles: metaOf(s.site)?.responsibles ?? [] }))}
          onOpenChange={setPreparing}
          onStart={config => { setPreparing(false); setPresenting(config) }}
        />
      )}
      {presenting && <Presentation config={presenting} onClose={() => setPresenting(null)} />}

      {/* Métricas no topo. Seis numa linha quando cabe; apertando, viram três
          e depois duas por linha, para o título não ser cortado. */}
      <div className="grid shrink-0 grid-cols-2 gap-3 @lg:grid-cols-3 @5xl:grid-cols-6">
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
      <div className="flex flex-col gap-4 max-lg:shrink-0 lg:min-h-0 lg:flex-1 lg:flex-row">
        <Panel
          className="min-w-0 max-lg:h-[75vh] max-lg:shrink-0 lg:flex-1"
          icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Project stages"
          right={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <Segmented
                label="Group by" value={group} onChange={setGroup}
                options={[
                  { value: "site", label: "Jobsite", Icon: MapPin },
                  { value: "none", label: "None", Icon: Layers },
                ]}
              />
              {(current || group === "none") && (
                <Segmented
                  label="Order by" value={order} onChange={setOrder}
                  options={[
                    { value: "date", label: "Date", Icon: CalendarDays },
                    { value: "lot", label: "Lot number", Icon: Hash },
                  ]}
                />
              )}
              {current
                ? `${current.lots.length} ${current.lots.length === 1 ? "lot" : "lots"}`
                : group === "none"
                  ? `${projects.length} ${projects.length === 1 ? "lot" : "lots"}`
                  : `${sites.length} ${sites.length === 1 ? "jobsite" : "jobsites"} · ${projects.length} ${projects.length === 1 ? "lot" : "lots"}`}
            </span>
          }
        >
          {group === "none" ? (
            flat.length === 0 ? <Empty>Nothing matches these filters.</Empty> : (
              <div className="group/lots flex flex-col gap-2.5">
                {flat.map(lot => <LotRow key={lot.project.id} lot={lot} site={siteOf(lot)} />)}
              </div>
            )
          ) : sites.length === 0 ? (
            <div className="flex flex-col gap-1.5">
              <Empty>Nothing matches these filters.</Empty>
              <AddJobsiteButton onClick={() => setEditing({ name: "", client: "", responsibles: [] })} />
            </div>
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
                {/* Sempre nesta ordem: cliente, jobsite, responsável. */}
                <ClientTag name={draftOf(current.site, current.lots).client} />
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">{current.site}</span>
                <Responsibles names={metaOf(current.site)?.responsibles ?? []} />
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Tip text="Edit jobsite">
                    <button
                      onClick={() => setEditing(draftOf(current.site, current.lots))}
                      aria-label={`Edit ${current.site}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </Tip>
                  <button
                    onClick={() => setAddingLot(true)}
                    className="flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add lot
                  </button>
                </span>
              </div>
              {current.lots.length === 0 && <Empty>No lots in this jobsite yet.</Empty>}
              {/* Com o mouse num lote, os outros esmaecem: quatro etapas com três
                  datas cada, em dezenas de linhas, confundem sem um foco. */}
              <div className="group/lots flex flex-col gap-2.5">
                {current.lots.map(lot => <LotRow key={lot.project.id} lot={lot} />)}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sites.map(s => (
                <JobsiteRow
                  key={s.site} site={s.site} lots={s.lots}
                  client={draftOf(s.site, s.lots).client}
                  responsibles={metaOf(s.site)?.responsibles ?? []}
                  onOpen={() => setSite(s.site)}
                  onEdit={() => setEditing(draftOf(s.site, s.lots))}
                />
              ))}
              <AddJobsiteButton onClick={() => setEditing({ name: "", client: "", responsibles: [] })} />
            </div>
          )}

          {editing && (
            <JobsiteDialog
              jobsite={editing} people={people} open
              onOpenChange={o => !o && setEditing(null)}
              // Renomeado por dentro: continua no mesmo jobsite, agora com o nome novo.
              onSaved={name => { if (site && site === editing.name) setSite(name) }}
            />
          )}
          {addingLot && current && (
            <AddLotDialog
              jobsite={current.site} client={draftOf(current.site, current.lots).client} open
              onOpenChange={setAddingLot}
            />
          )}
        </Panel>

        <Panel
          className="max-lg:h-[60vh] max-lg:shrink-0 lg:w-[232px] lg:shrink-0"
          icon={<ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />}
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
      <div className="flex min-h-[45px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {right}
      </div>
      <div className="@container min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

/** O seletor segmentado do Forecast (Group by, Sort Order). */
function Segmented<T extends string>({
  label, value, onChange, options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string; Icon: React.ElementType }[]
}) {
  return (
    <span className="flex items-center gap-2">
      <FilterLabel>{label}</FilterLabel>
      <span className="flex h-7 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
        {options.map(({ value: v, label: text, Icon }) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`flex h-6 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-3 w-3" />
            {text}
          </button>
        ))}
      </span>
    </span>
  )
}

/** Algo por fazer nos stickers: QuickBooks Time desligado ou passo de permit
 *  sem status. Obra sem passo de permit não tem o que fazer nele. */
function hasTodo(p: ProjectStages): boolean {
  return !p.project.qbTime || (p.project.permit ?? []).some(s => !s.status)
}

/** Compra pendente: a etapa tem data de compra, ainda vai começar e ninguém
 *  registrou a compra. */
function toBuy(s: Stage): boolean {
  return !!s.purchaseBy && s.state === "upcoming" && !s.purchasedOn
}

// Primeira etapa do bloco: um jobsite por linha. Clicar leva aos lotes dele; o
// lápis edita o nome e os responsáveis.
function JobsiteRow({
  site, lots, client, responsibles, onOpen, onEdit,
}: {
  site: string
  lots: ProjectStages[]
  client: string
  responsibles: string[]
  onOpen: () => void
  onEdit: () => void
}) {
  const delayed = lots.reduce((n, l) => n + l.stages.filter(s => s.state === "delayed").length, 0)
  const running = lots.reduce((n, l) => n + l.stages.filter(s => s.state === "running").length, 0)
  const buy = lots.reduce((n, l) => n + l.stages.filter(toBuy).length, 0)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen() } }}
      className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-background/40 px-3 py-2 text-left transition-colors outline-none hover:border-foreground/20 hover:bg-muted/50 focus-visible:border-primary"
    >
      {/* Quem é o jobsite, à esquerda. Com o painel apertado ocupa a linha
          inteira, e os números descem para a de baixo. */}
      <span className="flex min-w-0 basis-full items-center gap-2 @2xl:flex-1 @2xl:basis-0">
        <ClientTag name={client} />
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{site}</span>
        <Responsibles names={responsibles} />
      </span>
      {/* À direita ficam os números, cada um com o seu ícone; o que cada um
          conta está na dica. */}
      <span className="flex shrink-0 items-center gap-3.5 text-xs tabular-nums text-muted-foreground @2xl:ml-auto">
        <RowMetric icon={<Layers className="h-3.5 w-3.5" />} value={lots.length} tip="Lots in this jobsite" />
        <RowMetric icon={<Activity className="h-3.5 w-3.5" />} value={running} tip="Stages in progress" tone="text-blue-600 dark:text-blue-400" />
        <RowMetric icon={<ShoppingCart className="h-3.5 w-3.5" />} value={buy} tip="Stages with material still to buy" tone="text-amber-600 dark:text-amber-400" />
        <RowMetric icon={<AlertTriangle className="h-3.5 w-3.5" />} value={delayed} tip="Delayed stages" tone="text-red-600 dark:text-red-400" />
      </span>
      <Tip text="Edit jobsite">
        <button
          onClick={ev => { ev.stopPropagation(); onEdit() }}
          onKeyDown={ev => ev.stopPropagation()}
          aria-label={`Edit ${site}`}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary @2xl:ml-0"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </Tip>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

/** Um número da linha do jobsite, com o ícone que diz o que ele conta. Zero
 *  fica apagado; a cor só aparece quando há o que olhar. */
function RowMetric({ icon, value, tip, tone }: { icon: React.ReactNode; value: number; tip: string; tone?: string }) {
  return (
    <Tip text={tip}>
      <span className={`flex w-9 items-center gap-1 ${value > 0 ? tone ?? "" : "opacity-40"}`}>
        {icon}
        {value}
      </span>
    </Tip>
  )
}

/** O cliente do jobsite, junto do nome. Sem cliente conhecido, não ocupa lugar. */
function ClientTag({ name }: { name: string }) {
  if (!name) return null
  return (
    // Só ícone e texto: com borda parecia botão, e não se clica nele.
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Building2 className="h-3.5 w-3.5" />
      {name}
    </span>
  )
}

/** Quem responde pelo jobsite. Sem ninguém anotado, não ocupa lugar. */
function Responsibles({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <Users className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{names.join(", ")}</span>
    </span>
  )
}

function AddJobsiteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      <Plus className="h-4 w-4" />
      Add jobsite
    </button>
  )
}

// Um lote, numa linha: quem é, à esquerda, e as quatro etapas lado a lado.
//
// Dois caminhos, e só dois: clicar na linha abre os detalhes da obra, para ler;
// a engrenagem abre as configurações, onde tudo dela se altera. O lote se
// identifica por número e endereço; o jobsite já está na barra de cima, e só
// vem na linha (`site`) quando a lista não está agrupada.
function LotRow({ lot, site }: { lot: ProjectStages; site?: string }) {
  const [open, setOpen] = useState<"details" | "settings" | null>(null)
  const permit = lot.project.permit ?? []
  const permitDone = permit.filter(s => !!s.status).length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen("details")}
      onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpen("details") } }}
      className="lot-row flex cursor-pointer flex-col items-stretch gap-2.5 rounded-lg @2xl:flex-row border border-border bg-card px-2.5 py-3 text-left transition-[opacity,border-color] duration-150 outline-none group-has-[.lot-row:hover]/lots:opacity-40 hover:border-primary/50 hover:opacity-100! focus-visible:border-primary"
    >
      {/* Em cima, quem é o lote e quanto andou; embaixo, os stickers e a
          engrenagem. Quando as etapas ocupam duas linhas o bloco fica alto, e
          tudo junto no meio deixava um vazio em cima e outro embaixo. */}
      <div className="flex shrink-0 flex-col justify-between gap-2 px-1 py-0.5 @2xl:w-[140px]">
        <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{lotLabel(lot)}</span>
        </div>
        {site && (
          <span className="flex items-start gap-1 text-[11px] leading-snug font-medium text-pretty">
            <MapPin className="mt-px h-3 w-3 shrink-0 text-muted-foreground" />
            {site}
          </span>
        )}
        {lot.project.address && (
          <span className="text-[11px] leading-snug text-pretty text-muted-foreground">
            {lot.project.address}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Progress value={lot.percent} className="h-1 flex-1" />
          <span className="tabular-nums">{lot.percent}%</span>
        </span>
        </div>

        {/* Os stickers que a HVAC tinha no Forecast, QuickBooks Time e Permit,
            e do lado oposto a engrenagem das configurações da obra. */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Tip text={lot.project.qbTime ? "QuickBooks Time: on" : "QuickBooks Time: off"}>
          <span className={`flex items-center ${lot.project.qbTime ? "" : "opacity-35 grayscale"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/icon_qbtime.png" alt="QuickBooks Time" className="h-3.5 w-3.5 object-contain dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/icon_qbtime_dark.png" alt="QuickBooks Time" className="hidden h-3.5 w-3.5 object-contain dark:block" />
          </span>
          </Tip>
          <Tip text={`Permit: ${permitDone} of ${permit.length} steps done`}>
            <span
              className={`flex items-center gap-1 tabular-nums ${permit.length > 0 && permitDone === permit.length ? "text-emerald-600 dark:text-emerald-400" : ""}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {permitDone}/{permit.length}
            </span>
          </Tip>
          <Tip text="Project settings">
            <button
              onClick={ev => { ev.stopPropagation(); setOpen("settings") }}
              onKeyDown={ev => ev.stopPropagation()}
              aria-label={`Settings of ${lotLabel(lot)}`}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </Tip>
        </div>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 @md:grid-cols-2 @4xl:grid-cols-4">
        {lot.stages.map(s => <StageCard key={s.key} stage={s} />)}
      </div>

      {/* As janelas ficam dentro da linha, e o clique nelas subiria até ela:
          sem segurar, fechar a janela reabriria os detalhes. */}
      <div onClick={ev => ev.stopPropagation()} onKeyDown={ev => ev.stopPropagation()}>
        {open === "details" && (
          <ProjectDetailsDialog
            lot={lot} lotLabel={lotLabel(lot)} open
            onOpenChange={o => !o && setOpen(null)}
            onSettings={() => setOpen("settings")}
          />
        )}
        {open === "settings" && (
          <ProjectSettingsDialog lot={lot} lotLabel={lotLabel(lot)} open onOpenChange={o => !o && setOpen(null)} />
        )}
      </div>
    </div>
  )
}

// Uma etapa, compacta: o estado é o ícone no canto, e as datas ficam na grade
// de baixo. Não se edita por aqui: o caminho é a engrenagem do lote.
function StageCard({ stage: s }: { stage: Stage }) {
  const StateIcon = STATE_ICON[s.state]

  return (
    <div
      // O hover clareia só as três bordas neutras. `hover:border-foreground/20`
      // valia para os quatro lados e apagava justamente a faixa colorida que
      // diz o estado da etapa.
      className={`min-w-0 rounded-lg border border-l-[3px] bg-background/60 px-2 py-3 ${STATE_EDGE[s.state]}`}
    >
      <div className="flex items-center gap-1.5">
        <s.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Tip text={s.full}>
          <span className="min-w-0 truncate text-xs font-medium">{s.label}</span>
        </Tip>

        {/* O ícone sozinho não diz por que está aceso. A dica conta o motivo,
            com a data que o justifica. */}
        <Tip text={stateReason(s)}>
          <span className={`ml-auto flex shrink-0 cursor-default items-center ${STATE_COLOR[s.state]}`}>
            <StateIcon className="h-3.5 w-3.5" />
          </span>
        </Tip>
      </div>

      {/* Grade de três colunas e duas linhas de data: em cima o planejado,
          embaixo o que de fato aconteceu. As bordas separam uma coisa da outra. */}
      <div className="mt-2.5 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-md border border-border text-center text-[11px] leading-tight">
        <DateCell term="Buy" planned={s.purchaseBy} actual={s.purchasedOn} />
        {/* Âmbar quando outra etapa do lote começa no mesmo dia, até esta
            ter o início real marcado. */}
        <DateCell
          term="Start" planned={s.start} actual={s.actualStart}
          warn={s.sharesStart && !s.actualStart ? `Starts on the same day as ${listOf(s.sharesStartWith)}` : undefined}
        />
        <DateCell term="End" planned={s.end} actual={s.actualEnd} />
      </div>
    </div>
  )
}

/** "A", "A and B", "A, B and C". */
function listOf(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
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
  actual: Date | null
  /** O aviso da data planejada, já em frase. Com ele, a célula fica âmbar. */
  warn?: string
}) {
  return (
    <div className="min-w-0">
      <p className={`border-b border-border bg-muted/40 py-0.5 ${warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
        {term}
      </p>
      <Tip text={warn ?? (planned ? `Planned: ${formatDate(planned)}` : "No planned date")}>
        <p className={`py-1 tabular-nums ${warn ? "font-medium text-amber-600 dark:text-amber-400" : ""}`}>
          {formatShort(planned)}
        </p>
      </Tip>
      <Tip text={actual ? `Executed: ${formatDate(actual)}` : "Not recorded yet"}>
        <p className={`border-t border-border py-1 tabular-nums ${actual ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}`}>
          {actual ? formatShort(actual) : "—"}
        </p>
      </Tip>
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
  const [picking, setPicking] = useState(false)

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
          <Tip text={s.full}>
            <p className="truncate text-[11px] text-muted-foreground">{s.label}</p>
          </Tip>
          <p className="truncate text-xs font-medium">{lotLabel(lot)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {overdue ? (
            <Tip text="Purchase date has passed">
              <span className="flex text-red-500"><AlertTriangle className="h-3.5 w-3.5" /></span>
            </Tip>
          ) : week ? (
            <Tip text="Buy this week">
              <span className="flex text-amber-500"><Clock className="h-3.5 w-3.5" /></span>
            </Tip>
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
      {/* Embaixo, a obra e o atalho de marcar a compra, que pede a data. Para
          desfazer, o caminho é a engrenagem do lote. */}
      <div className="mt-1.5 flex items-end gap-2 border-t border-border/60 pt-1.5">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-pretty text-muted-foreground">
          {siteOf(lot)}
        </p>
        <Popover open={picking} onOpenChange={setPicking}>
          <Tip text="Mark as purchased: pick the purchase date">
            <span className="flex shrink-0">
              <PopoverTrigger
                disabled={purchase.isPending}
                aria-label={`Mark ${s.full} of ${lotLabel(lot)} as purchased`}
                className="flex h-5 w-5 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50 dark:hover:text-emerald-400"
              >
                <Check className="h-3 w-3" />
              </PopoverTrigger>
            </span>
          </Tip>
          <PopoverContent align="end" className="w-auto p-0" positionerStyle={{ width: "auto" }}>
            <p className="border-b px-3 py-2 text-xs font-medium">When was it purchased?</p>
            <Calendar
              mode="single"
              defaultMonth={today}
              disabled={{ after: today }}
              onSelect={date => {
                if (!date) return
                purchase.mutate({ id: lot.project.id, stage: STAGE_DB_NAME[s.key], purchasedOn: toISO(date) })
                setPicking(false)
              }}
            />
          </PopoverContent>
        </Popover>
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
        <CardTitle className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Tip text={help}>
          <button
            aria-label={`What ${title} means`}
            className="shrink-0 cursor-help text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </Tip>
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

/** Os lotes agrupados por jobsite, em ordem alfabética, cada grupo por lote. */
function groupBySite(lots: ProjectStages[]): { site: string; lots: ProjectStages[] }[] {
  const map = new Map<string, ProjectStages[]>()
  for (const p of lots) map.set(siteOf(p), [...(map.get(siteOf(p)) ?? []), p])
  return [...map.entries()]
    .map(([site, group]) => ({ site, lots: group.sort(byLot) }))
    .sort((a, b) => a.site.localeCompare(b.site))
}

function byLot(a: ProjectStages, b: ProjectStages): number {
  return lotLabel(a).localeCompare(lotLabel(b), undefined, { numeric: true })
}

/** A data mais próxima do que ainda está aberto no lote: a compra, enquanto o
 *  material não foi comprado nem a etapa começou; depois disso, o início
 *  planejado. Lote sem nada aberto vai para o fim. */
function urgencyOf(p: ProjectStages): number {
  const dates = p.stages
    .filter(s => !s.actualEnd)
    .map(s => (s.purchasedOn || s.actualStart ? s.start : s.purchaseBy)?.getTime())
    .filter((d): d is number => d !== undefined)
  return dates.length ? Math.min(...dates) : Infinity
}

function byUrgency(a: ProjectStages, b: ProjectStages): number {
  const diff = urgencyOf(a) - urgencyOf(b)
  return Number.isNaN(diff) || diff === 0 ? byLot(a, b) : diff
}

/** Data curta: em cartão estreito o ano de quatro dígitos rouba a linha. */
function formatShort(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
}
