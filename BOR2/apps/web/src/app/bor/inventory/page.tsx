'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertCircle, ChevronDown, ChevronUp, DollarSign, Package, TrendingDown, TrendingUp } from 'lucide-react';
import { useInventory } from '@/hooks/use-inventory';
import { useFinancialStore } from '@/store/financial.store';
import { InventorySkeleton } from '@/components/common/page-skeleton';
import { Card, Kpi, Scope } from '@/components/common/insight-card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { DetalheExcesso } from '@/services/inventory.service';

const CURRENT_YEAR = new Date().getFullYear()
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ALL = 'all'
const COLORS = { within: '#3B82F6', excess: '#EF4444' }

const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const day = (iso: string) => `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`

/** Lote com template de material: sem ele não existe limite, então não entra na conta. */
const hasLimit = (d: { house_model_nome?: string | null }) => {
  const m = d.house_model_nome?.trim().toLowerCase()
  return Boolean(m && m !== 'no template')
}

/** "Bates Quarry Lot 23" vira "Bates Quarry": o job site é o nome sem o lote. */
const jobSiteOf = (project: string) => project.replace(/\s*-?\s*\b(lot|building|bldg)\b.*$/i, '').trim() || project

/** Custo de uma retirada separado entre o que cabia no limite e o que passou dele. */
function split(d: DetalheExcesso, prices: Record<string, number>) {
  const price = d.valor_unitario != null && d.valor_unitario > 0 ? d.valor_unitario : prices[String(d.product_id)] ?? prices[d.product_nome] ?? 0
  const before = d.consumo_acumulado_momento - d.quantidade_retirada
  const excessUnits = Math.max(0, d.consumo_acumulado_momento - Math.max(d.quantidade_limite, before))
  const withinUnits = Math.max(0, d.quantidade_retirada - excessUnits)
  return { price, excessUnits, within: withinUnits * price, excess: excessUnits * price }
}

