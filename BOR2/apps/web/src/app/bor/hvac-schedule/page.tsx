"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, CircleDashed,
  Layers, Loader2, Pencil, ShoppingCart, Truck,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { useForecast, useHVACActuals } from "@/hooks/use-forecast"
import type { HVACActual } from "@/services/forecast.service"
import { EditStageDialog } from "./_components/edit-stage-dialog"
import {
  formatDate, isActive, sameWeek, stagesOf, startOfToday,
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

  const today = startOfToday()

  // As datas reais chegam numa lista só, para toda a HVAC. Agrupar por obra uma
  // vez custa menos que varrer a lista inteira dentro de cada projeto.
  const actualsByProject = useMemo(() => {
    const map = new Map<string, HVACActual[]>()
    for (const a of actuals ?? []) map.set(a.projectId, [...(map.get(a.projectId) ?? []), a])
    return map
  }, [actuals])

  const projects = useMemo(
    () => (data ?? [])
      .map(p => stagesOf(p, today, actualsByProject.get(p.id) ?? []))
      .filter(p => p.stages.some(s => s.start || s.end)),
    [data, today, actualsByProject],
  )

  // Agrupa por jobsite e, dentro dele, uma linha por lot. É a leitura que o
  // comprador faz: vai a uma obra e leva o material de todos os lotes dela.
  const sites = useMemo(() => {
    const map = new Map<string, ProjectStages[]>()
    for (const p of projects) {
      const site = p.project.jobSite?.trim() || "No jobsite"
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
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">HVAC Schedule &amp; Material</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stage calendar and the purchase date each stage depends on. Planned dates come from the
          forecast; what actually happened is recorded here.
        </p>
      </div>

      {/* Métricas no topo. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric
          title="Active projects"
          value={String(projects.filter(isActive).length)}
          icon={<Building2 className="h-4 w-4" />}
          subtitle={`${projects.length} with dates`}
        />
        <Metric
          title="Stages in progress"
          value={String(allStages.filter(s => s.state === "running").length)}
          icon={<Loader2 className="h-4 w-4" />}
          subtitle={`of ${allStages.length} scheduled`}
        />
        <Metric
          title="Stages completed"
          value={String(allStages.filter(s => s.state === "done").length)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          subtitle="confirmed on site"
        />
        <Metric
          title="Stages delayed"
          value={String(allStages.filter(s => s.state === "delayed").length)}
          icon={<AlertTriangle className="h-4 w-4" />}
          subtitle="planned date passed, not started"
        />
        <Metric
          title="Orders overdue"
          value="—"
          icon={<ShoppingCart className="h-4 w-4" />}
          subtitle="needs the purchase record"
        />
        <Metric
          title="To buy this week"
          value={String(thisWeek.length)}
          icon={<Truck className="h-4 w-4" />}
          subtitle="Monday to Sunday"
        />
      </div>

      {/* O container de baixo, com os containers dentro. */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
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
                      {lots.map(lot => <LotTable key={lot.project.id} lot={lot} />)}
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

function LotTable({ lot }: { lot: ProjectStages }) {
  const [editing, setEditing] = useState<Stage | null>(null)

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm font-medium">{lotLabel(lot)}</span>
        {lot.stacked && (
          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Same day
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Progress value={lot.percent} className="h-1.5 w-20" />
          {lot.percent}%
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[190px]">Stage</TableHead>
            <TableHead>Planned</TableHead>
            <TableHead>Actual</TableHead>
            <TableHead>Buy material by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lot.stages.map(s => (
            <TableRow key={s.key}>
              <TableCell className="font-medium">{s.label}</TableCell>
              <TableCell className="tabular-nums whitespace-nowrap">
                {formatDate(s.start)} <span className="text-muted-foreground">→</span> {formatDate(s.end)}
              </TableCell>
              <TableCell className="tabular-nums whitespace-nowrap">
                {s.actualStart || s.actualEnd ? (
                  <>
                    {formatDate(s.actualStart)} <span className="text-muted-foreground">→</span> {formatDate(s.actualEnd)}
                  </>
                ) : (
                  <span className="text-muted-foreground">not started</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{formatDate(s.purchaseBy)}</TableCell>
              <TableCell>
                <Badge variant="outline" className={STATE_STYLE[s.state]}>
                  {STATE_LABEL[s.state]}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Change ${s.label} dates`}
                  onClick={() => setEditing(s)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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

function Metric({
  title, value, icon, subtitle,
}: {
  title: string
  value: string
  icon: React.ReactNode
  subtitle?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
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

function lotLabel(p: ProjectStages): string {
  return p.project.loteBld?.trim() || p.project.name || "—"
}

function byLot(a: ProjectStages, b: ProjectStages): number {
  return lotLabel(a).localeCompare(lotLabel(b), undefined, { numeric: true })
}
