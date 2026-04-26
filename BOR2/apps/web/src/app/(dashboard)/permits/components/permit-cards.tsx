'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import {
  AlertCircle, ArrowUpDown, CalendarCheck, CalendarClock, CalendarDays,
  CheckCircle2, CircleArrowUp, CircleDashed,
  Clock, Database, FileText, GalleryHorizontal, ListOrdered, MapPin,
  Search, X,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Permit } from '@/services/permit.service'
import { SIT_STYLE } from '../types'
import { sitTier, calcDays, dateConflicts, fileLabel, fmtShort } from '../lib'
import { PermitDetailModal } from './permit-detail-modal'

function buildSitHex(primaryHex: string, isDark: boolean): Record<string, string> {
  return {
    'Pending':     isDark ? '#9ca3af' : '#6b7280',
    'Not Applied': isDark ? '#fca5a5' : '#ef4444',
    'Applied':     isDark ? '#fde047' : '#eab308',
    'Issued':      primaryHex,
  }
}

const SIT_ICON: Record<string, React.ReactNode> = {
  'Pending':     <CircleDashed  className="h-3.5 w-3.5 shrink-0" />,
  'Not Applied': <Clock         className="h-3.5 w-3.5 shrink-0" />,
  'Applied':     <CircleArrowUp className="h-3.5 w-3.5 shrink-0" />,
  'Issued':      <CheckCircle2  className="h-3.5 w-3.5 shrink-0" />,
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PermitCardsProps {
  permits:    Permit[]
  primaryHex: string
  situation:  string
}

// ─── Layout constants (card-first sizing) ─────────────────────────────────────
// Card sections sum to CARD_H; carousel = CARD_H + 2 × CAROUSEL_PAD

const CARD_H        = 208   // px  — header(40) + identity(56) + dates(80) + footer(32)
const CAROUSEL_PAD  = 12    // px  — p-3 on each side
const CAROUSEL_H    = CARD_H + CAROUSEL_PAD * 2   // 280

// ─── PermitCards (was PermitCarousel) ────────────────────────────────────────

export function PermitCards({ permits, primaryHex, situation }: PermitCardsProps) {
  const [selected,    setSelected]    = useState<Permit | null>(null)
  const [hovered,     setHovered]     = useState<string | null>(null)
  const [showIssued,  setShowIssued]  = useState(true)
  const [situOrder,   setSituOrder]   = useState(['Pending', 'Not Applied', 'Applied', 'Issued'])
  const [draggedSit,  setDraggedSit]  = useState<string | null>(null)
  const [dragOverSit, setDragOverSit] = useState<string | null>(null)
  const [sortTime,    setSortTime]    = useState<'asc' | 'desc'>('asc')
  const [searchText,  setSearchText]  = useState('')
  const [sortOpen,    setSortOpen]    = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ x: 0, scroll: 0, active: false, moved: false })

  // When top-level filter is Issued, force showIssued on
  const issuedForced = situation === 'Issued'
  useEffect(() => { if (issuedForced) setShowIssued(true) }, [issuedForced])

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const SIT_HEX = buildSitHex(primaryHex, isDark)

  const searched = useMemo(() => {
    if (!searchText.trim()) return permits
    const q = searchText.toLowerCase()
    return permits.filter(p =>
      p.lotAddress?.toLowerCase().includes(q) || p.jobsite?.toLowerCase().includes(q)
    )
  }, [permits, searchText])

  const displayData = useMemo(() => {
    const base    = showIssued ? searched : searched.filter(p => p.situacao !== 'Issued')
    const ordered = situOrder.flatMap(sit => {
      const group = base.filter(p => p.situacao === sit)
      return [...group].sort((a, b) => {
        const diff = calcDays(a) - calcDays(b)
        return sortTime === 'asc' ? diff : -diff
      })
    })
    const extras = base.filter(p => !situOrder.includes(p.situacao))
    return [...ordered, ...extras]
  }, [searched, showIssued, situOrder, sortTime])

  // Carousel mouse drag
  const onCarouselDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, scroll: carouselRef.current?.scrollLeft ?? 0, active: true, moved: false }
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!drag.current.active) return
      if (Math.abs(e.clientX - drag.current.x) > 4) drag.current.moved = true
      if (carouselRef.current) carouselRef.current.scrollLeft = drag.current.scroll + (drag.current.x - e.clientX)
    }
    function onUp() { drag.current.active = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Situation chip drag-to-reorder
  function sitDragStart(e: React.DragEvent, sit: string) { setDraggedSit(sit); e.dataTransfer.effectAllowed = 'move' }
  function sitDragOver(e: React.DragEvent, sit: string)  { e.preventDefault(); setDragOverSit(sit) }
  function sitDrop(e: React.DragEvent, target: string) {
    e.preventDefault(); setDragOverSit(null)
    if (!draggedSit || draggedSit === target) { setDraggedSit(null); return }
    setSituOrder(prev => {
      const arr = [...prev], fi = arr.indexOf(draggedSit), ti = arr.indexOf(target)
      ;[arr[fi], arr[ti]] = [arr[ti], arr[fi]]
      return arr
    })
    setDraggedSit(null)
  }

  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card/60">

      {/* Controls bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <GalleryHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Permit Cards</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search…"
              className="h-7 w-40 rounded-md border border-input bg-transparent pl-7 pr-6 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Sort by situation — collapsed behind a button */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(v => !v)}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors dark:bg-input/30 ${
                sortOpen
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ListOrdered className="h-3 w-3" />
              <span>Order</span>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover p-3 shadow-xl">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Drag to reorder</p>
                  <div className="flex gap-1.5">
                    {situOrder.map(sit => (
                      <div
                        key={sit}
                        draggable
                        onDragStart={e => sitDragStart(e, sit)}
                        onDragOver={e => sitDragOver(e, sit)}
                        onDrop={e => sitDrop(e, sit)}
                        onDragEnd={() => { setDraggedSit(null); setDragOverSit(null) }}
                        className={`flex cursor-grab items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all select-none whitespace-nowrap ${
                          draggedSit === sit
                            ? 'border-primary bg-primary text-primary-foreground'
                            : dragOverSit === sit
                            ? 'border-primary/40 bg-primary/5 text-foreground'
                            : 'border-border bg-card text-foreground'
                        } ${draggedSit && draggedSit !== sit ? 'opacity-40' : ''}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: SIT_HEX[sit] ?? '#6b7280' }} />
                        {sit}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sort by processing time */}
          <button
            onClick={() => setSortTime(p => p === 'asc' ? 'desc' : 'asc')}
            className="flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:bg-input/30"
            title={sortTime === 'asc' ? 'Sorted: ascending' : 'Sorted: descending'}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortTime === 'asc' ? 'Asc' : 'Desc'}
          </button>

          {/* Show Issued toggle */}
          <label className={`inline-flex h-7 items-center gap-2 select-none ${issuedForced ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <span className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={showIssued}
                disabled={issuedForced}
                onChange={e => { if (!issuedForced) setShowIssued(e.target.checked) }}
              />
              <div className="h-4 w-7 rounded-full border border-border bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary" />
              <div className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-background shadow transition-transform peer-checked:translate-x-3" />
            </span>
            <span className="text-[11px] text-muted-foreground">Issued</span>
          </label>

        </div>
      </div>

      {/* Carousel */}
      {displayData.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm italic text-muted-foreground"
          style={{ height: CAROUSEL_H }}
        >
          No permits for the selected filters.
        </div>
      ) : (
        <div
          ref={carouselRef}
          className="flex gap-3 overflow-x-auto overflow-y-hidden p-3 cursor-grab active:cursor-grabbing select-none [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
          style={{ height: CAROUSEL_H }}
          onMouseDown={onCarouselDown}
        >
          {displayData.map(permit => {
            const tier   = sitTier(permit.situacao)
            const st     = SIT_STYLE[tier]
            const hex    = SIT_HEX[permit.situacao] ?? '#6b7280'
            const days   = calcDays(permit)
            const isHov  = hovered === permit.id
            return (
              <div
                key={permit.id}
                className={`flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border bg-card transition-all duration-150 cursor-pointer ${
                  isHov ? 'shadow-lg border-border' : 'shadow-sm border-border/50'
                }`}
                style={{ height: CARD_H }}
                onMouseEnter={() => setHovered(permit.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => { if (!drag.current.moved) setSelected(permit) }}
              >
                {/* Card header — fixed 40 px */}
                {(() => {
                  const conflicts = dateConflicts(permit)
                  return (
                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/60 px-4">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${st.text}`}>
                        {SIT_ICON[permit.situacao] ?? <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />}
                        {permit.situacao || 'Unknown'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {conflicts.length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="flex cursor-default items-center text-amber-500 dark:text-amber-400">
                                <AlertCircle className="h-3.5 w-3.5" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
                                Dates appear incorrect, please review
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {permit.arquivo && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger render={
                                <a
                                  href={permit.arquivo} target="_blank" rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  onClick={e => e.stopPropagation()}
                                />
                              }>
                                <FileText className="h-3.5 w-3.5" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[180px] truncate">
                                {fileLabel(permit.arquivo)}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Body — fills remaining card height */}
                <div className="flex flex-1 flex-col divide-y divide-border/40 overflow-hidden">

                  {/* Identity — fixed 56 px */}
                  <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <p className="truncate text-xs text-muted-foreground leading-tight">{permit.jobsite || '—'}</p>
                      {permit.lotAddress && (
                        <p className="truncate text-sm font-semibold">{permit.lotAddress}</p>
                      )}
                    </div>
                  </div>

                  {/* Dates — flex-1: takes all space between identity and footer */}
                  <div className="flex flex-1 flex-col justify-center gap-2 overflow-hidden px-4">
                    {([
                      { icon: CalendarDays,  label: 'Request',     value: fmtShort(permit.solicitacao) },
                      { icon: CalendarClock, label: 'Application', value: fmtShort(permit.aplicacao)   },
                      { icon: CalendarCheck, label: 'Issue',       value: fmtShort(permit.emissao)     },
                    ] as { icon: React.ElementType; label: string; value: string | null }[]).map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 shrink-0 ${value ? 'text-muted-foreground' : 'text-muted-foreground/25'}`} />
                        <span className="flex-1 text-[11px] text-muted-foreground">{label}</span>
                        <span className={`text-[11px] font-semibold tabular-nums ${value ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                          {value ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer — fixed 32 px */}
                  <div className="flex h-8 shrink-0 items-center justify-center gap-1.5 px-4">
                    {permit.solicitacao && permit.situacao !== 'Pending'
                      ? (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: hex }} />
                          <span className="text-[10px] font-medium" style={{ color: hex }}>
                            {permit.situacao === 'Issued' ? `Processed in ${days}d` : `${days}d in progress`}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/25" />
                          <span className="text-[10px] text-muted-foreground/30">No timeline yet</span>
                        </div>
                      )
                    }
                    {permit.observacao && (
                      <div className="flex items-start gap-2">
                        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <p className="line-clamp-2 text-[10px] italic text-muted-foreground leading-tight">
                          {permit.observacao}
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <PermitDetailModal
          permit={selected}
          primaryHex={primaryHex}
          isDark={isDark}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
