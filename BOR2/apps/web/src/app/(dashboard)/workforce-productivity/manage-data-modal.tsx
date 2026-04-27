'use client'

import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWorkforceUploads, useWorkforceUpload, useDeleteWorkforceUpload } from '@/hooks/use-workforce'
import type { WorkforceUpload } from '@/services/workforce.service'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { AlertTriangle, Building2, CloudUpload, FileSpreadsheet, Loader2, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES: { name: string; logo: string }[] = [
  { name: 'Framing', logo: '/images/sublogo_framing.png' },
  { name: 'PCG',     logo: '/images/sublogo_pcg.png'     },
  { name: 'HVAC',    logo: '/images/sublogo_hvac.png'    },
]

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => String(currentYear - 2 + i))

const companyColor: Record<string, string> = {
  Framing: 'border-blue-500/40 bg-blue-500/10',
  PCG:     'border-emerald-500/40 bg-emerald-500/10',
  HVAC:    'border-orange-500/40 bg-orange-500/10',
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Upload Dialog ────────────────────────────────────────────────────────────

function UploadDialog({ onClose, existingUploads }: { onClose: () => void; existingUploads: WorkforceUpload[] }) {
  const [company,  setCompany]  = useState('Framing')
  const [year,     setYear]     = useState(String(currentYear))
  const [month,    setMonth]    = useState('')
  const [file,     setFile]     = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [conflict, setConflict] = useState<WorkforceUpload | null>(null)
  const [error,    setError]    = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const upload  = useWorkforceUpload()

  // "YYYY-MM" for API
  const referenceMonth = year && month ? `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}` : ''
  const existing = existingUploads.find(u => u.referenceMonth === referenceMonth && u.company === company)

  async function handleSubmit(overwrite = false) {
    if (!file || !referenceMonth) return
    setError('')
    if (existing && !overwrite) { setConflict(existing); return }
    const res = await upload.mutateAsync({ file, company, referenceMonth, overwrite })
    if (!res.ok) { setError(res.error ?? 'Upload failed'); return }
    onClose()
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) setFile(dropped)
  }, [])

  if (conflict) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <h2 className="text-base font-semibold">Upload already exists</h2>
          </div>
          <p className="mb-1 text-sm text-muted-foreground">
            A file for <span className="font-medium text-foreground">{conflict.company}</span> ·{' '}
            <span className="font-medium text-foreground">{formatMonth(conflict.referenceMonth)}</span> already exists.
          </p>
          <p className="mb-5 text-sm text-muted-foreground">
            Overwriting will permanently delete{' '}
            <span className="font-medium text-foreground">{conflict.recordCount.toLocaleString()} records</span> and replace them with the new file.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConflict(null)} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">Cancel</button>
            <button onClick={() => { setConflict(null); handleSubmit(true) }}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
            >Overwrite</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Upload Timesheet CSV</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5">

          {/* Reference Month — label + Year + Month inline */}
          <div className="flex h-9 items-center gap-0 overflow-hidden rounded-lg border border-input bg-muted/20">
            <span className="shrink-0 pl-3 pr-2 text-xs font-medium text-muted-foreground">Reference Month</span>
            <div className="h-5 w-px shrink-0 bg-border" />
            <Select value={year} onValueChange={v => setYear(v ?? year)}>
              <SelectTrigger className="h-9 w-[80px] border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                <span className="flex-1 text-left text-sm">{year}</span>
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="h-5 w-px shrink-0 bg-border" />
            <Select value={month || 'placeholder'} onValueChange={v => setMonth(v === 'placeholder' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-9 flex-1 border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                <span className={cn('flex-1 text-left text-sm', !month && 'text-muted-foreground')}>{month || 'Month'}</span>
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Company */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <div className="flex gap-2">
              {COMPANIES.map(c => (
                <button key={c.name} onClick={() => setCompany(c.name)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-3 transition-all',
                    company === c.name
                      ? 'border-primary/50 bg-primary/8 ring-1 ring-primary/30'
                      : 'border-border bg-muted/20 hover:bg-muted/50'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logo} alt={c.name} className="h-5 w-auto object-contain" />
                  <span className={cn('text-[11px] font-semibold', company === c.name ? 'text-foreground' : 'text-muted-foreground')}>
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* CSV File — drag & drop zone */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">CSV File</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-all',
                dragging
                  ? 'border-primary bg-primary/8 scale-[1.01]'
                  : file
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40'
              )}
            >
              {file ? (
                <>
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                  <span className="max-w-full truncate text-center text-sm font-medium text-primary">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · click to replace</span>
                </>
              ) : (
                <>
                  <CloudUpload className={cn('h-8 w-8 transition-colors', dragging ? 'text-primary' : 'text-muted-foreground/50')} />
                  <span className="text-sm font-medium text-muted-foreground">
                    {dragging ? 'Drop to attach' : 'Drag & drop or click to attach'}
                  </span>
                  <span className="text-xs text-muted-foreground/60">CSV files only</span>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Conflict warning */}
          {existing && (
            <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
              ⚠ An upload already exists for {company} · {formatMonth(referenceMonth)}
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">Cancel</button>
          <button onClick={() => handleSubmit(false)} disabled={!file || !referenceMonth || upload.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function ManageDataModal({ onClose }: { onClose: () => void }) {
  const { data: uploads = [], isLoading } = useWorkforceUploads()
  const deleteUpload = useDeleteWorkforceUpload()
  const [uploadOpen,  setUploadOpen]  = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    await deleteUpload.mutateAsync(id)
    setDeletingId(null)
  }

  const byMonth = uploads.reduce<Record<string, WorkforceUpload[]>>((acc, u) => {
    if (!acc[u.referenceMonth]) acc[u.referenceMonth] = []
    acc[u.referenceMonth].push(u)
    return acc
  }, {})
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">

      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex shrink-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/minilogo_black.png" alt="Premium" className="h-6 w-6 object-contain dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/minilogo_white.png" alt="Premium" className="hidden h-6 w-6 object-contain dark:block" />
          <div>
            <h2 className="text-base font-semibold leading-tight">Workforce Productivity</h2>
            <p className="text-[11px] text-muted-foreground">Manage QBTime CSV uploads by month and company</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Upload className="h-3.5 w-3.5" />
            New Upload
          </button>
          <ThemeToggle />
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : months.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No uploads yet. Upload your first QBTime CSV.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {months.map(month => (
              <div key={month}>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
                  {formatMonth(month)}
                </p>
                <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
                  {byMonth[month].map((u, i) => (
                    <div
                      key={u.id}
                      className={cn('flex items-center gap-4 px-4 py-3',
                        i < byMonth[month].length - 1 && 'border-b border-border/30'
                      )}
                    >
                      <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        companyColor[u.company] ?? 'border-border bg-secondary text-foreground'
                      )}>
                        {u.company}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.recordCount.toLocaleString()} records · {u.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs · {formatDate(u.uploadedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={deletingId === u.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        {deletingId === u.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadOpen && (
        <UploadDialog onClose={() => setUploadOpen(false)} existingUploads={uploads} />
      )}
    </div>,
    document.body
  )
}
