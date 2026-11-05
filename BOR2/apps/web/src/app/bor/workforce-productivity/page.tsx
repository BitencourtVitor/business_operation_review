"use client"

import { Fragment, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { interpret } from "./_lib/interpret"
import { useQueries, useQuery } from "@tanstack/react-query"
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts"
import {
  AlarmClockPlus, Lightbulb, ArrowDown, ArrowLeft, Info, MousePointerClick, ArrowRight, ArrowUp, ArrowUpDown, Building2, Calendar, CircleHelp, Clock, Flame, Layers, TrendingDown, TrendingUp, Settings2, TriangleAlert, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PageSkeleton } from "@/components/common/page-skeleton"
import { usePermission } from "@/hooks/use-permission"
import {
  type BuildingForecast, workforceInsightsService, type BuildingView, type EmployeeHours, type Granularity, type InsightsPeriod, type ObraHours,
} from "@/services/workforce-insights.service"
import { WorkforceSettingsDialog } from "./_components/settings-dialog"

const YEAR = new Date().getFullYear()
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const ANIM = 500
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]
// Primeiro ano com dado bruto do QB Time no banco (carga histórica de 04/11/2026).
const FIRST_YEAR = 2026
const COLORS = { regular: "#3B82F6", overtime: "#EF4444", planned: "#8A8A8A", projected: "#F59E0B" }
const ALL = "all"

type Series = "regular" | "overtime"
type ObraType = "all" | "building" | "house"

const fmtH = (h: number) => `${Math.round(h).toLocaleString("en-US")} h`
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`

/** Nome curto do período, para eixo e texto: "Jan" ou "Nov 1". */
function periodShort(p: InsightsPeriod, g: Granularity) {
  return g === "month" ? MONTHS[Number(p.key.slice(5, 7)) - 1] : day(p.from)
}

/** Nome do período para seletor e título: "January" ou "Nov 1 [seta] Nov 14". */
function PeriodName({ p, g }: { p: InsightsPeriod; g: Granularity }) {
  if (g === "month") return <>{MONTH_NAMES[Number(p.key.slice(5, 7)) - 1]}</>
  const y1 = p.from.slice(0, 4), y2 = p.to.slice(0, 4)
  return (
    <span className="inline-flex items-center gap-1">
      {day(p.from)}{y1 !== y2 && `, ${y1}`}<ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />{day(p.to)}, {y2}
    </span>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** Período no título, como subtítulo: linha vertical, cor apagada e peso normal. */
function Scope({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
      <span className="mx-[0.4em] h-[0.9em] w-px bg-border" aria-hidden />{children}
    </span>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: React.ReactNode; value: string; sub?: string; tone?: "red"
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{label}
      </p>
      <p className={`text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

type HelpSpec = {
  what: React.ReactNode
  items?: { label: string; color?: string; text: React.ReactNode }[]
  note?: React.ReactNode
  action?: React.ReactNode
}

