// ─── Shared helpers for the Permits feature ───────────────────────────────────

import type { Permit } from '@/services/permit.service'
import { MONTHS_SHORT, type SitTier } from './types'

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getDateStr(s: string | null, part: 'year' | 'month' | 'day'): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  if (part === 'year')  return String(d.getUTCFullYear())
  if (part === 'month') return String(d.getUTCMonth() + 1).padStart(2, '0')
  return d.toISOString().substring(0, 10)
}

export function fmtShort(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

export function fmtDate(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// ─── Situation helpers ────────────────────────────────────────────────────────

export function sitTier(s: string): SitTier {
  if (s === 'Issued')      return 'issued'
  if (s === 'Applied')     return 'applied'
  if (s === 'Not Applied') return 'not-applied'
  if (s === 'Pending')     return 'pending'
  return 'other'
}

/** Situacao always derived from dates — never trust the stored value (handles stale/synced records). */
export function calcSit(p: Permit): string {
  if (p.emissao)     return 'Issued'
  if (p.aplicacao)   return 'Applied'
  if (p.solicitacao) return 'Not Applied'
  return 'Pending'
}

export function situationHex(situacao: string, primaryHex: string, isDark: boolean): string {
  if (situacao === 'Not Applied') return isDark ? '#fca5a5' : '#ef4444'   // red-300 / red-500
  if (situacao === 'Applied')     return isDark ? '#fde047' : '#eab308'   // yellow-300 / yellow-500
  if (situacao === 'Issued')      return primaryHex
  return isDark ? '#9ca3af' : '#6b7280'                                   // gray-400 / gray-500
}

// Not Applied first: it is what needs attention, so it sits right under the bubble.
export const SITUATION_ORDER = ['Not Applied', 'Applied', 'Issued', 'Pending']

export function situationsOfDay(permits: Permit[]): { situacao: string; permits: Permit[] }[] {
  const by = new Map<string, Permit[]>()
  for (const p of permits) {
    const s = p.situacao || 'Other'
    by.set(s, [...(by.get(s) ?? []), p])
  }
  const known = SITUATION_ORDER.filter(s => by.has(s))
  const rest = [...by.keys()].filter(s => !SITUATION_ORDER.includes(s))
  return [...known, ...rest].map(s => ({ situacao: s, permits: by.get(s)! }))
}

/** The situation color when the whole day shares one situation; null when it is mixed. */
export function stemColorForDay(permits: Permit[], primaryHex: string, isDark: boolean): string | null {
  const groups = situationsOfDay(permits)
  return groups.length === 1 ? situationHex(groups[0].situacao, primaryHex, isDark) : null
}

// ─── URL / file helpers ───────────────────────────────────────────────────────

const GENERIC_SLUGS = new Set(['allitems', 'forms', 'pages', 'home', 'index', 'default', 'root'])

export function fileLabel(url: string): string {
  try {
    const u     = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const last  = parts[parts.length - 1]
    const clean = decodeURIComponent(last).replace(/\.\w+$/, '').replace(/[-_]/g, ' ').trim()
    if (clean.length > 2 && !GENERIC_SLUGS.has(clean.toLowerCase())) return clean
    const host = u.hostname.replace(/^www\./, '')
    if (host.includes('sharepoint'))                          return 'SharePoint'
    if (host.includes('drive.google'))                        return 'Google Drive'
    if (host.includes('dropbox'))                             return 'Dropbox'
    if (host.includes('onedrive') || host.includes('1drv'))   return 'OneDrive'
    return host.split('.')[0]
  } catch {
    return 'Open link'
  }
}

// ─── Permit validation helpers ────────────────────────────────────────────────

export function dateConflicts(p: Permit): string[] {
  const issues: string[] = []
  const d = (s: string | null) => s ? new Date(s).getTime() : null
  const sol = d(p.solicitacao), apl = d(p.aplicacao), emi = d(p.emissao)
  if (!sol && (apl || emi))    issues.push('Request date is missing')
  if (sol && apl && sol > apl) issues.push('Request date is after Application date')
  if (sol && emi && sol > emi) issues.push('Request date is after Issue date')
  if (apl && emi && apl > emi) issues.push('Application date is after Issue date')
  return issues
}

export function calcDays(p: Permit): number {
  if (!p.solicitacao) return 0
  const start = new Date(p.solicitacao)
  const end   = p.situacao === 'Issued' && p.emissao ? new Date(p.emissao) : new Date()
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}
