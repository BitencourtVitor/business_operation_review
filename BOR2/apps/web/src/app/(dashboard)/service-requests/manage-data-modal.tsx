'use client'

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useServiceRequests } from '@/hooks/use-service-requests'
import { useAuth } from '@/hooks/use-auth'
import { serviceRequestService } from '@/services/service-request.service'
import type { ServiceRequest, ServiceRequestInput } from '@/services/service-request.service'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/common/theme-toggle'
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CalendarIcon,
  CheckCircle2, Edit2, Loader2, Plus, RefreshCw, Search, ShieldCheck, Trash2, X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Draft = {
  contractor:            string
  jobSite:               string
  city:                  string
  lot:                   string
  address:               string
  issue:                 string
  tech:                  string
  warranty:              boolean
  dateReceived:          string   // YYYY-MM-DD
  materialAvailableDate: string
  residentAvailableDate: string
  dateCompleted:         string
  closeDate:             string
  additionalVisits:      string   // comma-separated raw
}

const EMPTY_DRAFT: Draft = {
  contractor: '', jobSite: '', city: '', lot: '', address: '',
  issue: '', tech: '', warranty: false,
  dateReceived: '', materialAvailableDate: '', residentAvailableDate: '',
  dateCompleted: '', closeDate: '', additionalVisits: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIso(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().substring(0, 10)
}

function fromIso(s: string): string | null {
  return s ? `${s}T00:00:00Z` : null
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`
}

function srToDraft(r: ServiceRequest): Draft {
  return {
    contractor:            r.contractor,
    jobSite:               r.jobSite,
    city:                  r.city,
    lot:                   r.lot,
    address:               r.address,
    issue:                 r.issue,
    tech:                  r.tech,
    warranty:              r.warranty,
    dateReceived:          toIso(r.dateReceived),
    materialAvailableDate: toIso(r.materialAvailableDate),
    residentAvailableDate: toIso(r.residentAvailableDate),
    dateCompleted:         toIso(r.dateCompleted),
    closeDate:             toIso(r.closeDate),
    additionalVisits:      (r.additionalVisits ?? []).map(toIso).filter(Boolean).join(', '),
  }
}

function draftToInput(d: Draft): ServiceRequestInput {
  const visits = d.additionalVisits
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => fromIso(s) ?? s)

  return {
    contractor:            d.contractor,
    jobSite:               d.jobSite,
    city:                  d.city,
    lot:                   d.lot,
    address:               d.address,
    issue:                 d.issue,
    tech:                  d.tech,
    warranty:              d.warranty,
    dateReceived:          fromIso(d.dateReceived),
    materialAvailableDate: fromIso(d.materialAvailableDate),
    residentAvailableDate: fromIso(d.residentAvailableDate),
    dateCompleted:         fromIso(d.dateCompleted),
    closeDate:             fromIso(d.closeDate),
    additionalVisits:      visits,
  }
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

function displayToIso(display: string): string {
  const digits = display.replace(/\D/g, '')
  if (digits.length < 8) return ''
  const m = parseInt(digits.slice(0, 2), 10)
  const d = parseInt(digits.slice(2, 4), 10)
  const y = parseInt(digits.slice(4, 8), 10)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return ''
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [inputText, setInputText] = useState(isoToDisplay(value))
  const [open, setOpen]           = useState(false)
  useEffect(() => setInputText(isoToDisplay(value)), [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8)
    let fmt = raw
    if (raw.length > 4) fmt = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`
    else if (raw.length > 2) fmt = `${raw.slice(0, 2)}/${raw.slice(2)}`
    setInputText(fmt)
  }
  function handleBlur() {
    const iso = displayToIso(inputText)
    onChange(iso)
    setInputText(iso ? isoToDisplay(iso) : '')
  }
  function handleDaySelect(date: Date | undefined) {
    if (!date) return
    const iso = format(date, 'yyyy-MM-dd')
    setInputText(isoToDisplay(iso))
    onChange(iso)
    setOpen(false)
  }

  const selectedDate = value ? parseISO(value) : undefined

  return (
    <div className="flex h-7 w-[90px] items-center overflow-hidden rounded border border-input bg-background">
      <input
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
        placeholder="mm/dd/yy"
        value={inputText}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-full items-center px-1 text-muted-foreground transition-colors hover:text-foreground">
          <CalendarIcon className="h-3 w-3 shrink-0" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" side="bottom" align="end">
          <Calendar mode="single" selected={selectedDate} defaultMonth={selectedDate} onSelect={handleDaySelect} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Td({ children, center, muted, date, first, className = '' }: {
  children:   React.ReactNode
  center?:    boolean
  muted?:     boolean
  date?:      boolean
  first?:     boolean
  className?: string
}) {
  return (
    <td className={`border-b border-border px-3 py-2.5 text-xs whitespace-nowrap
      ${muted  ? 'text-muted-foreground' : ''}
      ${date   ? 'border-r border-border text-center' : ''}
      ${first  ? 'border-l border-border' : ''}
      ${center && !date ? 'text-center' : ''}
      ${className}`}
    >
      {children}
    </td>
  )
}

function EditTd({ children, date, first, className = '' }: {
  children:   React.ReactNode
  date?:      boolean
  first?:     boolean
  className?: string
}) {
  return (
    <td className={`border-b border-border px-2 py-1
      ${date  ? 'border-r border-border' : ''}
      ${first ? 'border-l border-border' : ''}
      ${className}`}
    >
      {children}
    </td>
  )
}

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[60px] rounded border border-input bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

function ActionBtn({ children, onClick, disabled, title, className = '' }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; className?: string
}) {
  return (
    <button
      title={title} onClick={onClick} disabled={disabled}
      className={`rounded p-1 transition-colors hover:bg-muted disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

// ─── VisitsEditor ─────────────────────────────────────────────────────────────

function VisitsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open,    setOpen]   = useState(false)
  const [pending, setPending] = useState('')

  const dates = value.split(',').map(s => s.trim()).filter(Boolean)

  function removeDate(iso: string) {
    onChange(dates.filter(d => d !== iso).join(', '))
  }

  function addDate() {
    if (!pending || dates.includes(pending)) return
    onChange([...dates, pending].join(', '))
    setPending('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-7 w-full items-center justify-between gap-2 rounded border border-input bg-background px-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
        {dates.length > 0
          ? <span className="font-medium text-foreground">{dates.length} visit{dates.length !== 1 ? 's' : ''}</span>
          : <span>Add dates</span>
        }
        <CalendarIcon className="h-3 w-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" side="bottom" align="start">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Additional Visits
        </p>

        {dates.length > 0 ? (
          <div className="mb-3 flex flex-col gap-1">
            {dates.map((iso, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                <span className="text-xs tabular-nums">{isoToDisplay(iso)}</span>
                <button
                  type="button"
                  onClick={() => removeDate(iso)}
                  className="ml-2 text-muted-foreground transition-colors hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground/50">No visits added yet.</p>
        )}

        <div className="flex items-center gap-1.5">
          <DatePicker value={pending} onChange={setPending} />
          <button
            type="button"
            onClick={addDate}
            disabled={!pending}
            className="flex h-7 shrink-0 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ManageDataModal({ onClose }: { onClose: () => void }) {
  const queryClient                         = useQueryClient()
  const { data: records = [], isLoading }   = useServiceRequests()
  const { user }                            = useAuth()

  const [search,     setSearch]     = useState('')
  const [sortCol,    setSortCol]    = useState<string | null>('dateReceived')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('desc')
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [draft,      setDraft]      = useState<Draft>(EMPTY_DRAFT)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingRow,  setAddingRow]  = useState(false)
  const [newDraft,   setNewDraft]   = useState<Draft>(EMPTY_DRAFT)
  const [saving,       setSaving]       = useState(false)
  const [syncingSheet, setSyncingSheet] = useState(false)
  const [notice,       setNotice]       = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? records.filter(r =>
          r.contractor?.toLowerCase().includes(q) ||
          r.jobSite?.toLowerCase().includes(q)    ||
          r.city?.toLowerCase().includes(q)       ||
          r.address?.toLowerCase().includes(q)    ||
          r.issue?.toLowerCase().includes(q)      ||
          r.tech?.toLowerCase().includes(q)
        )
      : records

    if (!sortCol) return base
    return [...base].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortCol] ?? ''
      const vb = (b as Record<string, unknown>)[sortCol] ?? ''
      if (va === '' && vb === '') return 0
      if (va === '') return 1
      if (vb === '') return -1
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [records, search, sortCol, sortDir])

  function SH({ col, children, center, className = '' }: {
    col: string; children: React.ReactNode; center?: boolean; className?: string
  }) {
    return (
      <th
        onClick={() => toggleSort(col)}
        className={`cursor-pointer select-none border-b border-border px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors hover:text-foreground ${center ? 'text-center' : 'text-left'} ${sortCol === col ? 'text-foreground' : 'text-muted-foreground'} ${className}`}
      >
        <span className={`flex items-center gap-1 ${center ? 'justify-center' : ''}`}>
          {children}
          {sortCol === col
            ? sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
            : <ArrowUpDown className="h-3 w-3 opacity-30" />}
        </span>
      </th>
    )
  }

  function invalidate() { return queryClient.invalidateQueries({ queryKey: ['service-requests'] }) }

  function startEdit(r: ServiceRequest)  { setDeletingId(null); setEditingId(r.id); setDraft(srToDraft(r)); setNotice(null) }
  function cancelEdit()                  { setEditingId(null); setDraft(EMPTY_DRAFT) }
  function startDelete(r: ServiceRequest){ setEditingId(null); setDeletingId(r.id); setNotice(null) }

  async function saveEdit(id: string) {
    setSaving(true); setNotice(null)
    try { await serviceRequestService.update(id, draftToInput(draft)); await invalidate(); setEditingId(null); setDraft(EMPTY_DRAFT) }
    catch { setNotice({ kind: 'err', msg: 'Failed to save changes. Please try again.' }) }
    finally { setSaving(false) }
  }

  async function confirmDelete(id: string) {
    setSaving(true); setNotice(null)
    try { await serviceRequestService.remove(id); await invalidate(); setDeletingId(null) }
    catch { setNotice({ kind: 'err', msg: 'Failed to delete record. Please try again.' }) }
    finally { setSaving(false) }
  }

  async function saveNew() {
    setSaving(true); setNotice(null)
    try { await serviceRequestService.create(draftToInput(newDraft)); await invalidate(); setAddingRow(false); setNewDraft(EMPTY_DRAFT) }
    catch { setNotice({ kind: 'err', msg: 'Failed to create record. Please try again.' }) }
    finally { setSaving(false) }
  }

  async function syncSheet() {
    setSyncingSheet(true); setNotice(null)
    try {
      const { total, inserted } = await serviceRequestService.syncFromSheet()
      await invalidate()
      setNotice({ kind: 'ok', msg: `Synced ${total} records (${inserted} inserted)` })
    } catch {
      setNotice({ kind: 'err', msg: 'Sync failed. Please try again.' })
    } finally {
      setSyncingSheet(false)
    }
  }

  function DraftRow({ d, setD, onSave, onCancel }: {
    d: Draft; setD: (fn: (prev: Draft) => Draft) => void; onSave: () => void; onCancel: () => void
  }) {
    return (
      <>
        <EditTd><TextInput value={d.contractor} onChange={v => setD(p => ({ ...p, contractor: v }))} placeholder="Contractor" /></EditTd>
        <EditTd><TextInput value={d.jobSite}    onChange={v => setD(p => ({ ...p, jobSite: v }))}    placeholder="Job Site"   /></EditTd>
        <EditTd><TextInput value={d.city}       onChange={v => setD(p => ({ ...p, city: v }))}       placeholder="City"       /></EditTd>
        <EditTd><TextInput value={d.lot}        onChange={v => setD(p => ({ ...p, lot: v }))}        placeholder="Lot"        /></EditTd>
        <EditTd><TextInput value={d.address}    onChange={v => setD(p => ({ ...p, address: v }))}    placeholder="Address"    /></EditTd>
        <EditTd><TextInput value={d.issue}      onChange={v => setD(p => ({ ...p, issue: v }))}      placeholder="Issue"      /></EditTd>
        <EditTd><TextInput value={d.tech}       onChange={v => setD(p => ({ ...p, tech: v }))}       placeholder="Tech"       /></EditTd>
        <EditTd center>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setD(p => ({ ...p, warranty: !p.warranty }))}
              className={`inline-flex h-6 w-10 items-center rounded-full border transition-colors ${
                d.warranty
                  ? 'border-orange-500/50 bg-orange-500/15'
                  : 'border-border bg-muted/40'
              }`}
            >
              <span
                style={{
                  transform: d.warranty ? 'translateX(1rem)' : 'translateX(0)',
                  backgroundColor: d.warranty ? 'rgb(249 115 22)' : undefined,
                  transition: 'transform 0.2s ease, background-color 0.2s ease',
                }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/30"
              >
                {d.warranty && <ShieldCheck className="h-2.5 w-2.5 text-white" />}
              </span>
            </button>
          </div>
        </EditTd>
        <EditTd date first><DatePicker value={d.dateReceived}          onChange={v => setD(p => ({ ...p, dateReceived: v }))}          /></EditTd>
        <EditTd date>      <DatePicker value={d.materialAvailableDate} onChange={v => setD(p => ({ ...p, materialAvailableDate: v }))} /></EditTd>
        <EditTd date>      <DatePicker value={d.residentAvailableDate} onChange={v => setD(p => ({ ...p, residentAvailableDate: v }))} /></EditTd>
        <EditTd date>      <DatePicker value={d.dateCompleted}         onChange={v => setD(p => ({ ...p, dateCompleted: v }))}         /></EditTd>
        <EditTd>
          <VisitsEditor value={d.additionalVisits} onChange={v => setD(p => ({ ...p, additionalVisits: v }))} />
        </EditTd>
        <td className="border-b border-border px-2 py-1">
          <div className="flex items-center gap-0.5">
            <ActionBtn title="Save" onClick={onSave} disabled={saving} className="text-primary hover:text-primary">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </ActionBtn>
            <ActionBtn title="Cancel" onClick={onCancel}><X className="h-3.5 w-3.5" /></ActionBtn>
          </div>
        </td>
      </>
    )
  }

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
            <h2 className="text-base font-semibold leading-tight">Service Requests</h2>
            <p className="text-[11px] text-muted-foreground">Service &amp; warranty request registry</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search records…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-48 rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            onClick={() => { setAddingRow(true); setNewDraft(EMPTY_DRAFT) }}
            disabled={addingRow}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Request
          </button>

          <ThemeToggle />

          {user?.role === 'dev' && (
            <button
              onClick={syncSheet}
              disabled={syncingSheet}
              title="Replace all records from the Google Sheet (dev only)"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              {syncingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              sync-sheet
            </button>
          )}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div className={`flex shrink-0 items-center gap-2 px-6 py-2 text-xs ${notice.kind === 'ok' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
          {notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          <span className="flex-1">{notice.msg}</span>
          <button onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-sm [&_tbody_tr:last-child_td]:border-b-0">
            <colgroup>
              <col style={{ width: '140px' }} />{/* Contractor */}
              <col style={{ width: '140px' }} />{/* Job Site */}
              <col style={{ width: '110px' }} />{/* City */}
              <col style={{ width: '80px'  }} />{/* Lot */}
              <col style={{ width: '160px' }} />{/* Address */}
              <col style={{ width: '160px' }} />{/* Issue */}
              <col style={{ width: '100px' }} />{/* Tech */}
              <col style={{ width: '72px'  }} />{/* Warranty */}
              <col style={{ width: '98px'  }} />{/* Received */}
              <col style={{ width: '98px'  }} />{/* Material */}
              <col style={{ width: '98px'  }} />{/* Resident */}
              <col style={{ width: '98px'  }} />{/* Completed */}
              <col style={{ width: '130px' }} />{/* Add. Visits */}
              <col style={{ width: '68px'  }} />{/* Actions */}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 backdrop-blur">
                <SH col="contractor">Contractor</SH>
                <SH col="jobSite">Job Site</SH>
                <SH col="city">City</SH>
                <SH col="lot">Lot</SH>
                <SH col="address">Address</SH>
                <SH col="issue">Issue</SH>
                <SH col="tech">Tech</SH>
                <SH col="warranty" center>Warranty</SH>
                <SH col="dateReceived"          center className="border-l border-border border-r border-border">Received</SH>
                <SH col="materialAvailableDate" center className="border-r border-border">Material</SH>
                <SH col="residentAvailableDate" center className="border-r border-border">Resident</SH>
                <SH col="dateCompleted"         center className="border-r border-border">Completed</SH>
                <SH col="additionalVisits">Add. Visits</SH>
                <th className="border-b border-border" />
              </tr>
            </thead>
            <tbody>

              {/* Add new row */}
              {addingRow && (
                <tr className="bg-primary/5">
                  {DraftRow({ d: newDraft, setD: setNewDraft, onSave: saveNew, onCancel: () => setAddingRow(false) })}
                </tr>
              )}

              {/* Data rows */}
              {sorted.map(r => {

                if (deletingId === r.id) return (
                  <tr key={r.id} className="bg-red-500/5">
                    <td colSpan={13} className="border-b border-border px-3 py-2.5">
                      <span className="text-xs text-red-500">
                        Delete <strong className="font-semibold">{r.address || r.jobSite || 'this record'}</strong>? This action cannot be undone.
                      </span>
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <div className="flex items-center gap-0.5">
                        <ActionBtn title="Confirm delete" onClick={() => confirmDelete(r.id)} disabled={saving} className="text-red-500 hover:text-red-500">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </ActionBtn>
                        <ActionBtn title="Cancel" onClick={() => setDeletingId(null)}><X className="h-3.5 w-3.5" /></ActionBtn>
                      </div>
                    </td>
                  </tr>
                )

                if (editingId === r.id) return (
                  <tr key={r.id} className="bg-primary/5">
                    {DraftRow({ d: draft, setD: setDraft, onSave: () => saveEdit(r.id), onCancel: cancelEdit })}
                  </tr>
                )

                const visitDates = (r.additionalVisits ?? []).map(fmtDate)
                return (
                  <tr key={r.id} className="group transition-colors hover:bg-muted/40">
                    <Td>{r.contractor || '—'}</Td>
                    <Td>{r.jobSite    || '—'}</Td>
                    <Td>{r.city       || '—'}</Td>
                    <Td>{r.lot        || '—'}</Td>
                    <Td>{r.address    || '—'}</Td>
                    <Td>{r.issue      || '—'}</Td>
                    <Td className="font-medium text-primary">{r.tech || '—'}</Td>
                    <Td center>
                      {r.warranty
                        ? <ShieldCheck className="mx-auto h-3.5 w-3.5 text-orange-500" />
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </Td>
                    <Td muted date first>{fmtDate(r.dateReceived)}</Td>
                    <Td muted date>{fmtDate(r.materialAvailableDate)}</Td>
                    <Td muted date>{fmtDate(r.residentAvailableDate)}</Td>
                    <Td muted date>{fmtDate(r.dateCompleted)}</Td>
                    <Td muted>
                      {visitDates.length === 0
                        ? <span className="text-muted-foreground/30">—</span>
                        : visitDates.length === 1
                          ? <span>{visitDates[0]}</span>
                          : (
                            <TooltipProvider delay={200}>
                              <Tooltip>
                                <TooltipTrigger render={<span className="cursor-default font-medium text-red-400" />}>
                                  {visitDates.length} visits
                                </TooltipTrigger>
                                <TooltipContent className="flex flex-col gap-0.5">
                                  {visitDates.map((d, i) => (
                                    <span key={i} className="text-xs tabular-nums">{d}</span>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                      }
                    </Td>
                    <td className="border-b border-border px-2 py-2">
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <ActionBtn title="Edit" onClick={() => startEdit(r)} className="text-muted-foreground hover:text-foreground">
                          <Edit2 className="h-3.5 w-3.5" />
                        </ActionBtn>
                        <ActionBtn title="Delete" onClick={() => startDelete(r)} className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}

            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-3">
        <span className="text-xs text-muted-foreground">
          {sorted.length !== records.length
            ? `Showing ${sorted.length} of ${records.length} records`
            : `${records.length} records total`}
        </span>
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-muted px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted/70"
        >
          Close
        </button>
      </div>

    </div>,
    document.body
  )
}
