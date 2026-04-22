'use client'

import { useMemo, useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { AlertCircle } from 'lucide-react'
import { usePermits } from '@/hooks/use-permits'
import { useAuth } from '@/hooks/use-auth'
import { useMyPermissions } from '@/hooks/use-settings'
import { PermitSkeleton } from '@/components/common/page-skeleton'
import { useInsights } from '@/components/insights/insights-panel'
import { ManageDataModal } from './manage-data-modal'
import { ALL, MONTHS, type DateField } from './types'
import { getDateStr, calcSit } from './lib'
import { PermitFilters } from './components/permit-filters'
import { PermitChart } from './components/permit-chart'
import { PermitCards } from './components/permit-cards'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PermitsPage() {
  const { data: rawPermits, isLoading, error } = usePermits()

  // Recompute situacao from dates so stale DB values never reach the UI
  const permits = useMemo(
    () => (rawPermits ?? []).map(p => ({ ...p, situacao: calcSit(p) })),
    [rawPermits]
  )

  const { resolvedTheme } = useTheme()
  const { user }          = useAuth()
  const { data: myPerms } = useMyPermissions()

  const canManage = (user?.role as string) === 'dev' || myPerms?.permissions?.['permits'] === 'write'

  const [primaryHex, setPrimaryHex] = useState('#6366f1')
  const [manageOpen, setManageOpen] = useState(false)

  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    if (raw) setPrimaryHex(raw)
  }, [resolvedTheme])

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [dateField,     setDateField]     = useState<DateField>('solicitacao')
  const [yearFilter,    setYearFilter]    = useState<string>(ALL)
  const [monthFilter,   setMonthFilter]   = useState<string>(ALL)
  const [situation,     setSituation]     = useState<string>(ALL)
  const [clientFilter,  setClientFilter]  = useState<string[]>([])
  const [jobsiteFilter, setJobsiteFilter] = useState<string[]>([])

  const insights = useInsights({
    pageKey:  'Permits',
    mes:      monthFilter  !== ALL ? parseInt(monthFilter)  : new Date().getMonth() + 1,
    ano:      yearFilter   !== ALL ? parseInt(yearFilter)   : new Date().getFullYear(),
    userId:   user?.id ?? '',
    canWrite: canManage,
  })

  // ── Dropdown options ──────────────────────────────────────────────────────────
  const { years, clients, jobsites } = useMemo(() => {
    if (!permits) return { years: [], clients: [], jobsites: [] }
    const ySet = new Set<string>()
    permits.forEach(p => {
      ;[p.solicitacao, p.aplicacao, p.emissao].forEach(d => {
        const y = getDateStr(d, 'year'); if (y) ySet.add(y)
      })
    })
    return {
      years:    Array.from(ySet).sort((a, b) => Number(b) - Number(a)),
      clients:  Array.from(new Set(permits.map(p => p.client).filter(Boolean))).sort() as string[],
      jobsites: Array.from(new Set(permits.map(p => p.jobsite).filter(Boolean))).sort() as string[],
    }
  }, [permits])

  const availableMonths = useMemo(() => {
    if (!permits || yearFilter === ALL) return MONTHS
    const mSet = new Set<string>()
    permits.forEach(p => {
      const d = p[dateField] as string | null
      if (getDateStr(d, 'year') === yearFilter) mSet.add(getDateStr(d, 'month'))
    })
    return MONTHS.filter(m => mSet.has(m.value))
  }, [permits, yearFilter, dateField])

  // ── Filtered rows ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!permits) return []
    return permits.filter(p => {
      const dateVal = p[dateField] as string | null
      if (yearFilter  !== ALL && getDateStr(dateVal, 'year')  !== yearFilter)  return false
      if (monthFilter !== ALL && getDateStr(dateVal, 'month') !== monthFilter) return false
      if (situation   !== ALL && p.situacao !== situation)                      return false
      if (clientFilter.length  > 0 && !clientFilter.includes(p.client))        return false
      if (jobsiteFilter.length > 0 && !jobsiteFilter.includes(p.jobsite))      return false
      return true
    })
  }, [permits, dateField, yearFilter, monthFilter, situation, clientFilter, jobsiteFilter])

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) return <PermitSkeleton />
  if (error) return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-muted-foreground">Failed to load permit data.</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col gap-4">

      {/* ── Filters / Header ── */}
      <PermitFilters
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        dateField={dateField}
        availableMonths={availableMonths}
        years={years}
        onYearChange={setYearFilter}
        onMonthChange={setMonthFilter}
        onDateFieldChange={setDateField}
        situation={situation}
        onSituationChange={setSituation}
        clients={clients}
        jobsites={jobsites}
        clientFilter={clientFilter}
        jobsiteFilter={jobsiteFilter}
        onClientFilterChange={setClientFilter}
        onJobsiteFilterChange={setJobsiteFilter}
        canManage={canManage}
        onManageClick={() => setManageOpen(true)}
        insightsTriggerButton={insights.triggerButton}
      />

      {/* ── Body ── */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="w-full shrink-0 overflow-hidden">
            <PermitChart
              permits={filtered}
              dateField={dateField}
              primaryHex={primaryHex}
              isDark={resolvedTheme === 'dark'}
            />
          </div>
          <PermitCards
            permits={filtered}
            primaryHex={primaryHex}
            situation={situation}
          />
        </div>

        {/* Insights panel — slides in, compresses main content */}
        {insights.panel}

      </div>

      {manageOpen && <ManageDataModal onClose={() => setManageOpen(false)} />}

    </div>
  )
}
