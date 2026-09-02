'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { BarChart2, Clock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Permit } from '@/services/permit.service'
import {
  DAY_WIDTH, MONTHS_SHORT, SUB_H, TIMELINE_H, LABEL_H, TOP_PAD,
  type DateField,
} from '../types'
import { stemColorForDay } from '../lib'
import { StatusBadge } from './status-badge'

// ─── PendingPill ──────────────────────────────────────────────────────────────

function PendingPill({ permits }: { permits: Permit[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative">
      <button
        ref={ref}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 transition-colors hover:bg-muted"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
        <span className="text-[10px] leading-none text-muted-foreground">
          {permits.length} pending
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[200] mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Awaiting dates</p>
          </div>
          <div className="max-h-48 divide-y divide-border/50 overflow-y-auto">
            {permits.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {p.lotAddress || p.jobsite || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PermitChartProps {
  permits:    Permit[]
  dateField:  DateField
  primaryHex: string
  isDark:     boolean
}

// ─── TimelineChart ────────────────────────────────────────────────────────────

export function PermitChart({ permits, dateField, primaryHex, isDark }: PermitChartProps) {
  // scrollH: measured by ResizeObserver on the scroll area — drives timelineH
  const [scrollH, setScrollH] = useState(0)
  const scrollRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScrollH(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // timelineH: usable chart body minus the subheader row
  const timelineH = scrollH > SUB_H + 60 ? scrollH - SUB_H : TIMELINE_H
  const stemMaxH  = timelineH - LABEL_H - TOP_PAD - 28

  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragScroll = useRef(0)
  const didDrag    = useRef(false)

  const [popover,      setPopover]      = useState<{ day: string; x: number; y: number } | null>(null)
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null)

  const TODAY = useMemo(() => new Date().toISOString().substring(0, 10), [])

  const grouped = useMemo(() => {
    const map = new Map<string, Permit[]>()
    permits.forEach(p => {
      const raw = p[dateField] as string | null
      if (!raw) return
      const day = raw.substring(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)?.push(p)
    })
    return map
  }, [permits, dateField])

  // Only days that have data — uniform spacing, no empty slots
  const days = useMemo(() => {
    if (grouped.size === 0) return []
    return Array.from(grouped.keys()).sort()
  }, [grouped])

  const todayIdx  = days.indexOf(TODAY)
  const maxCount  = useMemo(() => Math.max(...Array.from(grouped.values()).map(v => v.length), 1), [grouped])
  const baselineY = timelineH - LABEL_H

  // Avg delivery days per month (Issued permits only, keyed by YYYY-MM of dateField)
  const avgByMonthKey = useMemo(() => {
    const acc = new Map<string, { sum: number; count: number }>()
    permits.forEach(p => {
      if (p.situacao !== 'Issued' || !p.solicitacao || !p.emissao) return
      const dateVal = p[dateField] as string | null
      if (!dateVal) return
      const key  = dateVal.substring(0, 7)
      const diff = Math.round((new Date(p.emissao).getTime() - new Date(p.solicitacao).getTime()) / 86400000)
      if (diff <= 0) return
      const cur = acc.get(key) ?? { sum: 0, count: 0 }
      acc.set(key, { sum: cur.sum + diff, count: cur.count + 1 })
    })
    const result = new Map<string, number>()
    acc.forEach((v, k) => result.set(k, Math.round(v.sum / v.count)))
    return result
  }, [permits, dateField])

  // Month sections for footer + subheader
  const monthSections = useMemo(() => {
    if (days.length === 0) return []
    const sections: { label: string; startX: number; endX: number; count: number; byStatus: Record<string, number> }[] = []
    let currentMonth = ''
    days.forEach((day, i) => {
      const month = day.substring(0, 7)
      if (month !== currentMonth) {
        if (sections.length > 0) sections[sections.length - 1].endX = i * DAY_WIDTH
        const d = new Date(`${day}T00:00:00Z`)
        sections.push({ label: `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`, startX: i * DAY_WIDTH, endX: 0, count: 0, byStatus: {} })
        currentMonth = month
      }
      const sec = sections[sections.length - 1]
      ;(grouped.get(day) ?? []).forEach(p => {
        const sit = p.situacao || 'Other'
        sec.byStatus[sit] = (sec.byStatus[sit] ?? 0) + 1
        sec.count++
      })
    })
    if (sections.length > 0) sections[sections.length - 1].endX = days.length * DAY_WIDTH
    return sections
  }, [days, grouped])

  useEffect(() => {
    if (!scrollRef.current || !days.length) return
    const idx    = todayIdx >= 0 ? todayIdx : days.length - 1
    const target = idx * DAY_WIDTH - scrollRef.current.clientWidth / 2 + DAY_WIDTH / 2
    scrollRef.current.scrollLeft = Math.max(0, target)
  }, [days, todayIdx])

  useEffect(() => {
    if (!popover) return
    function h() { setPopover(null) }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [popover])

  // Close popover when grouped changes (e.g. filter changed while popover was open)
  useEffect(() => { setPopover(null) }, [])

  function onMouseDown(e: React.MouseEvent) {
    isDragging.current = true
    didDrag.current    = false
    dragStartX.current = e.clientX
    dragScroll.current = scrollRef.current?.scrollLeft ?? 0
    e.preventDefault()
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current || !scrollRef.current) return
    const dx = e.clientX - dragStartX.current
    if (Math.abs(dx) > 4) didDrag.current = true
    scrollRef.current.scrollLeft = dragScroll.current - dx
  }
  function onMouseUp() { isDragging.current = false }

  function handleStemClick(e: React.MouseEvent, day: string) {
    if (didDrag.current) return
    e.stopPropagation()
    if (popover?.day === day) { setPopover(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({ day, x: rect.left + rect.width / 2, y: rect.top })
  }

  const totalW = Math.max(days.length * DAY_WIDTH, 100)
  const pendingOnly = days.length === 0 && permits.every(p => p.situacao === 'Pending')

  const SIT_HEX_SUB = (sit: string): string => {
    if (sit === 'Not Applied') return isDark ? '#fca5a5' : '#ef4444'
    if (sit === 'Applied')     return isDark ? '#fde047' : '#eab308'
    if (sit === 'Issued')      return primaryHex
    if (sit === 'Pending')     return isDark ? '#9ca3af' : '#6b7280'
    return '#6b7280'
  }

  const ORDER = ['Pending', 'Not Applied', 'Applied', 'Issued']

  const chartContent = days.length === 0
    ? (
      <div className="flex h-full flex-col items-center justify-center gap-1.5">
        <p className="text-sm text-muted-foreground">
          {pendingOnly ? 'All permits are pending — no dates to display.' : 'No permits with dates for the selected field.'}
        </p>
        {pendingOnly && (
          <p className="text-xs text-muted-foreground/60">Pending permits have no request date and are not shown on the timeline.</p>
        )}
      </div>
    )
    : (
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing select-none [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onScroll={() => setPopover(null)}
      >
        <div className="relative h-full" style={{ width: totalW, minWidth: '100%' }}>

          {/* Subheader — permit count + avg delivery per month */}
          {monthSections.map(sec => {
            const w        = sec.endX - sec.startX
            const showDots = w >= 240
            const showAvg  = w >= 140
            const sitKeys  = Object.keys(sec.byStatus)
            const multi    = sitKeys.length > 1
            const monthKey = days[Math.round(sec.startX / DAY_WIDTH)]?.substring(0, 7)
            const avgDays  = monthKey ? avgByMonthKey.get(monthKey) : undefined
            const issuedInMonth = avgDays != null
              ? permits.filter(p => p.situacao === 'Issued' && p.solicitacao && p.emissao && (p[dateField] as string | null)?.substring(0, 7) === monthKey)
              : []
            const sorted = ORDER.filter(s => sec.byStatus[s]).concat(sitKeys.filter(s => !ORDER.includes(s)))
            return (
              <div
                key={`sub-${sec.label}`}
                className="absolute z-[6] flex items-center justify-evenly overflow-hidden"
                style={{ left: sec.startX, width: w, top: 0, height: SUB_H }}
              >
                {/* Count */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-default text-xs font-semibold leading-none">
                      {sec.count} permit{sec.count !== 1 ? 's' : ''}
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {sec.count} permit{sec.count !== 1 ? 's' : ''} in {sec.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Situation dots */}
                {showDots && multi && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">
                        <div className="flex items-center gap-2">
                          {sorted.map(sit => (
                            <span key={sit} className="flex items-center gap-1 leading-none">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SIT_HEX_SUB(sit) }} />
                              <span className="text-[10px] text-muted-foreground">{sec.byStatus[sit]}</span>
                            </span>
                          ))}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <div className="flex flex-col gap-1">
                          {sorted.map(sit => (
                            <span key={sit} className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SIT_HEX_SUB(sit) }} />
                              <span>{sit}: {sec.byStatus[sit]}</span>
                            </span>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Avg delivery */}
                {showAvg && avgDays != null && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">
                        <span className="flex items-center gap-1 leading-none">
                          <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                          <span className="text-[10px] text-muted-foreground">avg <span className="font-semibold text-foreground">{avgDays}d</span></span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Avg delivery time across {issuedInMonth.length} issued permit{issuedInMonth.length !== 1 ? 's' : ''} in {sec.label}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )
          })}

          {/* Sub-header / body divider */}
          <div className="absolute left-0 right-0 h-px bg-border" style={{ top: SUB_H }} />

          {/* Month separators — full height including sub-header */}
          {days.map((day, i) => {
            if (i === 0) return null
            if (days[i - 1].substring(0, 7) === day.substring(0, 7)) return null
            return (
              <div
                key={`sep-${day}`}
                className="absolute pointer-events-none bg-border"
                style={{ left: i * DAY_WIDTH, width: 1, top: 0, height: timelineH + SUB_H }}
              />
            )
          })}

          {/* Month hover zones */}
          {monthSections.map(sec => (
            <div
              key={`hz-${sec.label}`}
              className="absolute z-[5]"
              style={{ left: sec.startX, width: sec.endX - sec.startX, top: 0, height: timelineH + SUB_H }}
              onMouseEnter={() => setHoveredMonth(sec.label)}
              onMouseLeave={() => setHoveredMonth(null)}
            />
          ))}

          {/* Month hover border overlay */}
          {hoveredMonth && (() => {
            const sec = monthSections.find(s => s.label === hoveredMonth)
            if (!sec) return null
            return (
              <div
                className="absolute pointer-events-none z-[15] border border-primary/35"
                style={{ left: sec.startX, width: sec.endX - sec.startX, top: 0, height: timelineH + SUB_H }}
              />
            )
          })()}

          {/* Grid horizontal lines — body only */}
          <div
            className="absolute pointer-events-none text-foreground/[0.06]"
            style={{
              left: 0, top: SUB_H, width: '100%', height: baselineY,
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, currentColor 39px, currentColor 40px)',
              backgroundPosition: '0 20px',
            }}
          />

          {/* Grid vertical lines — centered on each pin, body only */}
          {days.map((day, i) => (
            <div
              key={`grid-v-${day}`}
              className="absolute pointer-events-none bg-foreground/[0.10]"
              style={{ left: i * DAY_WIDTH + DAY_WIDTH / 2, width: 1, top: SUB_H, height: baselineY }}
            />
          ))}

          {/* Baseline */}
          <div className="absolute left-0 right-0 h-px bg-border" style={{ top: SUB_H + baselineY }} />

          {/* Today line */}
          {todayIdx >= 0 && (
            <div
              className="absolute pointer-events-none"
              style={{ left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2 - 1, width: 2, top: SUB_H, bottom: 0, background: 'hsl(var(--primary) / 0.2)' }}
            >
              <span className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-card/90 px-1 py-px text-[9px] font-bold text-primary backdrop-blur-sm">
                TODAY
              </span>
            </div>
          )}

          {/* Footer top half — day number per column */}
          {days.map((day, i) => {
            const d = new Date(`${day}T00:00:00Z`)
            return (
              <div
                key={`footer-day-${day}`}
                className="absolute flex items-center justify-center pointer-events-none"
                style={{ left: i * DAY_WIDTH, width: DAY_WIDTH, top: SUB_H + baselineY, height: LABEL_H / 2 }}
              >
                <span className="text-[11px] font-semibold leading-none" style={{ color: stemColorForDay(grouped.get(day)!, primaryHex, isDark) }}>
                  {d.getUTCDate()}
                </span>
              </div>
            )
          })}

          {/* Footer bottom half — month label centered over its full span */}
          {monthSections.map(sec => (
            <div
              key={`footer-month-${sec.label}`}
              className="absolute flex items-center justify-center pointer-events-none overflow-hidden"
              style={{ left: sec.startX, width: sec.endX - sec.startX, top: SUB_H + baselineY + LABEL_H / 2 - 5, height: LABEL_H / 2 }}
            >
              <span className="text-[9px] leading-none text-muted-foreground">{sec.label}</span>
            </div>
          ))}

          {/* Days — stems + bubbles */}
          {days.map((day, i) => {
            const dayPermits = grouped.get(day)!
            const count  = dayPermits.length
            const stemH  = Math.max(20, (count / maxCount) * stemMaxH)
            const hex    = stemColorForDay(dayPermits, primaryHex, isDark)
            const x      = i * DAY_WIDTH + DAY_WIDTH / 2

            return (
              <div key={day}>
                <div
                  className="absolute pointer-events-none rounded-t-sm"
                  style={{ left: x - 2, top: SUB_H + baselineY - stemH, width: 4, height: stemH, background: hex, opacity: 0.45 }}
                />
                <button
                  className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-background shadow-md transition-transform hover:scale-110 active:scale-95"
                  style={{ left: x - 12, top: SUB_H + baselineY - stemH - 12, background: hex }}
                  onClick={e => handleStemClick(e, day)}
                >
                  {count}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )

  // Avg delivery across all issued (for chart header)
  const allIssued = permits.filter(p => p.situacao === 'Issued' && p.solicitacao && p.emissao)
  const avgAll    = allIssued.length > 0
    ? Math.round(allIssued.reduce((sum, p) => sum + (new Date(p.emissao!).getTime() - new Date(p.solicitacao!).getTime()) / 86400000, 0) / allIssued.length)
    : null

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border">
        {/* Title */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-4 py-2.5">
          <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Permit Timeline</span>
          <div className="ml-auto flex items-center gap-2">
            {(() => {
              const pending = permits.filter(p => p.situacao === 'Pending')
              if (pending.length === 0) return null
              return (
                <>
                  <PendingPill permits={pending} />
                  <div className="h-3 w-px bg-border/60" />
                </>
              )
            })()}
            <span className="text-[11px] text-muted-foreground">
              {permits.length} permit{permits.length !== 1 ? 's' : ''}
            </span>
            {avgAll != null && (
              <>
                <div className="h-3 w-px bg-border/60" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex cursor-default items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      avg <span className="font-semibold text-foreground">{avgAll}d</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Average delivery time across {allIssued.length} issued permit{allIssued.length !== 1 ? 's' : ''}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        </div>
        <div className="relative flex flex-1 flex-col overflow-hidden bg-card">
          {chartContent}
          {days.length > 0 && (
            <div
              className="pointer-events-none absolute left-2 z-20 flex flex-row items-center gap-3 rounded-lg border border-border/60 bg-card/85 px-2.5 py-1.5 backdrop-blur-sm"
              style={{ top: SUB_H + 8 }}
            >
              {([
                { label: 'Not Applied', color: isDark ? '#fca5a5' : '#ef4444' },
                { label: 'Applied',     color: isDark ? '#fde047' : '#eab308' },
                { label: 'Issued',      color: primaryHex                     },
              ] as { label: string; color: string }[]).map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Popover */}
      {popover && (() => {
        const perms = grouped.get(popover.day)
        if (!perms) return null
        const d     = new Date(`${popover.day}T00:00:00Z`)
        const title = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
        const safeX = typeof window !== 'undefined'
          ? Math.max(8, Math.min(popover.x - 130, window.innerWidth - 276))
          : popover.x - 130
        const estimatedH = 52 + Math.min(perms.length * 32, 208)
        const safeY = typeof window !== 'undefined'
          ? Math.max(8, popover.y - estimatedH - 10)
          : popover.y - estimatedH - 10
        return (
          <div
            className="fixed z-[200] w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
            style={{ left: safeX, top: safeY }}
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-semibold">{title}</p>
              <p className="text-[11px] text-muted-foreground">{perms.length} permit{perms.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="max-h-52 divide-y divide-border/50 overflow-y-auto">
              {perms.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <StatusBadge situacao={p.situacao || 'Unknown'} />
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {p.lotAddress || p.jobsite || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </>
  )
}
