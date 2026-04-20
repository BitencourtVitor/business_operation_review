'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useInventory } from '@/hooks/use-inventory';
import { useFinancialStore } from '@/store/financial.store';
import { InventorySkeleton } from '@/components/common/page-skeleton';
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertCircle, Package, TrendingDown, DollarSign, Calendar,
  Activity, AlertTriangle, BarChart2, ChevronDown, ChevronUp, ArrowUpDown, Info,
  ShoppingCart, FileText, PackageCheck,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipProvider as UITooltipProvider, TooltipTrigger as UITooltipTrigger } from '@/components/ui/tooltip';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const MONTHS = [
  { value:  1, label: 'January'   }, { value:  2, label: 'February'  },
  { value:  3, label: 'March'     }, { value:  4, label: 'April'     },
  { value:  5, label: 'May'       }, { value:  6, label: 'June'      },
  { value:  7, label: 'July'      }, { value:  8, label: 'August'    },
  { value:  9, label: 'September' }, { value: 10, label: 'October'   },
  { value: 11, label: 'November'  }, { value: 12, label: 'December'  },
]

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}

function fmtUSD(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function adherenceColor(v: number | null, threshold: number) {
  if (v == null) return 'text-muted-foreground'
  if (v >= threshold) return 'text-primary'
  return 'text-red-500'
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function AdherenceTooltip({ active, payload, label, threshold }: any) {
  if (!active || !payload?.length) return null
  const val   = payload[0]?.value as number | null
  const below = payload[0]?.payload?.below as number ?? 0
  const total = payload[0]?.payload?.total as number ?? 0
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg space-y-1">
      <p className="font-medium">{label}</p>
      <p className={`font-bold ${adherenceColor(val, threshold ?? 75)}`}>{fmtPct(val)}</p>
      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          {below} of {total} product {total === 1 ? 'type' : 'types'} below minimum
        </p>
      )}
    </div>
  )
}