/** Seletores colados (ano e mês): título em cima de cada um, borda arredondada só nas pontas, linha única entre eles. */
function JoinedFilter({ parts }: { parts: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }[] }) {
  return (
    <div className="flex items-end">
      {parts.map((p, i) => (
        <div key={p.label} className="flex flex-col gap-1">
          <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{p.label}</span>
          <Select value={p.value} onValueChange={v => v && p.onChange(v)}>
            <SelectTrigger className={`h-8 w-auto gap-1.5 text-sm focus-visible:z-10 ${i === 0 ? 'rounded-l-lg rounded-r-none' : 'rounded-r-lg rounded-l-none border-l-0'}`}>
              <span className="whitespace-nowrap text-left">{p.options.find(o => o.value === p.value)?.label}</span>
            </SelectTrigger>
            <SelectContent className="max-h-64 w-max min-w-(--anchor-width)" alignItemWithTrigger={false} align="start">
              {p.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}

/**
 * Tooltip do mês: total, dentro do limite e excesso e, havendo mês anterior, quanto a fatia
 * de excesso subiu ou caiu: de 10% para 14% é +4%, não a variação do valor em dólar.
 */
function FinancialTip({ active, payload, label, blur }: {
  active?: boolean; payload?: { payload: { within: number; excess: number; prevMonth?: string; prevShare: number | null } }[]; label?: string; blur: string
}) {
  if (!active || !payload?.length) return null
  const { within, excess, prevMonth, prevShare } = payload[0].payload
  const total = within + excess
  const change = prevShare != null && total > 0 ? pct(excess, total) - prevShare : null
  return (
    <div className="w-52 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 flex justify-between font-semibold"><span>{label}</span><span className={`tabular-nums ${blur}`}>{fmtUSD(total)}</span></p>
      <p className="flex justify-between"><span style={{ color: COLORS.within }}>Within limit</span><span className="tabular-nums"><span className="text-muted-foreground">{pct(within, total)}% </span><span className={blur}>{fmtUSD(within)}</span></span></p>
      <p className="flex justify-between"><span style={{ color: COLORS.excess }}>Excess</span><span className="tabular-nums"><span className="text-muted-foreground">{pct(excess, total)}% </span><span className={blur}>{fmtUSD(excess)}</span></span></p>
      <div className="mt-1.5 border-t border-border pt-1.5">
        <p className="text-muted-foreground">{pct(excess, total)}% excess in <span className={blur}>{fmtUSD(total)}</span></p>
        {change != null && (
          <p className={`flex items-center gap-1 ${change > 0 ? 'text-red-600 dark:text-red-400' : change < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            {change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {change > 0 ? '+' : ''}{change}% excess vs {prevMonth}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Arrastar para rolar na horizontal (clicar e puxar). Se o ponteiro andou, o clique que
 * vem no fim do arraste é engolido, para não abrir um lote sem querer.
 */
function useDragScroll() {
  const st = useRef({ down: false, x: 0, left: 0, moved: false })
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      st.current = { down: true, x: e.clientX, left: e.currentTarget.scrollLeft, moved: false }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const c = st.current
      if (!c.down) return
      const dx = e.clientX - c.x
      if (Math.abs(dx) > 4) c.moved = true
      if (c.moved) e.currentTarget.scrollLeft = c.left - dx
    },
    onPointerUp: () => { st.current.down = false },
    onPointerLeave: () => { st.current.down = false },
    onClickCapture: (e: React.MouseEvent) => {
      if (st.current.moved) { e.stopPropagation(); e.preventDefault(); st.current.moved = false }
    },
  }
}

export default function InventoryPage() {
  const { data, isLoading, error } = useInventory()
  const { showFinancialData } = useFinancialStore()
  const blur = showFinancialData ? '' : 'blur-sm select-none'
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState<string>(ALL)
  const [chartW, setChartW] = useState(800)
  const drag = useDragScroll()
  const [openLot, setOpenLot] = useState<string | null>(null)

  const prices = data?.product_prices ?? {}
  const rows = useMemo(() => (data?.detalhes_excesso ?? []).filter(hasLimit), [data])
  const yearStr = String(year)
  const inScope = (date: string) => date.startsWith(yearStr) && (month === ALL || date.slice(5, 7) === month)

  const years = useMemo(() => {
    const s = new Set(rows.map(d => Number(d.movement_date.slice(0, 4))))
    s.add(CURRENT_YEAR)
    return [...s].sort((a, b) => a - b)
  }, [rows])
  const months = useMemo(() => [...new Set(rows.filter(d => d.movement_date.startsWith(yearStr)).map(d => d.movement_date.slice(5, 7)))].sort(), [rows, yearStr])

  // Custo por mês do ano, dentro do limite e em excesso (antes e depois do reset, tudo igual).
  const monthly = useMemo(() => {
    const m = new Map<string, { within: number; excess: number }>()
    for (const d of rows) {
      if (!d.movement_date.startsWith(yearStr)) continue
      const c = split(d, prices)
      if (c.price === 0) continue
      const k = d.movement_date.slice(5, 7)
      const cur = m.get(k) ?? { within: 0, excess: 0 }
      cur.within += c.within
      cur.excess += c.excess
      m.set(k, cur)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ key: k, month: MONTHS_SHORT[Number(k) - 1], ...v }))
      .map((p, i, all) => {
        const prev = all[i - 1]
        return { ...p, prevMonth: prev?.month, prevShare: prev && prev.within + prev.excess > 0 ? pct(prev.excess, prev.within + prev.excess) : null }
      })
  }, [rows, prices, yearStr])

  const scoped = useMemo(() => rows.filter(d => inScope(d.movement_date)), [rows, yearStr, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => scoped.reduce((t, d) => {
    const c = split(d, prices)
    return { within: t.within + c.within, excess: t.excess + c.excess, units: t.units + c.excessUnits }
  }, { within: 0, excess: 0, units: 0 }), [scoped, prices])

  // Lotes com retirada acima do limite e, dentro de cada um, os produtos que passaram.
  const lots = useMemo(() => {
    const m = new Map<string, { lot: string; units: number; cost: number; products: Map<string, number> }>()
    for (const d of scoped) {
      const c = split(d, prices)
      if (c.excessUnits <= 0) continue
      const e = m.get(d.project_nome) ?? { lot: d.project_nome, units: 0, cost: 0, products: new Map() }
      e.units += c.excessUnits
      e.cost += c.excess
      e.products.set(d.product_nome, (e.products.get(d.product_nome) ?? 0) + c.excessUnits)
      m.set(d.project_nome, e)
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost || b.units - a.units)
  }, [scoped, prices])

  // Ranking de job sites pelo custo do excesso: soma dos lotes de cada um.
  const sites = useMemo(() => {
    const m = new Map<string, { site: string; cost: number; units: number; lots: typeof lots }>()
    for (const l of lots) {
      const k = jobSiteOf(l.lot)
      const e = m.get(k) ?? { site: k, cost: 0, units: 0, lots: [] }
      e.cost += l.cost
      e.units += l.units
      e.lots.push(l)
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost || b.units - a.units)
  }, [lots])

  if (isLoading) return <InventorySkeleton />
  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-5 w-5 text-red-500" /><p className="text-sm">Failed to load inventory data.</p>
      </div>
    )
  }

  const total = totals.within + totals.excess
  const scopeLabel = month === ALL ? yearStr : `${MONTHS[Number(month) - 1]} ${yearStr}`
  const resets = (data.reset_dates?.length ? data.reset_dates : data.reset_date ? [data.reset_date] : []).filter(d => d.startsWith(yearStr))
  const focus = month === ALL ? undefined : MONTHS_SHORT[Number(month) - 1]

  return (
    // Toda mudança visual da página leva meio segundo, como no Workforce.
    <div className="flex h-full flex-col gap-3 max-xl:overflow-y-auto max-xl:pr-1 [&_*]:transition-[color,background-color,border-color,opacity,fill,fill-opacity,stroke,box-shadow,transform,width] [&_*]:duration-500 [&_*]:ease-out">
      <div className="flex shrink-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory Control</h1>
          <p className="text-sm text-muted-foreground">Material withdrawals, excess over the lot limits and their cost</p>
        </div>
        <JoinedFilter parts={[
          { label: 'Year', value: yearStr, options: years.map(y => ({ value: String(y), label: String(y) })), onChange: v => { setYear(Number(v)); setMonth(ALL) } },
          { label: 'Month', value: month, options: [{ value: ALL, label: `All of ${yearStr}` }, ...months.map(m => ({ value: m, label: MONTHS[Number(m) - 1] }))], onChange: setMonth },
        ]} />
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={DollarSign} label={<>Withdrawals<Scope>{scopeLabel}</Scope></>} value={showFinancialData ? fmtUSD(total) : '••••'} sub="Cost of all material taken out" />
        <Kpi icon={TrendingDown} label="Excess Cost" value={showFinancialData ? fmtUSD(totals.excess) : '••••'} tone={totals.excess > 0 ? 'red' : undefined}
          sub={`${pct(totals.excess, total)}% of the withdrawals`} />
        <Kpi icon={Package} label="Excess Units" value={String(Math.round(totals.units))} tone={totals.units > 0 ? 'red' : undefined}
          sub={`Taken after the lot limit, in ${lots.length} ${lots.length === 1 ? 'lot' : 'lots'}`} />
      </div>

      {/* O gráfico principal em cima, na largura toda; as violações embaixo. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Card className="min-h-0 flex-[3]" title={<><span className="max-sm:hidden">Monthly</span>Financial Impact<span className="max-sm:hidden"><Scope>{yearStr}</Scope></span></>}
          right={
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full" style={{ background: COLORS.within }} />Within<span className="-ml-0.5 max-sm:hidden">limit</span></span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full" style={{ background: COLORS.excess }} />Excess</span>
            </div>
          }
          help={{
            what: 'Cost of every material withdrawal per month, split between what fit the lot limit and what went past it.',
            items: [
              { label: 'Within limit', color: COLORS.within, text: 'Material taken while the lot was still under its limit.' },
              { label: 'Excess', color: COLORS.excess, text: 'Material taken after the lot limit was already reached.' },
              { label: 'Reset', text: 'A stock recount (the opening count, then later recounts): the dashed line marks the month and the label the day.' },
            ],
            note: 'Lots without a material template have no limit and are left out. Values follow the money visibility toggle.',
          }}>
          {monthly.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">No withdrawals in {yearStr}.</p> : (
            <ResponsiveContainer width="100%" height="100%" onResize={w => setChartW(w)}>
              <BarChart accessibilityLayer={false} data={monthly} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} maxBarSize={64}
                className="[&_*:focus]:outline-none" onClick={(s: { activeLabel?: string | number }) => {
                  const m = monthly.find(x => x.month === s?.activeLabel)
                  if (m) setMonth(month === m.key ? ALL : m.key)
                }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={(v: number) => (showFinancialData ? `$${Math.round(v / 1000)}k` : '')} />
                <Tooltip animationDuration={500} content={<FinancialTip blur={blur} />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                {/* A largura da barra do mês representa os dias dele: a linha do reset fica no ponto do dia
                    dentro da barra (dia 16 de 31 no meio, dia 25 de 30 a ~82%). A linha visível é desenhada no label. */}
                {resets.map((r, i) => monthly.some(m => m.key === r.slice(5, 7)) && (
                  <ReferenceLine key={r} x={MONTHS_SHORT[Number(r.slice(5, 7)) - 1]} stroke="none"
                    label={(p: { viewBox?: { x?: number; y?: number; height?: number } }) => {
                      const dim = new Date(Number(r.slice(0, 4)), Number(r.slice(5, 7)), 0).getDate()
                      // Barra = 80% da faixa do mês (barCategoryGap padrão de 10% de cada lado), no máximo 64 px.
                      const bar = Math.min(64, ((chartW - 48) / monthly.length) * 0.8)
                      const x = (p.viewBox?.x ?? 0) + ((Number(r.slice(8, 10)) - 0.5) / dim - 0.5) * bar
                      const y = p.viewBox?.y ?? 0, h = p.viewBox?.height ?? 0
                      return (
                        <g>
                          <line x1={x} x2={x} y1={y} y2={y + h} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.7} />
                          {/* Estreito, os rótulos dos resets encostam: só a data, um abaixo do outro. */}
                          <text x={x - 4} y={y + 10 + (chartW < 520 ? i * 12 : 0)} fontSize={10} textAnchor="end" fill="var(--muted-foreground)">{chartW < 520 ? day(r) : `Reset · ${day(r)}`}</text>
                        </g>
                      )
                    }} />
                ))}
                <Bar dataKey="within" stackId="c" fill={COLORS.within} animationDuration={500} fillOpacity={0.9}
                  shape={(p: any) => <rect x={p.x} y={p.y} width={p.width} height={p.height} fill={COLORS.within} fillOpacity={focus && p.payload.month !== focus ? 0.35 : 0.9} />} />
                <Bar dataKey="excess" stackId="c" fill={COLORS.excess} animationDuration={500} radius={[3, 3, 0, 0]}
                  shape={(p: any) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={3} fill={COLORS.excess} fillOpacity={focus && p.payload.month !== focus ? 0.35 : 1} />} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="min-h-0 flex-[2]" title={<>Limit Violations<Scope>{scopeLabel}</Scope></>}
          help={{
            what: 'Job sites ranked by the cost of material taken past the lot limits, each with its lots and the products that went past.',
            items: [
              { label: 'Excess', color: COLORS.excess, text: 'Cost of the material taken after the limit.' },
              { label: 'Units', text: 'Units taken after the limit.' },
              { label: 'Lots', text: 'How many of its lots went past the limit.' },
            ],
            action: 'Each block is a job site, most costly first; click and drag sideways for the others. Click a lot to see its products.',
          }}>
          {sites.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No violations in this period.</p> : (
            // Galeria: um bloco por job site, lado a lado (rola na horizontal); cada bloco cresce para baixo.
            <div {...drag} className="flex h-full cursor-grab gap-2 overflow-x-auto pb-1 select-none active:cursor-grabbing [scrollbar-color:auto]! [scrollbar-width:auto]! [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar]:h-1! [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
              {sites.map((s, rank) => (
                <div key={s.site} className="flex w-60 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
                  {/* Cabeçalho em duas pontas: job site e lotes à esquerda, custo e unidades à direita. */}
                  <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="text-muted-foreground tabular-nums">#{rank + 1}</span><span className="truncate">{s.site}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{s.lots.length} {s.lots.length === 1 ? 'lot' : 'lots'} over the limit</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums text-red-600 dark:text-red-400 ${blur}`}>{fmtUSD(s.cost)}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{Math.round(s.units)} units over</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 px-3 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span className="flex-1">Lot</span><span>Units</span><span className="w-14 text-right" style={{ color: COLORS.excess }}>Excess</span><span className="w-3" />
                  </div>
                  <div className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto px-1.5 pb-1.5">
                    {s.lots.map(l => {
                      const lotOpen = openLot === l.lot
                      return (
                        <div key={l.lot} className={`rounded ${lotOpen ? 'bg-muted/60' : ''}`}>
                          <button type="button" onClick={() => setOpenLot(lotOpen ? null : l.lot)}
                            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] hover:bg-muted/60">
                            <span className="min-w-0 flex-1 truncate">{l.lot.replace(s.site, '').replace(/^s*-?s*/, '') || l.lot}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">+{Math.round(l.units)}</span>
                            <span className={`w-14 shrink-0 text-right tabular-nums text-red-500/80 dark:text-red-400/80 ${blur}`}>{fmtUSD(l.cost)}</span>
                            {lotOpen ? <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          </button>
                          {lotOpen && (
                            <div className="grid gap-0.5 px-1.5 pb-1.5 pl-3">
                              {[...l.products.entries()].sort((x, y) => y[1] - x[1]).map(([name, units]) => (
                                <p key={name} className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                                  <span className="truncate">{name}</span><span className="shrink-0 tabular-nums text-red-500/80 dark:text-red-400/80">+{Math.round(units)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
