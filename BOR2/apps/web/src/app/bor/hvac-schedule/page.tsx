"use client"

import { Children, isValidElement, useMemo, useState } from "react"
import {
  Activity, AlertTriangle, Building2, CalendarClock, CheckCircle2, CircleDashed,
  Layers, Pencil, Search, ShoppingCart, Truck,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useForecast, useHVACActuals } from "@/hooks/use-forecast"
import type { HVACActual } from "@/services/forecast.service"
import { EditStageDialog } from "./_components/edit-stage-dialog"
import {
  formatDate, isActive, sameWeek, STAGES, stagesOf, startOfToday,
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
// Falta o pedido de material — comprado quando, chegou ou não — e por isso uma
// métrica segue vazia, com o que falta escrito nela. Ver HS-9 no backlog de
// 21/09.

const STATE_LABEL: Record<StageState, string> = {
  delayed: "Delayed",
  done: "Completed",
  running: "In progress",
  upcoming: "Not started",
  undated: "No date",
}

const STATE_STYLE: Record<StageState, string> = {
  delayed: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  running: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  upcoming: "border-border bg-muted text-muted-foreground",
  undated: "border-dashed border-border bg-transparent text-muted-foreground",
}

export default function HVACSchedulePage() {
  const { data, isLoading } = useForecast({ company: "hvac" })
  const { data: actuals } = useHVACActuals()

  const [jobsite, setJobsite] = useState("all")
  const [stageKey, setStageKey] = useState("all")
  const [status, setStatus] = useState("all")
  const [query, setQuery] = useState("")

  const today = startOfToday()

  // As datas reais chegam numa lista só, para toda a HVAC. Agrupar por obra uma
  // vez custa menos que varrer a lista inteira dentro de cada projeto.
  const actualsByProject = useMemo(() => {
    const map = new Map<string, HVACActual[]>()
    for (const a of actuals ?? []) map.set(a.projectId, [...(map.get(a.projectId) ?? []), a])
    return map
  }, [actuals])

  const all = useMemo(
    () => (data ?? [])
      .map(p => stagesOf(p, today, actualsByProject.get(p.id) ?? []))
      .filter(p => p.stages.some(s => s.start || s.end)),
    [data, today, actualsByProject],
  )

  const jobsites = useMemo(
    () => [...new Set(all.map(siteOf))].sort((a, b) => a.localeCompare(b)),
    [all],
  )

  // Um filtro só, aplicado antes de tudo: o que a métrica conta é exatamente o
  // que a lista mostra. Contar o total enquanto a tabela mostra um recorte faria
  // os dois números da mesma tela discordarem.
  const projects = useMemo(() => {
    const term = query.trim().toLowerCase()
    return all
      .filter(p => jobsite === "all" || siteOf(p) === jobsite)
      .filter(p => !term
        || lotLabel(p).toLowerCase().includes(term)
        || siteOf(p).toLowerCase().includes(term)
        || (p.project.name ?? "").toLowerCase().includes(term))
      .map(p => ({
        ...p,
        stages: p.stages.filter(s =>
          (stageKey === "all" || s.key === stageKey) && (status === "all" || s.state === status)),
      }))
      .filter(p => p.stages.length > 0)
  }, [all, jobsite, query, stageKey, status])

  // Agrupa por jobsite e, dentro dele, uma linha por lot. É a leitura que o
  // comprador faz: vai a uma obra e leva o material de todos os lotes dela.
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
        if (s.purchaseBy && s.state !== "done") out.push({ p, s })
      }
    }
    return out.sort((a, b) => a.s.purchaseBy!.getTime() - b.s.purchaseBy!.getTime())
  }, [projects])

  if (isLoading) return <PageSkeleton />

  const allStages = projects.flatMap(p => p.stages).filter(s => s.state !== "undated")
  const thisWeek = purchases.filter(x => sameWeek(x.s.purchaseBy!, today))

  return (
    // Sem padding próprio: o `<main>` do layout do BOR já aplica p-6. Altura
    // cheia porque aquele main é de altura fixa com overflow-hidden, então quem
    // rola é a lista aqui dentro, não a página.
    <div className="flex h-full flex-col gap-6">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HVAC Schedule &amp; Material</h1>
          <p className="text-sm text-muted-foreground">
            Stage calendar and the purchase date it depends on
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Filter label="Jobsite" value={jobsite} onChange={setJobsite} className="w-[170px]">
            <SelectItem value="all">All jobsites</SelectItem>
            {jobsites.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </Filter>

          <Filter label="Stage" value={stageKey} onChange={setStageKey} className="w-[165px]">
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </Filter>

          <Filter label="Status" value={status} onChange={setStatus} className="w-[130px]">
            <SelectItem value="all">All</SelectItem>
            {(Object.keys(STATE_LABEL) as StageState[]).map(s => (
              <SelectItem key={s} value={s}>{STATE_LABEL[s]}</SelectItem>
            ))}
          </Filter>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Search
            </span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent pl-2.5 dark:bg-input/30">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Project, lot…"
                className="h-8 w-[150px] bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Métricas no topo, fixas: são elas que respondem "o que preciso saber
          agora", e não podem sumir ao rolar a lista.
          Uma linha só, sempre, e dentro da largura da tela: seis colunas que
          encolhem juntas, sem rolagem lateral e sem estourar. */}
      <div className="shrink-0">
        <div className="grid grid-cols-6 gap-3">
        <Metric
          title="Active projects"
          value={String(projects.filter(isActive).length)}
          icon={<Building2 className="h-4 w-4" />}
          subtitle={`${projects.length} with dates`}
          tone="slate"
        />
        <Metric
          title="In progress"
          value={String(allStages.filter(s => s.state === "running").length)}
          icon={<Activity className="h-4 w-4" />}
          subtitle={`of ${allStages.length} stages`}
          tone="blue"
        />
        <Metric
          title="Completed"
          value={String(allStages.filter(s => s.state === "done").length)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          subtitle="stages confirmed"
          tone="emerald"
        />
        <Metric
          title="Delayed"
          value={String(allStages.filter(s => s.state === "delayed").length)}
          icon={<AlertTriangle className="h-4 w-4" />}
          subtitle="past due, not started"
          tone="amber"
        />
        <Metric
          title="Orders overdue"
          value="—"
          icon={<ShoppingCart className="h-4 w-4" />}
          subtitle="needs purchase record"
          tone="red"
        />
        <Metric
          title="Buy this week"
          value={String(thisWeek.length)}
          icon={<Truck className="h-4 w-4" />}
          subtitle="Monday to Sunday"
          tone="violet"
        />
        </div>
      </div>

      {/* O container de baixo, com os containers dentro. É quem rola.
          A margem negativa com padding igual devolve o espaço que o corte da
          rolagem comia: sem ela a borda dos cartões encosta na beirada e some
          em cima e dos lados. */}
      <div className="-mx-1 grid min-h-0 flex-1 gap-4 overflow-y-auto px-1 pt-1 pb-2 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Project stages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sites.length === 0 ? (
              <Empty>No HVAC project has stage dates yet.</Empty>
            ) : (
              <Accordion>
                {sites.map(({ site, lots }) => (
                  <AccordionItem key={site} value={site}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 items-center gap-3 pr-3">
                        <span className="font-medium">{site}</span>
                        <span className="text-xs text-muted-foreground">
                          {lots.length} {lots.length === 1 ? "lot" : "lots"}
                        </span>
                        {lots.some(l => l.stacked) && (
                          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Stacked
                          </Badge>
                        )}
                        {lots.some(l => l.stages.some(s => s.state === "delayed")) && (
                          <Badge variant="outline" className="gap-1 border-red-500/40 text-red-600 dark:text-red-400">
                            {lots.reduce((n, l) => n + l.stages.filter(s => s.state === "delayed").length, 0)} delayed
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {lots.reduce((n, l) => n + l.stages.filter(s => s.state === "running").length, 0)} running ·{" "}
                          {lots.reduce(
                            (n, l) => n + l.stages.filter(s => s.purchaseBy && s.state !== "done").length,
                            0,
                          )}{" "}
                          to buy
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-3 pb-1">
                        {lots.map(lot => <LotStages key={lot.project.id} lot={lot} />)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Next purchases
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {purchases.length === 0 ? (
              <Empty>Nothing to buy.</Empty>
            ) : (
              purchases.slice(0, 12).map(({ p, s }) => (
                <div
                  key={`${p.project.id}-${s.key}`}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lotLabel(p)}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">{formatDate(s.purchaseBy)}</p>
                    {sameWeek(s.purchaseBy!, today) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">this week</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Um lote e a distribuição das suas quatro etapas.
//
// Cartão por etapa em vez de linha de tabela: a tabela repetia seis cabeçalhos
// por lote e afogava justamente o que se procura, que é qual lote e em que pé
// está cada etapa dele. Aqui o lote tem nome grande, e as etapas vêm lado a
// lado, na ordem em que acontecem na obra.
function LotStages({ lot }: { lot: ProjectStages }) {
  const [editing, setEditing] = useState<Stage | null>(null)

  return (
    <div className="rounded-xl border bg-card/40 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{lotLabel(lot)}</span>
        {lot.stacked && (
          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Same day
          </Badge>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Progress value={lot.percent} className="h-1.5 w-16" />
          <span className="tabular-nums">{lot.percent}%</span>
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
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

// Uma etapa do lote. A faixa colorida à esquerda é o estado, e repete a cor do
// selo: quem varre a coluna de cima a baixo enxerga o atraso antes de ler.
function StageCard({ stage: s, onEdit }: { stage: Stage; onEdit: () => void }) {
  return (
    <div className={`group/stage min-w-0 rounded-lg border border-l-4 p-2.5 ${STAGE_EDGE[s.state]}`}>
      <div className="flex items-center gap-1.5">
        <s.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs font-medium">{s.label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="-mr-1 ml-auto h-6 w-6 shrink-0 p-0 opacity-0 transition-opacity group-hover/stage:opacity-100 focus-visible:opacity-100"
          aria-label={`Change ${s.label} dates`}
          onClick={onEdit}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>

      <Badge variant="outline" className={`mt-1.5 ${STATE_STYLE[s.state]}`}>
        {STATE_LABEL[s.state]}
      </Badge>

      <dl className="mt-2 flex flex-col gap-0.5 text-xs">
        <Line term="Planned" from={s.start} to={s.end} />
        <Line term="Actual" from={s.actualStart} to={s.actualEnd} muted={!s.actualStart && !s.actualEnd} />
        <div className="flex items-baseline gap-1.5">
          <dt className="w-14 shrink-0 text-muted-foreground">Buy by</dt>
          <dd className="tabular-nums">{formatDate(s.purchaseBy)}</dd>
        </div>
      </dl>
    </div>
  )
}

function Line({
  term, from, to, muted,
}: {
  term: string
  from: Date | null
  to: Date | null
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="w-14 shrink-0 text-muted-foreground">{term}</dt>
      <dd className={`truncate tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
        {formatDate(from)} <span className="text-muted-foreground">→</span> {formatDate(to)}
      </dd>
    </div>
  )
}

// A faixa da esquerda, por estado. Mesma família de cor do selo.
const STAGE_EDGE: Record<StageState, string> = {
  delayed: "border-l-red-500/70",
  done: "border-l-emerald-500/70",
  running: "border-l-blue-500/70",
  upcoming: "border-l-border",
  undated: "border-l-border border-dashed",
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
  title, value, icon, subtitle, tone,
}: {
  title: string
  value: string
  icon: React.ReactNode
  subtitle?: string
  tone: Tone
}) {
  const t = TONE[tone]
  return (
    <Card className={`min-w-0 gap-0 py-3 ${t.card}`}>
      <CardHeader className="flex flex-row items-center gap-2 px-3 pb-1.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
          {icon}
        </span>
        {/* Uma linha sempre: título que quebra em duas desalinha o número de
            todos os cartões vizinhos. */}
        <CardTitle className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 px-3">
        <p className={`text-xl font-bold tabular-nums ${t.value}`}>{value}</p>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      <CircleDashed className="h-4 w-4" />
      {children}
    </p>
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
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <Select value={value} onValueChange={v => v && onChange(v)}>
        <SelectTrigger className={`h-8 ${className ?? ""}`}>
          <span className="flex-1 truncate text-left text-sm">{labelOf(children, value)}</span>
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

/** O texto do item escolhido, para o gatilho mostrar a escolha e não o valor
 *  cru. Ler das próprias opções evita manter uma segunda tabela de rótulos. */
function labelOf(children: React.ReactNode, value: string): React.ReactNode {
  for (const child of Children.toArray(children)) {
    if (isValidElement<{ value?: string; children?: React.ReactNode }>(child) && child.props.value === value) {
      return child.props.children
    }
  }
  return value
}

function siteOf(p: ProjectStages): string {
  return p.project.jobSite?.trim() || "No jobsite"
}

function lotLabel(p: ProjectStages): string {
  return p.project.loteBld?.trim() || p.project.name || "—"
}

function byLot(a: ProjectStages, b: ProjectStages): number {
  return lotLabel(a).localeCompare(lotLabel(b), undefined, { numeric: true })
}