function FinancialTooltip({ active, payload, label, show }: any) {
  if (!active || !payload?.length) return null
  const normal = payload.find((p: any) => p.dataKey === 'normal')?.value ?? 0
  const excess  = payload.find((p: any) => p.dataKey === 'excess')?.value  ?? 0
  const total = normal + excess
  const normalPct = total > 0 ? Math.round((normal / total) * 100) : 0
  const excessPct = total > 0 ? Math.round((excess / total) * 100) : 0
  const vBlur = !show ? 'blur-sm select-none' : ''
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg space-y-1.5">
      <div className="flex items-baseline justify-between gap-6">
        <p className="font-semibold">{label}</p>
        <p className={`font-bold text-foreground transition-[filter] ${vBlur}`}>{fmtUSD(total)}</p>
      </div>
      <div className="border-t border-border pt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">Within limit</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{normalPct}%</span>
            <span className={`text-xs font-semibold text-foreground transition-[filter] ${vBlur}`}>{fmtUSD(normal)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-red-500">Excess</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">{excessPct}%</span>
            <span className={`text-xs font-semibold text-red-500 transition-[filter] ${vBlur}`}>{fmtUSD(excess)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Excel icon ──────────────────────────────────────────────────────────────

function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="20" height="20" rx="3" fill="#1D6F42" />
      <path d="M11 10L14.5 5H13L10.5 8.5L8 5H6.5L10 10L6.5 15H8L10.5 11.5L13 15H14.5L11 10Z" fill="white" />
    </svg>
  )
}

// ─── Info tooltip button ─────────────────────────────────────────────────────

function InfoBtn({ title, description }: { title: string; description: string }) {
  return (
    <UITooltipProvider delay={300}>
      <UITooltip>
        <UITooltipTrigger render={<span className="inline-flex cursor-default" />}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 hover:opacity-100 transition-opacity" />
        </UITooltipTrigger>
        <UITooltipContent side="bottom" className="flex flex-col gap-1 max-w-[220px]">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </UITooltipContent>
      </UITooltip>
    </UITooltipProvider>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, valueClass, info }: {
  icon: React.ElementType; label: string; value: string; sub?: string; valueClass?: string; info?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-5 py-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        {info && <InfoBtn title={label} description={info} />}
      </div>
      <p className={`text-3xl font-bold tracking-tight ${valueClass ?? ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { data, isLoading, error } = useInventory()
  const { resolvedTheme } = useTheme()
  const { showFinancialData } = useFinancialStore()
  const blur = !showFinancialData ? 'blur-sm select-none pointer-events-none' : ''

  const [selectedYear,  setSelectedYear]  = useState<number>(CURRENT_YEAR)
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all')
  const [expandedLots,       setExpandedLots]       = useState<Set<string>>(new Set())
  const [violationsAsc,      setViolationsAsc]      = useState(false)
  const [showPurchaseModal,  setShowPurchaseModal]  = useState(false)

  const THRESHOLD_KEY = 'inventory_adherence_threshold'
  const [threshold, setThreshold] = useState<number>(() => {
    if (typeof window === 'undefined') return 75
    return Number(localStorage.getItem(THRESHOLD_KEY) ?? 75)
  })
  const [thresholdInput, setThresholdInput] = useState<string>(String(threshold))

  function applyThreshold(raw: string) {
    const n = Math.min(100, Math.max(1, parseInt(raw) || 75))
    setThreshold(n)
    setThresholdInput(String(n))
    localStorage.setItem(THRESHOLD_KEY, String(n))
  }

  // Read --primary directly from the computed style so the bar color
  // always matches the theme exactly. oklch() is valid in SVG fill on modern browsers.
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    if (raw) setPrimaryColor(raw)
  }, [resolvedTheme])

  function toggleLot(lot: string) {
    setExpandedLots(prev => {
      const next = new Set(prev)
      next.has(lot) ? next.delete(lot) : next.add(lot)
      return next
    })
  }

  // ── Available years/months ──────────────────────────────────────────────────
  const years = useMemo(() => {
    if (!data) return [CURRENT_YEAR]
    const s = new Set<number>()
    data.historico_saldo.forEach(h => s.add(parseInt(h.mes.substring(0, 4))))
    data.detalhes_excesso.forEach(d => s.add(parseInt(d.movement_date.substring(0, 4))))
    if (s.size === 0) s.add(CURRENT_YEAR)
    return Array.from(s).sort((a, b) => b - a)
  }, [data])

  const yearStr = String(selectedYear)
  const monthStr = selectedMonth === 'all' ? 'all' : String(selectedMonth).padStart(2, '0')

  // ── Months that actually have data for the selected year ────────────────────
  const availableMonths = useMemo(() => {
    if (!data) return []
    const s = new Set<number>()
    data.historico_saldo
      .filter(h => h.mes.startsWith(yearStr))
      .forEach(h => s.add(parseInt(h.mes.substring(5, 7))))
    data.detalhes_excesso
      .filter(d => d.movement_date.startsWith(yearStr))
      .forEach(d => s.add(parseInt(d.movement_date.substring(5, 7))))
    return Array.from(s).sort((a, b) => a - b)
  }, [data, yearStr])

  // ── Adherence trend (12 months for selected year) ───────────────────────────
  const adherenceData = useMemo(() => {
    if (!data) return []
    const grouped = new Map<string, { total: number; below: number }>()
    for (let i = 1; i <= 12; i++) {
      grouped.set(String(i).padStart(2, '0'), { total: 0, below: 0 })
    }
    data.historico_saldo
      .filter(h => h.mes.startsWith(yearStr))
      .forEach(h => {
        const mo = h.mes.substring(5, 7)
        const cur = grouped.get(mo)!
        cur.total++
        if (h.abaixo_minimo) cur.below++
      })
    return Array.from(grouped.entries())
      .filter(([, d]) => d.total > 0)
      .map(([mo, d]) => ({
        month: MONTHS_SHORT[parseInt(mo) - 1],
        adherence: ((d.total - d.below) / d.total) * 100,
        total: d.total,
        below: d.below,
      }))
  }, [data, yearStr])

  // ── Average service level (filtered by month if selected) ───────────────────
  const avgServiceLevel = useMemo(() => {
    const pts = adherenceData.filter(d => {
      if (monthStr === 'all') return d.adherence != null
      return d.month === MONTHS_SHORT[parseInt(monthStr) - 1] && d.adherence != null
    })
    if (!pts.length) return null
    return pts.reduce((acc, d) => acc + d.adherence!, 0) / pts.length
  }, [adherenceData, monthStr])

  // ── Financial impact per month ──────────────────────────────────────────────
  const financialData = useMemo(() => {
    if (!data) return []
    const prices = data.product_prices ?? {}
    const grouped = new Map<string, { normal: number; excess: number }>()
    for (let i = 1; i <= 12; i++) {
      grouped.set(String(i).padStart(2, '0'), { normal: 0, excess: 0 })
    }
    data.detalhes_excesso
      .filter(d => d.movement_date.startsWith(yearStr))
      .forEach(d => {
        const price = (d.valor_unitario != null && d.valor_unitario > 0)
          ? d.valor_unitario
          : (prices[String(d.product_id)] ?? prices[d.product_nome] ?? 0)
        if (price === 0) return
        const mo   = d.movement_date.substring(5, 7)
        const prev = d.consumo_acumulado_momento - d.quantidade_retirada
        const excessUnits = Math.max(0, d.consumo_acumulado_momento - Math.max(d.quantidade_limite, prev))
        const normalUnits = Math.max(0, d.quantidade_retirada - excessUnits)
        const cur = grouped.get(mo)!
        cur.excess += excessUnits * price
        cur.normal += normalUnits * price
      })
    return Array.from(grouped.entries())
      .filter(([, d]) => d.normal > 0 || d.excess > 0)
      .map(([mo, d]) => ({
        month: MONTHS_SHORT[parseInt(mo) - 1],
        ...d,
      }))
  }, [data, yearStr])

  // ── KPI: Excess Units ───────────────────────────────────────────────────────
  const totalExcessUnits = useMemo(() => {
    if (!data) return 0
    return data.detalhes_excesso
      .filter(d => {
        if (!d.movement_date.startsWith(yearStr)) return false
        if (monthStr !== 'all' && d.movement_date.substring(5, 7) !== monthStr) return false
        return d.excedeu_neste_momento
      })
      .reduce((acc, d) => {
        const prev = d.consumo_acumulado_momento - d.quantidade_retirada
        return acc + Math.max(0, d.consumo_acumulado_momento - Math.max(d.quantidade_limite, prev))
      }, 0)
  }, [data, yearStr, monthStr])

  // ── KPI: Financial totals ───────────────────────────────────────────────────
  const { totalExcessCost, totalNormalCost } = useMemo(() => {
    if (!data) return { totalExcessCost: 0, totalNormalCost: 0 }
    const prices = data.product_prices ?? {}
    let exc = 0, norm = 0
    data.detalhes_excesso
      .filter(d => {
        if (!d.movement_date.startsWith(yearStr)) return false
        if (monthStr !== 'all' && d.movement_date.substring(5, 7) !== monthStr) return false
        return true
      })
      .forEach(d => {
        const price = (d.valor_unitario != null && d.valor_unitario > 0)
          ? d.valor_unitario
          : (prices[String(d.product_id)] ?? prices[d.product_nome] ?? 0)
        if (price === 0) return
        const prev = d.consumo_acumulado_momento - d.quantidade_retirada
        const excessUnits = Math.max(0, d.consumo_acumulado_momento - Math.max(d.quantidade_limite, prev))
        exc  += excessUnits * price
        norm += Math.max(0, d.quantidade_retirada - excessUnits) * price
      })
    return { totalExcessCost: exc, totalNormalCost: norm }
  }, [data, yearStr, monthStr])

  // ── Violations list — grouped by Lot (house_model_nome) ────────────────────
  const violations = useMemo(() => {
    if (!data) return []
    const map = new Map<string, {
      lot: string
      productExcess: Map<string, number>  // product_nome → excess units
      totalExcess: number
    }>()
    data.detalhes_excesso
      .filter(d => {
        if (!d.movement_date.startsWith(yearStr)) return false
        if (monthStr !== 'all' && d.movement_date.substring(5, 7) !== monthStr) return false
        return d.excedeu_neste_momento
      })
      .forEach(d => {
        const key = d.project_nome
        const prev = d.consumo_acumulado_momento - d.quantidade_retirada
        const excessUnits = Math.max(0, d.consumo_acumulado_momento - Math.max(d.quantidade_limite, prev))
        if (!map.has(key)) {
          map.set(key, { lot: d.project_nome, productExcess: new Map(), totalExcess: 0 })
        }
        const entry = map.get(key)!
        entry.productExcess.set(d.product_nome, (entry.productExcess.get(d.product_nome) ?? 0) + excessUnits)
        entry.totalExcess += excessUnits
      })
    return Array.from(map.values())
      .map(v => ({
        lot: v.lot,
        products: Array.from(v.productExcess.entries())
          .map(([name, excess]) => ({ name, excess: Math.round(excess) }))
          .sort((a, b) => b.excess - a.excess),
        totalExcess: v.totalExcess,
      }))
      .sort((a, b) => b.totalExcess - a.totalExcess)
  }, [data, yearStr, monthStr])

  // ── Purchase suggestions — products currently below minimum ────────────────
  const purchaseSuggestions = useMemo(() => {
    if (!data) return []

    // Build unit map from consumo_vs_limite (product_nome → unidade_medida)
    const unitMap = new Map<string, string>()
    data.consumo_vs_limite.forEach(c => {
      if (c.product_nome && c.unidade_medida) unitMap.set(c.product_nome, c.unidade_medida)
    })

    // Latest below-minimum entry per product within selected period
    const latest = new Map<string, typeof data.historico_saldo[0]>()
    data.historico_saldo
      .filter(h => {
        if (!h.mes.startsWith(yearStr)) return false
        if (monthStr !== 'all' && h.mes.substring(5, 7) !== monthStr) return false
        return h.abaixo_minimo
      })
      .forEach(h => {
        const cur = latest.get(h.product_nome)
        if (!cur || h.mes > cur.mes) latest.set(h.product_nome, h)
      })

    return Array.from(latest.values())
      .map(h => ({
        name:     h.product_nome,
        current:  h.saldo_acumulado,
        minimum:  h.saldo_minimo,
        toOrder:  Math.ceil(Math.max(0, h.saldo_minimo - h.saldo_acumulado)),
        unit:     unitMap.get(h.product_nome) ?? '',
      }))
      .sort((a, b) => b.toOrder - a.toOrder)
  }, [data, yearStr, monthStr])

  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) return <InventorySkeleton />

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm">Failed to load inventory data.</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const periodLabel = selectedMonth === 'all'
    ? String(selectedYear)
    : `${MONTHS.find(m => m.value === selectedMonth)?.label ?? ''} ${selectedYear}`

  function exportTxt() {
    const header = [
      'PURCHASE SUGGESTION REPORT',
      `Period: ${periodLabel}`,
      '',
      'This list shows products currently below their minimum stock balance for the selected period.',
      'It does not account for pending orders or work in progress. It shows only the quantity',
      'needed to restore each product to its full minimum required balance.',
      '',
      `${'Product'.padEnd(42)} ${'Current'.padStart(9)} ${'Minimum'.padStart(9)} ${'To Order'.padStart(10)} ${'Unit'.padEnd(8)}`,
      '-'.repeat(82),
    ]
    const rows = purchaseSuggestions.map(s =>
      `${s.name.substring(0, 42).padEnd(42)} ${s.current.toFixed(1).padStart(9)} ${s.minimum.toFixed(1).padStart(9)} ${String(s.toOrder).padStart(10)} ${s.unit.padEnd(8)}`
    )
    const blob = new Blob([[...header, ...rows, '', `${purchaseSuggestions.length} product(s) below minimum.`].join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `purchase_suggestion_${yearStr}${monthStr !== 'all' ? '_' + monthStr : ''}.txt`
    a.click()
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const wsData = [
      ['Product', 'Current Balance', 'Minimum Required', 'Suggested Order Qty', 'Unit'],
      ...purchaseSuggestions.map(s => [s.name, s.current, s.minimum, s.toOrder, s.unit]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Suggestion')
    XLSX.writeFile(wb, `purchase_suggestion_${yearStr}${monthStr !== 'all' ? '_' + monthStr : ''}.xlsx`)
  }

  const adherenceStrokeColor = avgServiceLevel == null ? '#6b7280'
    : avgServiceLevel >= threshold ? primaryColor : '#ef4444'

  return (
    <div className="flex h-full flex-col gap-4">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory Control</h1>
          <p className="text-sm text-muted-foreground">Stock adherence, excess consumption and financial impact</p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">
              <div className="flex items-center pl-2.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Select
                value={String(selectedYear)}
                onValueChange={v => { setSelectedYear(Number(v)); setSelectedMonth('all') }}
              >
                <SelectTrigger className="h-8 w-[72px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">{selectedYear}</span>
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border" />
              <Select
                value={String(selectedMonth)}
                onValueChange={v => setSelectedMonth(v === 'all' ? 'all' : Number(v))}
              >
                <SelectTrigger className="h-8 w-[110px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                  <span className="flex-1 truncate text-left text-sm">
                    {selectedMonth === 'all' ? 'All' : MONTHS.find(m => m.value === selectedMonth)?.label ?? 'All'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {MONTHS.filter(m => availableMonths.includes(m.value)).map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Safety Threshold — compact, tooltip on hover */}
          <UITooltipProvider delay={300}>
            <UITooltip>
              <UITooltipTrigger render={<div className="flex flex-col gap-1 cursor-default" />}>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-left">SH</span>
                <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30 px-2 gap-0.5">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={thresholdInput}
                    onChange={e => setThresholdInput(e.target.value)}
                    onBlur={e => applyThreshold(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyThreshold(thresholdInput)}
                    className="w-8 bg-transparent text-sm text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </UITooltipTrigger>
              <UITooltipContent side="bottom" className="flex flex-col gap-1 max-w-[200px]">
                <p className="font-semibold">Safety Threshold</p>
                <p className="text-xs text-muted-foreground">Minimum acceptable stock adherence. Months below this level are flagged as critical.</p>
              </UITooltipContent>
            </UITooltip>
          </UITooltipProvider>

          {/* Purchase suggestion trigger */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-transparent select-none">btn</span>
            <Button
              variant="default"
              size="default"
              onClick={() => setShowPurchaseModal(true)}
              className="h-8 gap-2"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Purchase Suggestion
            </Button>
          </div>

        </div>
      </div>

      {/* Body — fills remaining height, no scroll */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">

        {/* KPIs */}
        <div className="grid shrink-0 grid-cols-3 gap-4">
          <KpiCard
            icon={Package}
            label="Stock Service Level"
            value={fmtPct(avgServiceLevel)}
            sub="Products not below minimum stock"
            valueClass={adherenceColor(avgServiceLevel, threshold)}
            info="Percentage of product types that maintained their stock above the minimum balance throughout the period. A high level means the team is keeping materials available; a low level signals replenishment failures or excessive consumption."
          />
          <KpiCard
            icon={TrendingDown}
            label="Excess Units"
            value={totalExcessUnits > 0 ? String(Math.round(totalExcessUnits)) : '0'}
            sub="Units withdrawn beyond limit"
            valueClass={totalExcessUnits > 0 ? 'text-red-500' : ''}
            info="Total number of units withdrawn beyond the established limit per lot model. Each unit here represents material taken after the allowed quota was already reached, directly impacting project cost and inventory control."
          />
          {/* Financial Impact — custom card */}
          <div className="rounded-xl border border-border bg-card/60 px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Financial Impact</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1 shrink-0">
                <p className={`text-3xl font-bold tracking-tight transition-[filter] ${blur}`}>{fmtUSD(totalExcessCost + totalNormalCost)}</p>
                <p className="text-xs text-muted-foreground">Total cost of withdrawals</p>
              </div>
              {totalExcessCost > 0 && (() => {
                const total = totalNormalCost + totalExcessCost
                const normalPct = total > 0 ? Math.round((totalNormalCost / total) * 100) : 0
                const excessPct = total > 0 ? Math.round((totalExcessCost / total) * 100) : 0
                return (
                  <div className="ml-auto flex items-stretch gap-4">
                    <div className="w-px self-stretch bg-border" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">Within limit</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{normalPct}%</span>
                          <span className={`text-xs font-semibold text-foreground transition-[filter] ${blur}`}>{fmtUSD(totalNormalCost)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-red-500">Excess</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-400">{excessPct}%</span>
                          <span className={`text-xs font-semibold text-red-500 transition-[filter] ${blur}`}>{fmtUSD(totalExcessCost)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Charts row — flex-[3] */}
        <div className="flex min-h-0 flex-[3] grid-cols-5 gap-4 grid">

          {/* Adherence trend — 3/5 */}
          <div className="col-span-3 flex min-h-0 flex-col rounded-xl border border-border bg-card/60 p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <p className="text-sm font-semibold text-foreground">Stock Adherence Trend</p>
              </div>
              <InfoBtn title="Stock Adherence Trend" description="Monthly percentage of product types that stayed above their minimum stock balance. The dashed red line marks your Safety Threshold. Dots below it signal critical months." />
            </div>
            <div className="min-h-0 flex-1 [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_text]:fill-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={adherenceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adherenceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={adherenceStrokeColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={adherenceStrokeColor} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.5} />
                  <Tooltip content={(props) => <AdherenceTooltip {...props} threshold={threshold} />} />
                  <Area
                    type="monotone"
                    dataKey="adherence"
                    stroke={adherenceStrokeColor}
                    strokeWidth={2}
                    fill="url(#adherenceGrad)"
                    connectNulls
                    dot={(props: any) => {
                      const { cx, cy, payload } = props
                      const below = payload.adherence != null && payload.adherence < threshold
                      return <circle key={`d-${cx}`} cx={cx} cy={cy} r={4} fill={below ? '#ef4444' : adherenceStrokeColor} strokeWidth={0} />
                    }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Violations list — 2/5 */}
          <div className="col-span-2 flex min-h-0 flex-col rounded-xl border border-border bg-card/60 p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-semibold text-foreground">Limit Violations</p>
              </div>
              <button
                onClick={() => setViolationsAsc(v => !v)}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={violationsAsc ? 'Sorted: ascending' : 'Sorted: descending'}
              >
                <ArrowUpDown className="h-3 w-3" />
                {violationsAsc ? 'Asc' : 'Desc'}
              </button>
            </div>
            {violations.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-xs text-muted-foreground">No violations for this period</p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {[...violations].sort((a, b) => violationsAsc ? a.totalExcess - b.totalExcess : b.totalExcess - a.totalExcess).map((v) => {
                  const isOpen = expandedLots.has(v.lot)
                  return (
                    <div key={v.lot} className="shrink-0 rounded-lg bg-muted/40 overflow-hidden">
                      {/* Header row — always visible */}
                      <button
                        onClick={() => toggleLot(v.lot)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{v.lot}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {v.products.length} product {v.products.length === 1 ? 'type' : 'types'} exceeded
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold text-red-500">
                            +{Math.round(v.totalExcess)} units over
                          </p>
                        </div>
                        {isOpen
                          ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      </button>

                      {/* Expanded product list */}
                      {isOpen && (
                        <div className="border-t border-border/50 px-3 py-2 flex flex-col gap-1">
                          {v.products.map(p => (
                            <div key={p.name} className="flex items-center justify-between gap-2">
                              <p className="truncate text-[11px] text-muted-foreground">{p.name}</p>
                              <span className="shrink-0 text-[11px] font-semibold text-red-500">+{p.excess}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Financial impact chart — flex-[2] */}
        <div className="flex min-h-0 flex-[2] flex-col rounded-xl border border-border bg-card/60 p-5">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart2 className="h-4 w-4" />
              <p className="text-sm font-semibold text-foreground">Monthly Financial Impact</p>
            </div>
            <InfoBtn title="Monthly Financial Impact" description="Cost of all material withdrawals per month, split between within-limit and excess. Excess bars represent spending that exceeded the established lot quota." />
          </div>
          <div className="min-h-0 flex-1 [&_text]:fill-muted-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={showFinancialData ? (v => `$${(v/1000).toFixed(0)}k`) : (() => '')} />
                <Tooltip content={(props) => <FinancialTooltip {...props} show={showFinancialData} />} cursor={{ fill: 'hsl(var(--foreground))', fillOpacity: 0.12 }} />
                <Bar dataKey="normal" stackId="a" fill={primaryColor} opacity={0.85} radius={[0,0,0,0]} />
                <Bar dataKey="excess" stackId="a" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex shrink-0 items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: primaryColor }} />Within limit</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />Excess withdrawal</span>
          </div>
        </div>

      </div>

      {/* Purchase Suggestion Modal */}
      <Dialog open={showPurchaseModal} onOpenChange={setShowPurchaseModal}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              Purchase Suggestion
            </DialogTitle>
          </DialogHeader>

          {/* Notice */}
          <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
            This list reflects stock levels observed in the selected period ({periodLabel}). It does not account for pending orders or work in progress. It simply shows the quantity needed to restore each product to its minimum required balance.
          </p>

          {/* Product list */}
          {purchaseSuggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <PackageCheck className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">All good — no purchases needed</p>
                <p className="mt-1 text-xs text-muted-foreground">Every product in the selected period is at or above its minimum required balance.</p>
              </div>
            </div>
          ) : (
            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border">
              {/* Table header */}
              <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border bg-muted/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                <span>Product</span>
                <span className="text-right">Current</span>
                <span className="text-right">Minimum</span>
                <span className="text-right">To Order</span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border">
                {purchaseSuggestions.map((s) => (
                  <div key={s.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-right text-muted-foreground tabular-nums">{s.current.toFixed(1)}{s.unit ? ` ${s.unit}` : ''}</span>
                    <span className="text-right text-muted-foreground tabular-nums">{s.minimum.toFixed(1)}{s.unit ? ` ${s.unit}` : ''}</span>
                    <span className="text-right font-semibold text-red-500 tabular-nums">+{s.toOrder}{s.unit ? ` ${s.unit}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={exportTxt} disabled={purchaseSuggestions.length === 0} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Export TXT
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={purchaseSuggestions.length === 0} className="gap-1.5">
              <ExcelIcon className="h-3.5 w-3.5" />
              Export Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
