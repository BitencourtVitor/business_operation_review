'use client'

import { createPortal } from 'react-dom'
import {
  AlertCircle, Building2, CalendarCheck, CalendarClock, CalendarDays,
  CheckCircle2, CircleArrowUp, CircleDashed,
  Clock, Database, FileText, MapPin, X,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Permit } from '@/services/permit.service'
import { SIT_STYLE } from '../types'
import { sitTier, fmtDate, dateConflicts, calcDays, fileLabel } from '../lib'

// ─── SIT_HEX helper (same values as in permit-cards.tsx, needs primaryHex) ────

function buildSitHex(primaryHex: string, isDark: boolean): Record<string, string> {
  return {
    'Pending':     isDark ? '#9ca3af' : '#6b7280',
    'Not Applied': isDark ? '#fca5a5' : '#ef4444',
    'Applied':     isDark ? '#fde047' : '#eab308',
    'Issued':      primaryHex,
  }
}

// ─── SIT_ICON ─────────────────────────────────────────────────────────────────

const SIT_ICON: Record<string, React.ReactNode> = {
  'Pending':     <CircleDashed  className="h-3.5 w-3.5 shrink-0" />,
  'Not Applied': <Clock         className="h-3.5 w-3.5 shrink-0" />,
  'Applied':     <CircleArrowUp className="h-3.5 w-3.5 shrink-0" />,
  'Issued':      <CheckCircle2  className="h-3.5 w-3.5 shrink-0" />,
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PermitDetailModalProps {
  permit:     Permit
  primaryHex: string
  isDark:     boolean
  onClose:    () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PermitDetailModal({ permit: selected, primaryHex, isDark, onClose }: PermitDetailModalProps) {
  const SIT_HEX = buildSitHex(primaryHex, isDark)

  function daysBetween(a: string | null, b: string | null): number | null {
    if (!a || !b) return null
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
    return diff > 0 ? diff : null
  }

  const reqColor  = SIT_HEX['Not Applied']
  const appColor  = SIT_HEX['Applied']
  const issColor  = primaryHex

  const daysReqApp = daysBetween(selected.solicitacao, selected.aplicacao)
  const daysAppIss = daysBetween(selected.aplicacao,   selected.emissao)
  const conflicts  = dateConflicts(selected)

  const nodes = [
    { label: 'Request',     icon: CalendarDays,  date: selected.solicitacao, color: reqColor },
    { label: 'Application', icon: CalendarClock, date: selected.aplicacao,   color: appColor },
    { label: 'Issue',       icon: CalendarCheck, date: selected.emissao,     color: issColor },
  ] as { label: string; icon: React.ElementType; date: string | null; color: string }[]

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — situation + close */}
        <div className="flex shrink-0 items-center justify-between px-6 py-4">
          <span className={`flex items-center gap-2 text-sm font-semibold ${SIT_STYLE[sitTier(selected.situacao ?? '')].text}`}>
            {SIT_ICON[selected.situacao ?? ''] ?? null}
            {selected.situacao || 'Unknown'}
          </span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Identity hero */}
        <div className="flex shrink-0 items-start gap-3 border-y border-border bg-muted/30 px-6 py-5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{selected.lotAddress || selected.jobsite || '—'}</p>
            {selected.lotAddress && selected.jobsite && (
              <p className="mt-0.5 text-sm text-muted-foreground">{selected.jobsite}</p>
            )}
          </div>
        </div>

        {/* Info rows */}
        <div className="flex flex-1 flex-col gap-0 overflow-y-auto divide-y divide-border/40 px-6 py-1">
          {selected.client && (
            <div className="flex items-center gap-3 py-3">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <span className="flex-1 text-sm text-muted-foreground">Client</span>
              <span className="text-sm font-medium">{selected.client}</span>
            </div>
          )}
          {selected.solicitacao && selected.situacao !== 'Pending' && (
            <div className="flex items-center gap-3 py-3">
              <Clock className="h-4 w-4 shrink-0" style={{ color: SIT_HEX[selected.situacao ?? ''] }} />
              <span className="flex-1 text-sm text-muted-foreground">Processing Time</span>
              <span className="text-sm font-semibold" style={{ color: SIT_HEX[selected.situacao ?? ''] }}>
                {selected.situacao === 'Issued' ? `${calcDays(selected)}d` : `${calcDays(selected)}d in progress`}
              </span>
            </div>
          )}
          {selected.observacao && (
            <div className="flex items-start gap-3 py-3">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
              <p className="text-sm italic leading-relaxed text-muted-foreground">{selected.observacao}</p>
            </div>
          )}
          {selected.arquivo && (
            <div className="flex items-center gap-3 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <span className="shrink-0 text-sm text-muted-foreground">Document</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={
                    <a
                      href={selected.arquivo} target="_blank" rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
                      onClick={e => e.stopPropagation()}
                    />
                  }>
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[220px] truncate">{fileLabel(selected.arquivo)}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="max-w-xs break-all text-xs">
                    {selected.arquivo}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Date timeline */}
        <div className="shrink-0 border-t border-border px-6 pb-6 pt-5">
          <p className="mb-6 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</p>

          <div className="relative flex items-start justify-between">

            {/* Base line */}
            <div className="absolute left-5 right-5 top-5 h-px bg-border" />

            {/* Segment 1 → 2: gradient req → app */}
            <div
              className="absolute left-5 top-5 h-px transition-opacity"
              style={{
                width: 'calc(50% - 1.25rem)',
                background: selected.aplicacao
                  ? `linear-gradient(to right, ${reqColor}, ${appColor})`
                  : 'transparent',
              }}
            />
            {/* Day label above seg 1→2 */}
            {daysReqApp && (
              <div
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: 'calc(25% + 0.625rem)' }}
              >
                <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                  {daysReqApp}d
                </span>
              </div>
            )}

            {/* Segment 2 → 3: gradient app → iss */}
            <div
              className="absolute right-5 top-5 h-px transition-opacity"
              style={{
                width: 'calc(50% - 1.25rem)',
                background: selected.emissao
                  ? `linear-gradient(to right, ${appColor}, ${issColor})`
                  : 'transparent',
              }}
            />
            {/* Day label above seg 2→3 */}
            {daysAppIss && (
              <div
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: 'calc(75% - 0.625rem)' }}
              >
                <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                  {daysAppIss}d
                </span>
              </div>
            )}

            {nodes.map(({ label, icon: Icon, date, color }) => (
              <div key={label} className="relative z-10 flex flex-col items-center gap-2">
                <div
                  className={
                    date
                      ? 'flex h-10 w-10 items-center justify-center rounded-full border-2 bg-popover transition-colors'
                      : 'flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-popover transition-colors'
                  }
                  style={date ? { borderColor: color } : undefined}
                >
                  <Icon
                    className={date ? 'h-4 w-4' : 'h-4 w-4 text-muted-foreground/30'}
                    style={date ? { color } : undefined}
                  />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className={`text-xs font-medium tabular-nums ${date ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                  {fmtDate(date) ?? '—'}
                </span>
              </div>
            ))}

          </div>

          {/* Date conflict warning */}
          {conflicts.length > 0 && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 dark:border-amber-400/15 dark:bg-amber-400/5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Dates appear incorrect</p>
                <ul className="mt-1 space-y-0.5">
                  {conflicts.map(c => (
                    <li key={c} className="text-[11px] text-amber-600/80 dark:text-amber-400/80">· {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