/** Explicação do ícone de dúvida: o que o bloco mostra, o que é cada dado, observação e o que dá para fazer. */
function HelpBody({ what, items, note, action }: HelpSpec) {
  return (
    <div className="grid w-80 gap-2 text-xs leading-relaxed">
      <p>{what}</p>
      {items && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border pt-2">
          {items.map(i => (
            <Fragment key={i.label}>
              <dt className="flex items-center gap-1.5 self-start font-medium whitespace-nowrap">
                {i.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />}{i.label}
              </dt>
              <dd className="text-muted-foreground">{i.text}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {note && <p className="flex gap-1.5 border-t border-border pt-2 text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{note}</p>}
      {action && <p className="flex gap-1.5 border-t border-border pt-2 text-muted-foreground"><MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />{action}</p>}
    </div>
  )
}

/** Bloco com título, ícone de dúvida (a explicação mora no hover) e o que vai à direita. */
function Card({ title, help, right, children, className = "" }: {
  title: React.ReactNode; help?: HelpSpec; right?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card/60 px-4 pt-3 pb-2 max-xl:min-h-[300px] ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1 truncate text-sm font-medium">{title}</p>
        {/* Do lado oposto ao título: a legenda e, por último, a explicação no hover. */}
        <div className="flex shrink-0 items-center gap-3">
          {right}
          {help && (
            <TooltipProvider delay={150}>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
                  <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-none border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-md [&>:last-child]:hidden"><HelpBody {...help} /></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

function Legend({ hover, onHover }: { hover: Series | null; onHover: (s: Series | null) => void }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {(["regular", "overtime"] as const).map(s => (
        <span key={s} onMouseEnter={() => onHover(s)} onMouseLeave={() => onHover(null)}
          className={`flex cursor-default items-center gap-1.5 transition-opacity ${hover && hover !== s ? "opacity-40" : ""}`}>
          <span className="inline-block h-2 w-4 rounded-full" style={{ background: COLORS[s] }} />
          {s === "regular" ? "Regular" : "Overtime"}
        </span>
      ))}
    </div>
  )
}

/** Tooltip das barras empilhadas: horas de cada parte e a fatia de overtime. */
type StackRow = { regular: number; overtime: number; name?: string; prevName?: string; prevShare?: number | null }

/**
 * Tooltip das barras empilhadas: horas de cada parte, a fatia de overtime e,
 * quando houver período anterior, quanto essa fatia subiu ou caiu: de 2% para
 * 10% é +8%, não a variação das horas de overtime entre si.
 */
function StackTip({ active, payload, label }: { active?: boolean; payload?: { payload: StackRow }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const total = r.regular + r.overtime
  const change = r.prevShare != null && total > 0 ? pct(r.overtime, total) - r.prevShare : null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{r.name ?? label}</p>
      <p className="flex justify-between gap-6"><span style={{ color: COLORS.regular }}>Regular</span><span className="tabular-nums">{fmtH(r.regular)}</span></p>
      <p className="flex justify-between gap-6"><span style={{ color: COLORS.overtime }}>Overtime</span><span className="tabular-nums">{fmtH(r.overtime)}</span></p>
      <p className="mt-1 border-t border-border pt-1 text-muted-foreground">{pct(r.overtime, total)}% overtime in {fmtH(total)}</p>
      {change != null && (
        <p className={`flex items-center gap-1 ${change > 0 ? "text-red-600 dark:text-red-400" : change < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {change > 0 ? "+" : ""}{change}% overtime vs {r.prevName}
        </p>
      )}
    </div>
  )
}

// O Recharts 3 deixa a camada das barras focável; sem isto o navegador desenha
// um contorno de foco em volta do gráfico depois do clique.
const axis = "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_*:focus]:outline-none"

/**
 * Barras empilhadas regular embaixo (azul) e overtime em cima (vermelho). O
 * hover numa parte destaca a mesma parte em todas as barras; highlight realça a
 * barra do período escolhido e esmaece as outras.
 */
function StackedBars({ data, layout = "horizontal", nameWidth = 0, onPick, hover, setHover, highlight, tooltip }: {
  data: { name: string; regular: number; overtime: number }[]
  layout?: "horizontal" | "vertical"; nameWidth?: number; onPick?: (name: string) => void
  hover: Series | null; setHover: (s: Series | null) => void
  highlight?: string; tooltip?: React.ReactElement
}) {
  const op = (s: Series, name: string) =>
    (hover && hover !== s ? 0.2 : 1) * (highlight && highlight !== name ? 0.55 : 1)
  const vertical = layout === "vertical"
  // A barra sob o mouse vem do movimento; o clique é no bloco. Clique dentro do
  // gráfico se perde no Recharts 3 (ele redesenha as barras no mousedown).
  const under = useRef<number | null>(null)
  return (
    <div className={`${axis} h-full ${onPick ? "cursor-pointer" : ""}`}
      onClick={() => under.current != null && data[under.current] && onPick?.(data[under.current].name)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={data} layout={layout} margin={{ top: 6, right: 8, left: vertical ? 0 : -18, bottom: 0 }}
          onMouseMove={(st: { activeTooltipIndex?: number | string | null }) => {
            under.current = st?.activeTooltipIndex == null ? null : Number(st.activeTooltipIndex)
          }}
          onMouseLeave={() => { under.current = null; setHover(null) }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} horizontal={!vertical} vertical={vertical} />
          {vertical ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={nameWidth} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            </>
          )}
          <RechartsTooltip animationDuration={ANIM} content={tooltip ?? <StackTip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <Bar animationDuration={ANIM} dataKey="regular" stackId="h" fill={COLORS.regular}
            onMouseEnter={() => setHover("regular")} onMouseLeave={() => setHover(null)}>
            {data.map(d => <Cell key={d.name} fillOpacity={op("regular", d.name)} />)}
          </Bar>
          <Bar animationDuration={ANIM} dataKey="overtime" stackId="h" fill={COLORS.overtime} radius={vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            onMouseEnter={() => setHover("overtime")} onMouseLeave={() => setHover(null)}>
            {data.map(d => <Cell key={d.name} fillOpacity={op("overtime", d.name)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Bloco de barras empilhadas: título à esquerda, legenda do lado oposto. */
function StackedCard({ title, help, empty, className, ...bars }: Omit<Parameters<typeof StackedBars>[0], "hover" | "setHover"> & {
  title: React.ReactNode; help?: HelpSpec; empty?: string; className?: string
}) {
  const [hover, setHover] = useState<Series | null>(null)
  return (
    <Card title={title} help={help} className={className} right={<Legend hover={hover} onHover={setHover} />}>
      {bars.data.length === 0 && empty
        ? <p className="py-8 text-center text-xs text-muted-foreground">{empty}</p>
        : <StackedBars {...bars} hover={hover} setHover={setHover} />}
    </Card>
  )
}

type Trend = { name: string; share: number | null }[]

/**
 * Curva da fatia de overtime em SVG puro. Dentro do tooltip de outro gráfico,
 * o Recharts 3 herda as medidas do gráfico de fora e a curva vaza.
 */
function Sparkline({ points, highlight }: { points: Trend; highlight?: string }) {
  const W = 232, H = 70, P = 6
  const vals = points.map(p => p.share ?? 0)
  const max = Math.max(10, ...vals)
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1)
  const y = (v: number) => H - P - (v / max) * (H - 2 * P)
  // Curva suave: entre dois pontos, os controles ficam no meio do caminho e na altura de cada ponta, sem passar do valor real.
  const pts = points.flatMap((p, i) => (p.share == null ? [] : [[x(i), y(p.share)]]))
  const line = pts.map(([px, py], i) => {
    if (i === 0) return `M${px},${py}`
    const [qx, qy] = pts[i - 1], mx = (qx + px) / 2
    return `C${mx},${qy} ${mx},${py} ${px},${py}`
  }).join(" ")
  return (
    <svg width={W} height={H + 14} className="mt-1 overflow-visible">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--border)" />
      <path d={line} fill="none" stroke={COLORS.overtime} strokeWidth={2} strokeLinecap="round" />
      {points.map((p, i) => p.share != null && (
        <circle key={p.name} cx={x(i)} cy={y(p.share)} r={p.name === highlight ? 4 : 2} fill={COLORS.overtime}
          stroke={p.name === highlight ? "var(--popover)" : "none"} strokeWidth={1.5} />
      ))}
      <text x={P} y={H + 12} fontSize={9} fill="var(--muted-foreground)">{points[0]?.name}</text>
      <text x={W - P} y={H + 12} fontSize={9} textAnchor="end" fill="var(--muted-foreground)">{points.at(-1)?.name}</text>
      {/* Só o valor do período em destaque, o mesmo do topo do cartão; o teto do eixo confundia. */}
      {points.map((p, i) => p.name === highlight && p.share != null && (
        // Afastado da bolinha (acima, ou abaixo se faltar espaço) e com contorno da cor do fundo para não sumir na linha.
        <text key="v" x={i === points.length - 1 ? x(i) - 8 : x(i)} y={y(p.share) - 16 < 0 ? y(p.share) + 20 : y(p.share) - 12}
          fontSize={11} fontWeight={600} textAnchor={i === points.length - 1 ? "end" : "middle"}
          fill="var(--foreground)" stroke="var(--popover)" strokeWidth={3} paintOrder="stroke">{p.share}%</text>
      ))}
    </svg>
  )
}

/** Tooltip do ranking: horas, fatia de overtime e a curva dela ao longo do tempo. */
function RankTip({ active, payload, trends, highlight }: {
  active?: boolean; payload?: { payload: { name: string; regular: number; overtime: number } }[]
  trends: Map<string, Trend>; highlight?: string
}) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const total = r.regular + r.overtime
  const trend = trends.get(r.name) ?? []
  return (
    <div className="w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{r.name}</p>
      <p className="flex justify-between"><span style={{ color: COLORS.regular }}>Regular</span><span className="tabular-nums">{fmtH(r.regular)}</span></p>
      <p className="flex justify-between"><span style={{ color: COLORS.overtime }}>Overtime</span><span className="tabular-nums">{fmtH(r.overtime)} · {pct(r.overtime, total)}%</span></p>
      <p className="mt-2 text-muted-foreground">Overtime share over time</p>
      <Sparkline points={trend} highlight={highlight} />
    </div>
  )
}

/**
 * Tabela de horas: nome, regular e overtime (horas no começo, fatia na ponta).
 * O cabeçalho fica parado enquanto as linhas rolam; `tip` abre um cartão no hover da linha.
 */
type SortKey = "name" | "regular" | "overtime" | "share"

function HoursTable({ label, rows, tip, defaultSort }: {
  label: string; rows: { name: string; regular: number; overtime: number }[]; tip?: (name: string) => React.ReactNode
  defaultSort: SortKey
}) {
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null)
  // Abre na ordem padrão do bloco (maior para menor). Clique no cabeçalho: crescente,
  // decrescente e de volta à padrão.
  const [picked, setPicked] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const sort = picked ?? { key: defaultSort, dir: -1 as const }
  const toggle = (key: SortKey) => setPicked(p => {
    const s = p ?? { key: defaultSort, dir: -1 as const }
    if (s.key !== key) return { key, dir: 1 }
    if (s.dir === 1) return { key, dir: -1 }
    return p ? null : { key, dir: 1 }
  })
  const value = (o: (typeof rows)[number], k: SortKey) =>
    k === "name" ? o.name : k === "share" ? o.overtime / (o.regular + o.overtime || 1) : o[k]
  const shown = [...rows].sort((a, b) => {
    const x = value(a, sort.key), y = value(b, sort.key)
    return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir
  })
  // Função, não componente: o botão não remonta a cada clique e mantém o foco.
  const head = (k: SortKey, children: React.ReactNode, className = "", color?: string) => {
    const Icon = sort.key !== k ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
    return (
      <th key={k} className={`py-1 text-left font-medium ${className}`} style={{ color }}
        aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggle(k)} className="group/sort inline-flex items-center gap-1 uppercase tracking-wider">
          {children}
          <Icon className={`h-3 w-3 ${sort.key === k ? "" : "opacity-0 group-hover/sort:opacity-60"}`} />
        </button>
      </th>
    )
  }
  return (
    <div className="h-full overflow-y-auto" onMouseLeave={() => setHover(null)}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-[color-mix(in_oklab,var(--card)_60%,var(--background))] shadow-[0_1px_0_var(--border)]">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {head("name", label)}
            {head("regular", "Regular", "w-20", COLORS.regular)}
            {head("overtime", "Overtime", "w-20", COLORS.overtime)}
            {head("share", "OT %", "w-14 pe-3", COLORS.overtime)}
          </tr>
        </thead>
        <tbody>
          {shown.map(o => (
            <tr key={o.name} className={`border-t border-border/50 ${tip ? "cursor-default hover:bg-muted/40" : ""}`}
              onMouseMove={tip ? e => setHover({ name: o.name, x: e.clientX, y: e.clientY }) : undefined}>
              <td className="py-1.5 pr-2">{o.name}</td>
              <td className="py-1.5 text-left tabular-nums">{fmtH(o.regular)}</td>
              <td className="py-1.5 tabular-nums">{fmtH(o.overtime)}</td>
              <td className="py-1.5 pe-3 tabular-nums text-red-500/70 dark:text-red-400/70">{pct(o.overtime, o.regular + o.overtime)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tip && hover && (
        <div className="pointer-events-none fixed z-50 -translate-y-full" style={{ left: hover.x - 272, top: hover.y - 8 }}>{tip(hover.name)}</div>
      )}
    </div>
  )
}

// ─── Building budget (EVM) ───────────────────────────────────────────────────

const toT = (iso: string) => Date.parse(iso + "T00:00:00Z")
const fromT = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Etiqueta de linha do gráfico ("Limit", "Estimate"): x é a borda esquerda (ou o centro, com center), y o centro. */
function ChartTag({ x, y, text, color, center = false, maxX = Infinity }: {
  x: number; y: number; text: string; color: string; center?: boolean; maxX?: number
}) {
  // Largura estimada da fonte de 9 px em negrito, com folga dos dois lados.
  const w = text.length * 5.2 + 12
  // Centrada, a etiqueta não passa da borda direita do gráfico (maxX), senão é cortada.
  const left = center ? Math.min(x - w / 2, maxX - w) : x
  return (
    <g transform={`translate(${left}, ${y - 7.5})`}>
      {/* Cor maciça: 15% da cor sobre o fundo, sem transparência, para cobrir a linha. */}
      <rect width={w} height={15} rx={3} style={{ fill: `color-mix(in oklab, ${color} 15%, var(--background))`, stroke: `color-mix(in oklab, ${color} 40%, var(--background))` }} />
      <text x={w / 2} y={10.5} fontSize={9} fontWeight={600} textAnchor="middle" fill={color}>{text}</text>
    </g>
  )
}

/** Tooltip da curva do prédio: valores do dia e, embaixo, o detalhe do prédio (antes texto fixo sob o gráfico). */
function BudgetTip({ active, payload, label, f }: {
  active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: number | string; f: BuildingForecast
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="w-60 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label != null && day(fromT(Number(label)))}</p>
      {payload.filter(p => p.value != null).map(p => (
        <p key={p.name} className="flex justify-between gap-6"><span style={{ color: p.color }}>{p.name}</span><span className="tabular-nums">{fmtH(p.value!)}</span></p>
      ))}
      {/* Quem trabalhou no prédio, mais horas primeiro; os tipos excluídos no settings (Panels) já vêm fora. */}
      {!!f.workers?.length && (
        <div className="mt-2 grid gap-0.5 border-t border-border pt-2">
          <p className="mb-0.5 text-muted-foreground">Who worked here · {f.workers.length}</p>
          {/* Lista inteira com rolagem discreta; a roda do mouse sobre o gráfico rola esta lista (o tooltip não recebe o ponteiro). */}
          {/* Barra fina sem as setas: o global põe scrollbar-width thin em tudo, e aí o Chrome ignora o estilo webkit; aqui volta a auto (com !, porque a regra global fica fora das camadas do Tailwind) para ele valer. Encaixe nome a nome. */}
          <div data-workers-list className="grid max-h-36 snap-y snap-mandatory [scrollbar-color:auto]! [scrollbar-width:auto]! gap-0.5 overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:w-0.5! [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-button]:h-0 [&::-webkit-scrollbar-button]:w-0 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
          {f.workers.map(w => (
            <p key={w.employee} className="flex snap-start justify-between gap-3">
              <span className="truncate">{w.employee}</span>
              <span className="shrink-0 tabular-nums">{fmtH(w.regular)}{w.overtime > 0 && <span className="text-red-500/70 dark:text-red-400/70"> + {fmtH(w.overtime)} OT</span>}</span>
            </p>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Dias que o gráfico do prédio mostra: o fechamento de cada mês (Month) ou de cada
 * pay period (Pay period), nunca dia a dia. Os pontos especiais entram por fora:
 * o primeiro, hoje, o fim previsto e o último. Pay periods futuros seguem de 14 em 14 dias.
 */
function samplePoints(series: { date: string }[], g: Granularity, periods: InsightsPeriod[], extra: string[]) {
  const dates = new Set(series.map(p => p.date))
  const grid: string[] = []
  if (g === "month") {
    series.forEach((p, i) => { if (series[i + 1] && series[i + 1].date.slice(0, 7) !== p.date.slice(0, 7)) grid.push(p.date) })
  } else {
    const ends = periods.map(p => p.to).sort()
    const last = series[series.length - 1]?.date ?? ""
    let next = ends.at(-1)
    while (next && next < last) { next = fromT(toT(next) + 14 * 864e5); ends.push(next) }
    grid.push(...ends.filter(d => dates.has(d)))
  }
  const keep = new Set([...extra, ...grid])
  if (series.length) keep.add(series[0].date).add(series[series.length - 1].date)
  // grid: os fechamentos (mês ou pay period), que também são as datas escritas no eixo X.
  return { keep, grid }
}

/** Ícone com a leitura do gráfico do prédio: o que aconteceu e o que a estimativa diz. */
function ReadingTip({ lines }: { lines: string[] }) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground" />}>
          <Lightbulb className="h-3.5 w-3.5" />Reading
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-none border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-md [&>:last-child]:hidden">
          <ul className="grid w-80 gap-1.5 text-xs leading-relaxed">
            {lines.map(l => <li key={l} className="flex gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />{l}</li>)}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** "Coppersmith at Canton, MA - Building 1": lote só com número vira "Building N". */
const buildingName = (b: { jobSite: string; lot: string }) => `${b.jobSite} - ${/^\d+$/.test(b.lot) ? `Building ${b.lot}` : b.lot}`

function BuildingBudget({ buildings, granularity, periods }: { buildings: BuildingView[]; granularity: Granularity; periods: InsightsPeriod[] }) {
  const ready = buildings.filter(b => b.forecast)
  const [open, setOpen] = useState<string | null>(null)
  const [chartH, setChartH] = useState(180)
  const [chartW, setChartW] = useState(Infinity)
  const openB = ready.find(b => b.building.id === open)
  return (
    // Escolhido um prédio, o bloco inteiro passa a detalhar só ele; o botão volta à lista.
    <Card className="h-full" title={<>
      {open && (
        <button type="button" onClick={() => setOpen(null)}
          className="mr-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </button>
      )}
      {/* Aberto, o título passa a ser o prédio; o nome do gráfico desce para a linha de baixo. */}
      {openB ? <span className="truncate">{buildingName(openB.building)}</span>
        : <>Cumulative Labor Budget<Scope>Select a Building</Scope></>}
    </>}
      help={{
        what: "Hours of everyone who worked on each Forecast building, added up since the first hours logged there, against its labor budget. The budget is turned into hours with the workers' rates, so no money is shown.",
        items: [
          { label: "Goal", color: COLORS.planned, text: "The budget spread evenly from the first hours logged on the building to the expected end date." },
          { label: "Accumulated hours", color: COLORS.regular, text: "Hours worked on the building, added up day by day." },
          { label: "Estimated hours", color: COLORS.projected, text: "The average pace so far carried forward from today's line: up to the expected end date or, when the building is late, for as many days as it is late (60 at most)." },
          { label: "Limit", color: COLORS.overtime, text: "The budget. Anything above it is shaded red." },
        ],
        note: "Work types left out in the settings (e.g. Panels) do not count. Someone without a pay rate counts at the average rate of the others. The period filter does not apply: the curve always starts on the first hours logged on the building, by anyone.",
        action: "Click a building to see only its curve. Back returns to the list.",
      }}>
      {ready.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No building has hours yet. Link the buildings to their QB Time job sites in the settings.</p>
      ) : (
        <div className={open ? "flex h-full min-h-0 flex-col" : "grid h-full content-start gap-0.5 overflow-y-auto"}>
          {ready.filter(b => !open || b.building.id === open).map(b => {
            const f = b.forecast!
            const isOpen = open === b.building.id
            // Eixo de tempo de verdade (não categoria): a data de fim entra como ponto próprio,
            // e a meta é uma reta do primeiro ponto até ela, sem dobrar na semana seguinte.
            const endT = toT(f.end)
            const proj = f.series.filter(p => p.projected != null)
            const { keep, grid } = samplePoints(f.series, granularity, periods, proj.length > 1 ? [proj[0].date] : [])
            // Toda data de fechamento vira legenda do eixo; se não couber, uma a cada tantas, sem pular de forma irregular.
            const step = Math.max(1, Math.ceil(grid.length / Math.max(1, Math.floor((chartW - 60) / 42))))
            const ticks = grid.filter((_, i) => i % step === 0).map(toT)
            // O último dia (fim da estimativa) também leva data; se ficar colado na data anterior do eixo, toma o lugar dela.
            const lastT = toT(f.series[f.series.length - 1].date)
            if (ticks.at(-1) !== lastT) {
              const pxPerMs = (chartW - 60) / Math.max(1, lastT - toT(f.series[0].date))
              if (ticks.length && (lastT - ticks[ticks.length - 1]) * pxPerMs < 42) ticks.pop()
              ticks.push(lastT)
            }
            const data = [
              ...f.series.filter(p => p.date !== f.end && keep.has(p.date)).map(p => ({ ...p, t: toT(p.date), planned: p.date < f.end ? p.planned : null })),
              { ...(f.series.find(p => p.date === f.end) ?? { actual: null, projected: null }), date: f.end, t: endT, planned: f.budgetHours },
            ].sort((a, b) => a.t - b.t)
            const tMin = data[0].t, tMax = data[data.length - 1].t
            // Onde a projeção começa (hoje): separa o que já aconteceu do que é estimativa.
            const nowPoint = proj.length > 1 ? toT(proj[0].date) : undefined
            const yMax = Math.ceil(Math.max(f.budgetHours, f.projectedHours) * 1.05)
            return (
              <div key={b.building.id} className={`rounded-md px-1.5 py-1 ${isOpen ? "flex min-h-0 flex-1 flex-col" : "hover:bg-muted/40"}`}>
                {isOpen ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-muted-foreground">Cumulative Labor Budget Over Time</p>
                    <ReadingTip lines={interpret({ status: b.building.status.toLowerCase(), end: f.end, today: new Date().toISOString().slice(0, 10), budgetHours: f.budgetHours, exceedsOn: f.exceedsOn, series: f.series })} />
                  </div>
                ) : (
                  <button type="button" onClick={() => setOpen(b.building.id)}
                    className="flex w-full items-center text-left text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{buildingName(b.building)}</span>
                    </span>
                  </button>
                )}
                {isOpen && (
                  <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border pt-2">
                    <div ref={el => { if (el) { setChartH(el.clientHeight); setChartW(el.clientWidth) } }} className={`min-h-0 flex-1 ${axis}`}
                      onWheel={e => {
                        // Um nome por giro da roda: avança a altura de uma linha, na direção do giro.
                        const list = e.currentTarget.querySelector<HTMLElement>("[data-workers-list]")
                        const row = list?.firstElementChild as HTMLElement | null
                        if (list && row) list.scrollBy({ top: Math.sign(e.deltaY) * (row.offsetHeight + 2) })
                      }}>
                      <ResponsiveContainer width="100%" height="100%">
                        {/* A meta sobe de zero até o orçamento na data estimada de fim e para ali, marcada por uma bolinha. */}
                        <LineChart accessibilityLayer={false} data={data} margin={{ top: 24, right: 6, left: 0, bottom: 0 }}>
                          <XAxis dataKey="t" type="number" scale="time" domain={[tMin, tMax]} ticks={ticks} interval={0} axisLine={false} tickLine={false}
                            // A última data encosta na borda direita: alinhada pelo fim, para não ser cortada.
                            tick={(p: { x: string | number; y: string | number; payload: { value: unknown } }) => (
                              <text x={p.x} y={p.y} dy={10} fontSize={10} fill="var(--muted-foreground)" textAnchor={Number(p.payload.value) === lastT ? "end" : "middle"}>{day(fromT(Number(p.payload.value)))}</text>
                            )} />
                          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => v.toLocaleString("en-US")}
                            domain={[0, yMax]} />
                          <RechartsTooltip animationDuration={ANIM} content={<BudgetTip f={f} />} allowEscapeViewBox={{ x: false, y: true }} position={{ y: chartH }} />
                          {/* Acima do limite, o fundo fica levemente avermelhado. */}
                          <ReferenceArea y1={f.budgetHours} y2={yMax} fill={COLORS.overtime} fillOpacity={0.05} ifOverflow="hidden" />
                          <ReferenceLine y={f.budgetHours} stroke={COLORS.overtime} strokeDasharray="2 3" strokeOpacity={0.5} />
                          {/* A etiqueta vai numa linha invisível à parte, acima de todas as outras camadas. */}
                          <ReferenceLine zIndex={1100} y={f.budgetHours} stroke="none"
                            label={(p: { viewBox?: { x?: number; y?: number } }) => <ChartTag x={p.viewBox?.x ?? 0} y={p.viewBox?.y ?? 0} text="Limit" color={COLORS.overtime} />} />
                          {nowPoint && (
                            <ReferenceLine zIndex={1100} x={nowPoint} stroke={COLORS.projected} strokeDasharray="3 3" strokeOpacity={0.8}
                              label={(p: { viewBox?: { x?: number; y?: number } }) => <ChartTag center maxX={chartW} x={p.viewBox?.x ?? 0} y={(p.viewBox?.y ?? 0) - 10} text="Estimate" color={COLORS.projected} />} />
                          )}
                          {(
                            <ReferenceDot zIndex={1100} x={endT} y={f.budgetHours} r={4} fill={COLORS.planned} stroke="var(--popover)" strokeWidth={1.5}
                              label={{ value: "Expected end", fontSize: 10, fill: "var(--foreground)",
                                // Perto da borda direita o rótulo vai para a esquerda da bolinha, senão é cortado.
                                position: (endT - tMin) > (tMax - tMin) * 0.7 ? "left" : "top" }} />
                          )}
                          {/* Meta: a informação principal, sólida e por cima das outras linhas. */}
                          <Line zIndex={1000} animationDuration={ANIM} type="linear" dataKey="planned" name="Goal" stroke={COLORS.planned} strokeWidth={2} dot={false} />
                          <Line animationDuration={ANIM} type="monotone" dataKey="actual" name="Accumulated hours" stroke={COLORS.regular} strokeWidth={2} dot={false} connectNulls />
                          <Line animationDuration={ANIM} type="linear" dataKey="projected" name="Estimated hours" stroke={COLORS.projected} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

function Filter({ label, icon: Icon, value, options, onChange, width = 150 }: {
  label: string; icon: React.ElementType; value: string; options: { value: string; label: string }[]
  onChange: (v: string) => void; width?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={v => v && onChange(v)}>
        <SelectTrigger className="h-8 gap-1.5 text-sm" style={{ width }}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left">{options.find(o => o.value === value)?.label}</span>
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

type Part = {
  label: string; icon?: React.ElementType; value: string
  options: { value: string; label: React.ReactNode }[]; onChange: (v: string) => void
}

/** Seletores colados: um título em cima de cada um, borda arredondada só no começo e no fim. */
function JoinedFilter({ parts }: { parts: Part[] }) {
  return (
    <div className="flex items-end">
      {parts.map((p, i) => {
        const Icon = p.icon
        // Uma linha só entre os blocos: o do meio não tem borda lateral (as pontas fazem a divisão);
        // com dois blocos, o último dispensa a borda esquerda.
        const last = i === parts.length - 1
        const edge = parts.length === 1 ? "rounded-lg"
          : i === 0 ? "rounded-l-lg rounded-r-none"
          : last ? `rounded-r-lg rounded-l-none ${parts.length === 2 ? "border-l-0" : ""}`
          : "rounded-none border-x-0"
        return (
          <div key={p.label} className="flex flex-col gap-1">
            <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{p.label}</span>
            <Select value={p.value} onValueChange={v => v && p.onChange(v)}>
              <SelectTrigger className={`h-8 w-auto gap-1.5 text-sm focus-visible:z-10 ${edge}`}>
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="whitespace-nowrap text-left">{p.options.find(o => o.value === p.value)?.label}</span>
              </SelectTrigger>
              <SelectContent className="max-h-64 w-max min-w-(--anchor-width) [&_[data-slot=select-scroll-up-button]]:hidden" alignItemWithTrigger={false} align="start">
                {/* "All" fica preso no topo enquanto a lista rola: top-1 é o respiro da lista,
                    para ele não subir; a sombra cobre esse respiro, e a seta de rolar para
                    cima sai porque ficaria por cima dele. */}
                {p.options.map(o => (
                  <SelectItem key={o.value} value={o.value} className={o.value === ALL ? "sticky top-1 z-20 mb-1 rounded-b-none border-b border-border bg-popover shadow-[0_-4px_0_var(--popover)]" : ""}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}

const sumBy = <T,>(rows: T[], key: (r: T) => string) => {
  const out = new Map<string, { name: string; regular: number; overtime: number }>()
  for (const r of rows as (T & { regular: number; overtime: number })[]) {
    const k = key(r)
    const o = out.get(k) ?? { name: k, regular: 0, overtime: 0 }
    o.regular += r.regular
    o.overtime += r.overtime
    out.set(k, o)
  }
  return [...out.values()]
}

export default function WorkforceProductivityPage() {
  const params = useSearchParams()
  const raw = (params.get("company") ?? "framing").toLowerCase()
  const company = raw === "hvac" || raw === "pcg" ? raw : "framing"
  const { canEdit } = usePermission()
  const [year, setYear] = useState(YEAR)
  const [granularity, setGranularity] = useState<Granularity>("month")
  const [period, setPeriod] = useState(ALL)
  const [obraType, setObraType] = useState<ObraType>("all")
  const [settingsOpen, setSettingsOpen] = useState(false)

  const allYears = Array.from({ length: YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
  const queries = useQueries({
    queries: (granularity === "month" ? [year] : allYears).map(y => ({
      queryKey: ["workforce-insights", "overview", company, y, granularity],
      queryFn: () => workforceInsightsService.overview(company, y, granularity),
    })),
  })
  const isLoading = queries.some(q => q.isLoading)
  // O pay period que cruza a virada do ano vem nos dois anos: entra uma vez só.
  const overview = useMemo(() => {
    const seen = new Set<string>()
    const out = { periods: [] as InsightsPeriod[], obras: [] as ObraHours[], employees: [] as EmployeeHours[] }
    for (const q of queries) {
      if (!q.data) continue
      const fresh = new Set(q.data.periods.map(p => p.key).filter(k => !seen.has(k)))
      out.periods.push(...q.data.periods.filter(p => fresh.has(p.key)))
      out.obras.push(...q.data.obras.filter(o => fresh.has(o.period)))
      out.employees.push(...q.data.employees.filter(e => fresh.has(e.period)))
      fresh.forEach(k => seen.add(k))
    }
    out.periods.sort((a, b) => a.from.localeCompare(b.from))
    return out
  }, [queries.map(q => q.dataUpdatedAt).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data: buildings = [] } = useQuery({
    queryKey: ["workforce-insights", "buildings"],
    queryFn: workforceInsightsService.buildings,
    enabled: company === "framing",
  })

  const periods = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return (overview?.periods ?? []).filter(p => p.from <= today)
  }, [overview])
  const inPeriod = (r: { period: string }) => period === ALL || r.period === period
  const obras = useMemo(() => (overview?.obras ?? []).filter(o =>
    obraType === "all" || (obraType === "building" ? o.isBuilding : !o.isBuilding)), [overview, obraType])
  const people = overview?.employees ?? []

  const scopedPeople = people.filter(inPeriod)
  const reg = scopedPeople.reduce((s, e) => s + e.regular, 0)
  const ot = scopedPeople.reduce((s, e) => s + e.overtime, 0)
  const withOt = new Set(scopedPeople.filter(e => e.overtime > 0.01).map(e => e.employee)).size
  const headcount = new Set(scopedPeople.map(e => e.employee)).size

  // Overtime contra o período anterior (WF-15).
  const prevKey = period !== ALL ? periods[periods.findIndex(p => p.key === period) - 1]?.key : undefined
  const prevShare = (() => {
    if (!prevKey) return null
    const rows = people.filter(e => e.period === prevKey)
    const r = rows.reduce((s, e) => s + e.regular, 0), o = rows.reduce((s, e) => s + e.overtime, 0)
    return r + o > 0 ? pct(o, r + o) : null
  })()

  const label = (k: string) => {
    const p = periods.find(x => x.key === k)
    return p ? periodShort(p, granularity) : k
  }
  const longLabel = (k: string) => {
    const p = periods.find(x => x.key === k)
    return p ? <PeriodName p={p} g={granularity} /> : k
  }
  const obraSeries = periods.map(p => {
    const rows = obras.filter(o => o.period === p.key)
    return { name: label(p.key), key: p.key, regular: rows.reduce((s, o) => s + o.regular, 0), overtime: rows.reduce((s, o) => s + o.overtime, 0) }
  }).map((p, i, all) => {
    const prev = all[i - 1]
    const prevTotal = prev ? prev.regular + prev.overtime : 0
    return { ...p, prevName: prev?.name, prevShare: prevTotal > 0 ? pct(prev.overtime, prevTotal) : null }
  })
  const topObras = sumBy(obras.filter(inPeriod), (o: ObraHours) => (o.lot ? `${o.jobsite} · ${o.lot}` : o.jobsite))
    .sort((a, b) => b.regular - a.regular).slice(0, 10)
  const ranking = sumBy(scopedPeople, (e: EmployeeHours) => e.employee)
    .sort((a, b) => b.overtime - a.overtime || b.regular - a.regular)
  // Período em destaque: o escolhido ou, no ano todo, o último.
  const focusKey = period !== ALL ? period : periods.at(-1)?.key
  const focusName = focusKey ? label(focusKey) : undefined
  // Fatia de overtime de cada funcionário em cada período, para o hover do ranking.
  const trends = useMemo(() => {
    const by = new Map<string, { regular: number; overtime: number }>()
    for (const e of people) {
      const k = e.employee + "|" + e.period, t = by.get(k) ?? { regular: 0, overtime: 0 }
      t.regular += e.regular; t.overtime += e.overtime; by.set(k, t)
    }
    // Com um período escolhido, a curva para nele: o que vem depois ainda não aconteceu.
    const upTo = period === ALL ? periods : periods.slice(0, periods.findIndex(p => p.key === period) + 1)
    const out = new Map<string, Trend>()
    for (const name of new Set(people.map(e => e.employee))) {
      out.set(name, upTo.map(p => {
        const t = by.get(name + "|" + p.key), tot = t ? t.regular + t.overtime : 0
        return { name: label(p.key), share: tot > 0 ? pct(t!.overtime, tot) : null }
      }))
    }
    return out
  }, [periods, people, period]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PageSkeleton />

  const periodOptions = [{ value: ALL, label: granularity === "month" ? `All of ${year}` : "All pay periods" }, ...periods.map(p => ({ value: p.key, label: longLabel(p.key) }))]
  const scopeLabel = period === ALL ? (granularity === "month" ? `${year}` : "All pay periods") : longLabel(period)
  const years = Array.from({ length: YEAR - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i))
  const typeLabel = obraType === "building" ? "Buildings" : obraType === "house" ? "Houses" : "All job sites"

  return (
    // Toda mudança visual da página leva meio segundo; os gráficos seguem a mesma duração.
    <div className="flex h-full flex-col gap-3 max-xl:overflow-y-auto max-xl:pr-1 [&_*]:transition-[color,background-color,border-color,opacity,fill,fill-opacity,stroke,box-shadow,transform,width] [&_*]:duration-500 [&_*]:ease-out">
      <div className="flex shrink-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="flex items-center text-xl font-semibold tracking-tight">Workforce Productivity<Scope>{company === "framing" ? "Framing" : company.toUpperCase()}</Scope></h1>
          <p className="text-sm text-muted-foreground">Hours, overtime and labor budget from QB Time</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <JoinedFilter parts={[
            { label: "Period", icon: Calendar, value: granularity,
              options: [{ value: "month", label: "Month" }, { value: "payperiod", label: "Pay period" }],
              onChange: v => { setGranularity(v as Granularity); setPeriod(ALL) } },
            ...(granularity === "month"
              ? [{ label: "Year", value: String(year), options: years.map(y => ({ value: y, label: y })),
                   onChange: (v: string) => { setYear(Number(v)); setPeriod(ALL) } }]
              : []),
            { label: granularity === "month" ? "Month" : "Pay period", value: period,
              options: periodOptions, onChange: setPeriod },
          ]} />
          <Filter label="Type" icon={Layers} value={obraType} width={140}
            options={[{ value: "all", label: "All job sites" }, { value: "building", label: "Buildings" }, { value: "house", label: "Houses" }]}
            onChange={v => setObraType(v as ObraType)} />
          {canEdit("workforce") && (
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Workforce settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Clock} label={<>Hours<Scope>{scopeLabel}</Scope></>} value={fmtH(reg + ot)} sub={`${headcount} employees`} />
        <Kpi icon={Users} label="Regular" value={fmtH(reg)} sub={`${pct(reg, reg + ot)}% of the hours`} />
        <Kpi icon={AlarmClockPlus} label="Overtime" value={fmtH(ot)} tone={ot > 0 ? "red" : undefined}
          sub={`${pct(ot, reg + ot)}% of the hours${prevShare != null ? ` · ${prevShare}% the period before` : ""}`} />
        <Kpi icon={Flame} label="Employees with overtime" value={String(withOt)} sub={`of ${headcount}`} />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
        <StackedCard title={`Hours by ${granularity === "month" ? "Month" : "Pay Period"}`}
          help={{
            what: `Hours worked on ${typeLabel.toLowerCase()} each ${granularity === "month" ? "month" : "pay period"}, split into regular and overtime.`,
            items: [
              { label: "Regular", color: COLORS.regular, text: "Monday to Friday hours up to 40 h in the week." },
              { label: "Overtime", color: COLORS.overtime, text: "Monday to Friday hours past 40 h in the week, plus every weekend hour." },
            ],
            note: "Work types left out in the settings (e.g. Panels) are not counted. Holiday counts toward the 40 h; sick and lunch do not.",
            action: "Hover a bar for the overtime share and how it moved from the period before. Click it to filter the page by that period.",
          }}
          data={obraSeries} highlight={focusName} onPick={name => {
            const p = obraSeries.find(s => s.name === name)
            if (p) setPeriod(p.key)
          }} />
        <Card title={<>Job Sites with the Most Hours<Scope>{scopeLabel}</Scope></>}
          help={{
            what: `The ten job sites with the most regular hours in the chosen period, for ${typeLabel.toLowerCase()}, most regular hours first.`,
            items: [
              { label: "Regular", color: COLORS.regular, text: "Hours within the weekly 40 h." },
              { label: "Overtime", color: COLORS.overtime, text: "Hours past the weekly 40 h, plus weekends." },
              { label: "OT %", text: "Share of the job site's hours that were overtime." },
            ],
            note: "Hours logged at a job site without a lot are spread across its lots.",
            action: "Click a column title to sort; click again to flip, and once more to go back.",
          }}>
          {topObras.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No hours in this period.</p>
          ) : (
            <HoursTable label="Job site" rows={topObras} defaultSort="regular" />
          )}
        </Card>
      </div>

      <div className={`grid min-h-0 flex-1 gap-3 ${company === "framing" ? "xl:grid-cols-2" : ""}`}>
        {company === "framing" && <BuildingBudget buildings={buildings} granularity={granularity} periods={periods} />}
        <Card title={<>Overtime Ranking<Scope>{scopeLabel}</Scope></>} className="h-full"
          help={{
            what: "Every employee with hours in the chosen period, most overtime first.",
            items: [
              { label: "Regular", color: COLORS.regular, text: "Hours within the weekly 40 h." },
              { label: "Overtime", color: COLORS.overtime, text: "Hours past the weekly 40 h, plus weekends." },
              { label: "OT %", text: "Share of the employee's hours that were overtime." },
            ],
            action: "Hover a row for the overtime share period by period. Click a column title to sort.",
          }}>
          {ranking.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No hours in this period.</p>
          ) : (
            <HoursTable label="Employee" rows={ranking} defaultSort="overtime" tip={name => <RankTip active payload={[{ payload: ranking.find(x => x.name === name)! }]} trends={trends} highlight={period === ALL ? undefined : focusName} />} />
          )}
        </Card>
      </div>

      {company === "framing" && buildings.length > 0 && buildings.every(b => !b.forecast) && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="h-3.5 w-3.5" />Link the buildings to their QB Time job sites in the settings to see the budgets.
        </p>
      )}

      <WorkforceSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
