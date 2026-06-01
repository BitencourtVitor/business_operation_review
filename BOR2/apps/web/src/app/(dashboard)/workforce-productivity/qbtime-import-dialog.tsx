'use client'

import { useState } from 'react'
import { CheckSquare, Square, Loader2, X, Download, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { workforceService } from '@/services/workforce.service'
import { useQueryClient } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES = [
  { name: 'Framing', color: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { name: 'PCG',     color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { name: 'HVAC',    color: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400' },
]

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const currentYear  = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const YEARS = Array.from({ length: 4 }, (_, i) => String(currentYear - 2 + i))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = []
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function ym(year: string, month: string) {
  return `${year}-${String(MONTH_NAMES.indexOf(month) + 1).padStart(2, '0')}`
}

// ─── Month Selector ───────────────────────────────────────────────────────────

function MonthSelector({
  label, year, month, onYear, onMonth,
}: {
  label: string
  year: string
  month: string
  onYear: (y: string) => void
  onMonth: (m: string) => void
}) {
  const maxMonth = Number(year) < currentYear ? 12
    : Number(year) === currentYear ? Math.min(12, currentMonth + 2)
    : Math.max(0, currentMonth + 2 - 12)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-9 items-center gap-0 overflow-hidden rounded-lg border border-input bg-muted/20">
        <Select value={year} onValueChange={v => {
          onYear(v)
          if (month && MONTH_NAMES.indexOf(month) + 1 > maxMonth) onMonth('')
        }}>
          <SelectTrigger className="h-9 w-[76px] border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
            <span className="flex-1 text-left text-sm">{year}</span>
          </SelectTrigger>
          <SelectContent>
            {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="h-5 w-px shrink-0 bg-border" />
        <Select value={month || '__placeholder__'} onValueChange={v => onMonth(v === '__placeholder__' ? '' : v)}>
          <SelectTrigger className="h-9 flex-1 border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
            <span className={cn('flex-1 text-left text-sm', !month && 'text-muted-foreground')}>{month || 'Month'}</span>
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.slice(0, maxMonth).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ─── Result types ─────────────────────────────────────────────────────────────

interface ImportJobResult {
  month: string
  company: string
  status: 'pending' | 'running' | 'ok' | 'error' | 'conflict'
  inserted?: number
  skipped?: number
  error?: string
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function QBTimeImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()

  const [startYear,  setStartYear]  = useState(String(currentYear))
  const [startMonth, setStartMonth] = useState(MONTH_NAMES[currentMonth - 2] ?? MONTH_NAMES[0])
  const [endYear,    setEndYear]    = useState(String(currentYear))
  const [endMonth,   setEndMonth]   = useState(MONTH_NAMES[currentMonth - 1] ?? MONTH_NAMES[0])
  const [companies,  setCompanies]  = useState<string[]>(['Framing', 'PCG', 'HVAC'])
  const [overwrite,  setOverwrite]  = useState(false)
  const [results,    setResults]    = useState<ImportJobResult[] | null>(null)
  const [running,    setRunning]    = useState(false)

  const startYM = startMonth ? ym(startYear, startMonth) : ''
  const endYM   = endMonth   ? ym(endYear,   endMonth)   : ''
  const canRun  = !!startYM && !!endYM && companies.length > 0 && startYM <= endYM

  function toggleCompany(name: string) {
    setCompanies(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    )
  }

  async function handleImport() {
    if (!canRun) return
    const months = monthsBetween(startYM, endYM)
    const jobs: ImportJobResult[] = months.flatMap(month =>
      companies.map(company => ({ month, company, status: 'pending' as const }))
    )
    setResults(jobs)
    setRunning(true)

    for (let i = 0; i < jobs.length; i++) {
      setResults(prev => prev!.map((j, idx) => idx === i ? { ...j, status: 'running' } : j))

      const res = await workforceService.qbtimeImport(jobs[i].company, jobs[i].month, overwrite)

      setResults(prev => prev!.map((j, idx) => {
        if (idx !== i) return j
        if (res.ok) return { ...j, status: 'ok', inserted: res.inserted, skipped: res.skipped }
        if (res.status === 409) return { ...j, status: 'conflict', error: res.error }
        return { ...j, status: 'error', error: res.error }
      }))
    }

    setRunning(false)
    qc.invalidateQueries({ queryKey: ['workforce'] })
  }

  // ── Showing results ────────────────────────────────────────────────────────

  if (results) {
    const done    = results.filter(r => r.status !== 'pending' && r.status !== 'running').length
    const total   = results.length
    const hasConflicts = results.some(r => r.status === 'conflict')

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">QB Time Import</h2>
              <p className="text-xs text-muted-foreground">
                {running ? `Running… ${done}/${total}` : `Completed — ${done} jobs`}
              </p>
            </div>
            {!running && (
              <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Results table */}
          <div className="max-h-[400px] overflow-y-auto px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs font-medium text-muted-foreground">
                  <th className="pb-2 text-left">Month</th>
                  <th className="pb-2 text-left">Company</th>
                  <th className="pb-2 text-right">Inserted</th>
                  <th className="pb-2 text-right">Skipped</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-border/20 last:border-0">
                    <td className="py-2 text-muted-foreground">{formatMonth(r.month)}</td>
                    <td className="py-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        COMPANIES.find(c => c.name === r.company)?.color ?? 'border-border'
                      )}>
                        {r.company}
                      </span>
                    </td>
                    <td className="py-2 text-right font-medium">
                      {r.inserted != null ? r.inserted.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.skipped != null ? r.skipped.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {r.status === 'pending' && <span className="text-xs text-muted-foreground/50">waiting</span>}
                      {r.status === 'running' && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {r.status === 'ok'      && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />}
                      {r.status === 'conflict' && (
                        <span className="text-xs text-yellow-500">conflict</span>
                      )}
                      {r.status === 'error' && (
                        <span className="text-xs text-destructive" title={r.error}>error</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Conflict hint */}
          {!running && hasConflicts && (
            <p className="mx-5 mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
              Some months already have data. Re-run with <strong>Overwrite</strong> enabled to replace them.
            </p>
          )}

          {!running && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Configuration form ─────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">QB Time Import</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Pull timesheet data directly from QB Time API</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5">

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <MonthSelector
              label="Start month"
              year={startYear} month={startMonth}
              onYear={setStartYear} onMonth={setStartMonth}
            />
            <MonthSelector
              label="End month"
              year={endYear} month={endMonth}
              onYear={setEndYear} onMonth={setEndMonth}
            />
          </div>

          {/* Range validation */}
          {startYM && endYM && startYM > endYM && (
            <p className="text-xs text-destructive">End month must be after start month.</p>
          )}

          {/* Companies */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Companies</span>
            <div className="flex gap-2">
              {COMPANIES.map(c => {
                const selected = companies.includes(c.name)
                return (
                  <button
                    key={c.name}
                    onClick={() => toggleCompany(c.name)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-all',
                      selected
                        ? 'border-primary/50 bg-primary/8 ring-1 ring-primary/30 text-foreground'
                        : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {selected
                      ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      : <Square className="h-3.5 w-3.5" />
                    }
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Overwrite toggle */}
          <button
            onClick={() => setOverwrite(v => !v)}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
              overwrite
                ? 'border-yellow-500/40 bg-yellow-500/10'
                : 'border-border bg-muted/20 hover:bg-muted/40'
            )}
          >
            {overwrite
              ? <CheckSquare className="h-4 w-4 shrink-0 text-yellow-500" />
              : <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
            }
            <div>
              <p className={cn('text-sm font-medium', overwrite ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground')}>
                Overwrite existing data
              </p>
              <p className="text-xs text-muted-foreground">Replace any month that already has data for the selected companies</p>
            </div>
          </button>

          {/* Summary */}
          {canRun && (
            <p className="text-xs text-muted-foreground">
              Will run <strong className="text-foreground">{monthsBetween(startYM, endYM).length * companies.length}</strong> import{monthsBetween(startYM, endYM).length * companies.length !== 1 ? 's' : ''} —{' '}
              {monthsBetween(startYM, endYM).length} month{monthsBetween(startYM, endYM).length !== 1 ? 's' : ''} × {companies.length} {companies.length !== 1 ? 'companies' : 'company'}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!canRun}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
