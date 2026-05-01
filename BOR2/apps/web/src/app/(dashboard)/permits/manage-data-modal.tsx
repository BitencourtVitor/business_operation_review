'use client'

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { usePermits } from '@/hooks/use-permits'
import { useAuth } from '@/hooks/use-auth'
import { permitService } from '@/services/permit.service'
import type { Permit, PermitInput } from '@/services/permit.service'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/common/theme-toggle'
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CalendarIcon,
  CheckCircle2, Edit2, FileText, Loader2,
  Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Draft = {
  client:      string
  jobsite:     string
  lotAddress:  string
  solicitacao: string   // YYYY-MM-DD for Calendar
  aplicacao:   string
  emissao:     string
  observacao:  string
  arquivo:     string
}

const EMPTY_DRAFT: Draft = {
  client: '', jobsite: '', lotAddress: '',
  solicitacao: '', aplicacao: '', emissao: '', observacao: '', arquivo: '',
}

const SIT_STYLE: Record<string, string> = {
  'Issued':      'bg-primary/10 text-primary',
  'Applied':     'bg-yellow-500/10 text-yellow-500',
  'Not Applied': 'bg-red-500/10 text-red-500',
  'Pending':     'bg-muted text-muted-foreground',
}

// Sort index: lower = higher urgency / earlier in workflow
const SIT_RANK: Record<string, number> = {
  'Pending':     1,
  'Not Applied': 2,
  'Applied':     3,
  'Issued':      4,
}

// Situation is always derived from dates — never stored/edited directly.
function calcSituacao(sol: string | null, apl: string | null, emi: string | null): string {
  if (emi) return 'Issued'
  if (apl) return 'Applied'
  if (sol) return 'Not Applied'
  return 'Pending'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().substring(0, 10)
}

function fromDateInput(val: string): string | null {
  return val ? `${val}T00:00:00Z` : null
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// Generic path segments that give no useful info to the user
const GENERIC_SLUGS = new Set(['allitems', 'forms', 'pages', 'home', 'index', 'default', 'root'])

// Extracts a human-readable label from a file URL
function fileLabel(url: string): string {
  try {
    const u     = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const last  = parts[parts.length - 1]
    const clean = decodeURIComponent(last).replace(/\.\w+$/, '').replace(/[-_]/g, ' ').trim()

    if (clean.length > 2 && !GENERIC_SLUGS.has(clean.toLowerCase())) {
      return clean
    }

    // Fallback to a recognisable host label
    const host = u.hostname.replace(/^www\./, '')
    if (host.includes('sharepoint'))          return 'SharePoint'
    if (host.includes('drive.google'))        return 'Google Drive'
    if (host.includes('dropbox'))             return 'Dropbox'
    if (host.includes('onedrive') || host.includes('1drv')) return 'OneDrive'
    return host.split('.')[0]
  } catch {
    return 'Open link'
  }
}

function draftToInput(d: Draft): PermitInput {
  const sol = fromDateInput(d.solicitacao)
  const apl = fromDateInput(d.aplicacao)
  const emi = fromDateInput(d.emissao)
  return {
    client:      d.client,
    jobsite:     d.jobsite,
    lotAddress:  d.lotAddress,
    situacao:    calcSituacao(sol, apl, emi),   // always computed — never manual
    solicitacao: sol,
    aplicacao:   apl,
    emissao:     emi,
    observacao:  d.observacao,
    arquivo:     d.arquivo,
  }
}

function permitToDraft(p: Permit): Draft {
  return {
    client:      p.client,
    jobsite:     p.jobsite,
    lotAddress:  p.lotAddress,
    solicitacao: toDateInput(p.solicitacao),
    aplicacao:   toDateInput(p.aplicacao),
    emissao:     toDateInput(p.emissao),
    observacao:  p.observacao,
    arquivo:     p.arquivo,
  }
}

// ─── Cell inputs ──────────────────────────────────────────────────────────────

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[80px] rounded border border-input bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// YYYY-MM-DD → MM/DD/YYYY display string
function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

// MM/DD/YYYY display string → YYYY-MM-DD (validates; returns '' on invalid)
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

// Text input (MM/DD/YYYY, numbers only) + calendar icon suffix
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
    <div className="flex h-7 w-full items-center overflow-hidden rounded border border-input bg-background">
      <input
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
        placeholder="mm/dd/yyyy"
        value={inputText}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-full items-center px-1.5 text-muted-foreground transition-colors hover:text-foreground">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" side="bottom" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={handleDaySelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ActionBtn({ children, onClick, disabled, title, className = '' }: {
  children:   React.ReactNode
  onClick:    () => void
  disabled?:  boolean
  title?:     string
  className?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1 transition-colors hover:bg-muted disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ManageDataModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: permits = [], isLoading } = usePermits()
  const { user } = useAuth()
  const isDev = (user?.role as string) === 'dev'

  const [search,      setSearch]      = useState('')
  const [hideIssued,  setHideIssued]  = useState(false)
  const [sortCol,     setSortCol]     = useState<string | null>('solicitacao')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [draft,       setDraft]       = useState<Draft>(EMPTY_DRAFT)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [addingRow,   setAddingRow]   = useState(false)
  const [newDraft,    setNewDraft]    = useState<Draft>(EMPTY_DRAFT)
  const [saving,      setSaving]      = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [notice,      setNotice]      = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // ── Persist hide-issued preference per user ───────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    const key = `bor2:permits:hideIssued:${user.id}`
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) setHideIssued(stored === 'true')
    } catch {}
  }, [user?.id])

  function updateHideIssued(val: boolean) {
    setHideIssued(val)
    if (!user?.id) return
    try { localStorage.setItem(`bor2:permits:hideIssued:${user.id}`, String(val)) } catch {}
  }

  // ── Sort toggle ───────────────────────────────────────────────────────────────
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // ── Filtered + sorted list ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? permits.filter(p =>
          p.client.toLowerCase().includes(q)     ||
          p.jobsite.toLowerCase().includes(q)    ||
          p.lotAddress.toLowerCase().includes(q) ||
          p.situacao.toLowerCase().includes(q)   ||
          p.observacao.toLowerCase().includes(q)
        )
      : permits

    const visible = hideIssued
      ? base.filter(p => calcSituacao(p.solicitacao, p.aplicacao, p.emissao) !== 'Issued')
      : base

    if (!sortCol) return visible
    return [...visible].sort((a, b) => {
      let cmp: number
      if (sortCol === 'situacao') {
        const rank = (p: Permit) => SIT_RANK[calcSituacao(p.solicitacao, p.aplicacao, p.emissao)] ?? 99
        cmp = rank(a) - rank(b)
      } else {
        const va = (a as unknown as Record<string, unknown>)[sortCol] ?? ''
        const vb = (b as unknown as Record<string, unknown>)[sortCol] ?? ''
        if (va === '' && vb === '') return 0
        if (va === '') return 1
        if (vb === '') return -1
        cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [permits, search, hideIssued, sortCol, sortDir])

  // ── Sort header — uses closure over sortCol/sortDir/toggleSort ────────────────
  const SH = ({ col, children, className = '', center }: {
    col: string; children: React.ReactNode; className?: string; center?: boolean
  }) => (
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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function invalidate() { return queryClient.invalidateQueries({ queryKey: ['permits'] }) }

  function startEdit(p: Permit) {
    setDeletingId(null); setEditingId(p.id); setDraft(permitToDraft(p)); setNotice(null)
  }
  function cancelEdit() { setEditingId(null); setDraft(EMPTY_DRAFT) }
  function startDelete(p: Permit) { setEditingId(null); setDeletingId(p.id); setNotice(null) }

  // ── Mutations ────────────────────────────────────────────────────────────────
  async function saveEdit(id: string) {
    setSaving(true); setNotice(null)
    try { await permitService.update(id, draftToInput(draft)); await invalidate(); setEditingId(null); setDraft(EMPTY_DRAFT) }
    catch { setNotice({ kind: 'err', msg: 'Failed to save changes. Please try again.' }) }
    finally { setSaving(false) }
  }

  async function confirmDelete(id: string) {
    setSaving(true); setNotice(null)
    try { await permitService.remove(id); await invalidate(); setDeletingId(null) }
    catch { setNotice({ kind: 'err', msg: 'Failed to delete record. Please try again.' }) }
    finally { setSaving(false) }
  }

  async function saveNew() {
    setSaving(true); setNotice(null)
    try { await permitService.create(draftToInput(newDraft)); await invalidate(); setAddingRow(false); setNewDraft(EMPTY_DRAFT) }
    catch { setNotice({ kind: 'err', msg: 'Failed to create record. Please try again.' }) }
    finally { setSaving(false) }
  }

  async function handleSync() {
    setSyncing(true); setNotice(null)
    try {
      const res = await permitService.syncFromSheet()
      await invalidate()
      setNotice({ kind: 'ok', msg: `Sync complete — ${res.total} records processed, ${res.inserted} inserted.` })
    } catch { setNotice({ kind: 'err', msg: 'Sync failed. Check your connection and try again.' }) }
    finally { setSyncing(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">

        {/* Left — logo + title */}
        <div className="flex shrink-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/minilogo_black.png" alt="Premium" className="h-6 w-6 object-contain dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/minilogo_white.png" alt="Premium" className="hidden h-6 w-6 object-contain dark:block" />
          <div>
            <h2 className="text-base font-semibold leading-tight">Permit Data</h2>
            <p className="text-[11px] text-muted-foreground">Work permits registry</p>
          </div>
        </div>

        {/* Right — search → Add Work → Hide Issued → Theme → Sync Sheet */}
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
            Add Work
          </button>

          {/* Hide Issued toggle */}
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <span className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={hideIssued}
                onChange={e => updateHideIssued(e.target.checked)}
              />
              <div className="h-4 w-7 rounded-full border border-border bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary" />
              <div className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-background shadow transition-transform peer-checked:translate-x-3" />
            </span>
            <span className="text-xs text-muted-foreground">Hide Issued</span>
          </label>

          <ThemeToggle />

          {isDev && (
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Replace all records from the Google Sheet (dev only)"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              sync-sheet
            </button>
          )}
        </div>
      </div>

      {/* ── Notice bar ──────────────────────────────────────────────────── */}
      {notice && (
        <div className={`flex shrink-0 items-center gap-2 px-6 py-2 text-xs ${notice.kind === 'ok' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
          {notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          <span className="flex-1">{notice.msg}</span>
          <button onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm [&_tbody_tr:last-child_td]:border-b-0">

            {/* Fixed column widths: Client/Jobsite/Lot/Situation/Request/Application/Issue/Notes/File/Actions */}
            <colgroup><col style={{width:'150px'}}/><col style={{width:'180px'}}/><col style={{width:'210px'}}/><col style={{width:'112px'}}/><col style={{width:'122px'}}/><col style={{width:'122px'}}/><col style={{width:'122px'}}/><col style={{width:'160px'}}/><col style={{width:'140px'}}/><col style={{width:'68px'}}/></colgroup>

            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 backdrop-blur">
                <SH col="client">Client</SH>
                <SH col="jobsite">Jobsite</SH>
                <SH col="lotAddress">Lot / Address</SH>
                <SH col="situacao" center>Situation</SH>
                <SH col="solicitacao" center className="border-l border-r border-border">Request</SH>
                <SH col="aplicacao"   center className="border-r border-border">Application</SH>
                <SH col="emissao"     center className="border-r border-border">Issue</SH>
                <SH col="observacao">Notes</SH>
                <SH col="arquivo">File</SH>
                <th className="border-b border-border" />
              </tr>
            </thead>

            <tbody>

              {/* ── Add new row ── */}
              {addingRow && (
                <tr className="bg-primary/5">
                  <EditTd><TextInput value={newDraft.client}      onChange={v => setNewDraft(d => ({ ...d, client: v }))}      placeholder="Client"      /></EditTd>
                  <EditTd><TextInput value={newDraft.jobsite}     onChange={v => setNewDraft(d => ({ ...d, jobsite: v }))}     placeholder="Jobsite"     /></EditTd>
                  <EditTd><TextInput value={newDraft.lotAddress}  onChange={v => setNewDraft(d => ({ ...d, lotAddress: v }))}  placeholder="Lot/Address" /></EditTd>
                  <EditTd center><SitBadge sol={newDraft.solicitacao} apl={newDraft.aplicacao} emi={newDraft.emissao} /></EditTd>
                  <EditTd date first><DatePicker value={newDraft.solicitacao} onChange={v => setNewDraft(d => ({ ...d, solicitacao: v }))} /></EditTd>
                  <EditTd date>      <DatePicker value={newDraft.aplicacao}   onChange={v => setNewDraft(d => ({ ...d, aplicacao: v }))}   /></EditTd>
                  <EditTd date>      <DatePicker value={newDraft.emissao}     onChange={v => setNewDraft(d => ({ ...d, emissao: v }))}     /></EditTd>
                  <EditTd><TextInput value={newDraft.observacao}  onChange={v => setNewDraft(d => ({ ...d, observacao: v }))}  placeholder="Notes" /></EditTd>
                  <EditTd><TextInput value={newDraft.arquivo}     onChange={v => setNewDraft(d => ({ ...d, arquivo: v }))}     placeholder="URL"   /></EditTd>
                  <td className="border-b border-border px-2 py-2">
                    <div className="flex items-center gap-0.5">
                      <ActionBtn title="Save" onClick={saveNew} disabled={saving} className="text-primary hover:text-primary">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </ActionBtn>
                      <ActionBtn title="Cancel" onClick={() => setAddingRow(false)}>
                        <X className="h-3.5 w-3.5" />
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              )}

              {/* ── Data rows ── */}
              {sorted.map(p => {

                // Delete confirmation row
                if (deletingId === p.id) return (
                  <tr key={p.id} className="bg-red-500/5">
                    <td colSpan={9} className="border-b border-border px-3 py-2.5">
                      <span className="text-xs text-red-500">
                        Delete <strong className="font-semibold">{p.client || p.jobsite || 'this record'}</strong>? This action cannot be undone.
                      </span>
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <div className="flex items-center gap-0.5">
                        <ActionBtn title="Confirm delete" onClick={() => confirmDelete(p.id)} disabled={saving} className="text-red-500 hover:text-red-500">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </ActionBtn>
                        <ActionBtn title="Cancel" onClick={() => setDeletingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                )

                // Edit row
                if (editingId === p.id) return (
                  <tr key={p.id} className="bg-primary/5">
                    <EditTd><TextInput value={draft.client}      onChange={v => setDraft(d => ({ ...d, client: v }))}      /></EditTd>
                    <EditTd><TextInput value={draft.jobsite}     onChange={v => setDraft(d => ({ ...d, jobsite: v }))}     /></EditTd>
                    <EditTd><TextInput value={draft.lotAddress}  onChange={v => setDraft(d => ({ ...d, lotAddress: v }))}  /></EditTd>
                    <EditTd center><SitBadge sol={draft.solicitacao} apl={draft.aplicacao} emi={draft.emissao} /></EditTd>
                    <EditTd date first><DatePicker value={draft.solicitacao} onChange={v => setDraft(d => ({ ...d, solicitacao: v }))} /></EditTd>
                    <EditTd date>      <DatePicker value={draft.aplicacao}   onChange={v => setDraft(d => ({ ...d, aplicacao: v }))}   /></EditTd>
                    <EditTd date>      <DatePicker value={draft.emissao}     onChange={v => setDraft(d => ({ ...d, emissao: v }))}     /></EditTd>
                    <EditTd><TextInput value={draft.observacao}  onChange={v => setDraft(d => ({ ...d, observacao: v }))}  /></EditTd>
                    <EditTd><TextInput value={draft.arquivo}     onChange={v => setDraft(d => ({ ...d, arquivo: v }))}     /></EditTd>
                    <td className="border-b border-border px-2 py-2">
                      <div className="flex items-center gap-0.5">
                        <ActionBtn title="Save" onClick={() => saveEdit(p.id)} disabled={saving} className="text-primary hover:text-primary">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </ActionBtn>
                        <ActionBtn title="Cancel" onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5" />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                )

                // Normal display row
                return (
                  <tr key={p.id} className="group transition-colors hover:bg-muted/40">
                    <Td>{p.client  || '—'}</Td>
                    <Td>{p.jobsite || '—'}</Td>
                    <Td className="overflow-hidden">
                      {p.lotAddress
                        ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger render={<span className="block truncate cursor-default" />}>
                                {p.lotAddress}
                              </TooltipTrigger>
                              <TooltipContent side="top" align="start" className="max-w-xs whitespace-pre-wrap break-words">
                                {p.lotAddress}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </Td>
                    <Td center><SitBadge sol={p.solicitacao} apl={p.aplicacao} emi={p.emissao} /></Td>
                    <Td muted date first className={(p.aplicacao || p.emissao) && !p.solicitacao ? 'bg-amber-500/[0.12] text-amber-500' : ''}>{fmtDate(p.solicitacao)}</Td>
                    <Td muted date       className={p.emissao && !p.aplicacao                   ? 'bg-amber-500/[0.12] text-amber-500' : ''}>{fmtDate(p.aplicacao)}</Td>
                    <Td muted date>{fmtDate(p.emissao)}</Td>
                    <Td className="overflow-hidden">
                      {p.observacao
                        ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger render={<span className="block truncate cursor-default" />}>
                                {p.observacao}
                              </TooltipTrigger>
                              <TooltipContent side="top" align="start" className="max-w-xs whitespace-pre-wrap break-words">
                                {p.observacao}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </Td>
                    <td className="border-b border-border px-3 py-2.5">
                      {p.arquivo
                        ? <a
                            href={p.arquivo}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={p.arquivo}
                            className="inline-flex items-center gap-1.5 text-xs text-primary transition-opacity hover:opacity-70"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[100px] truncate">{fileLabel(p.arquivo)}</span>
                          </a>
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <ActionBtn title="Edit" onClick={() => startEdit(p)} className="text-muted-foreground hover:text-foreground">
                          <Edit2 className="h-3.5 w-3.5" />
                        </ActionBtn>
                        <ActionBtn title="Delete" onClick={() => startDelete(p)} className="text-muted-foreground hover:text-red-500">
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

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-3">
        <span className="text-xs text-muted-foreground">
          {sorted.length !== permits.length
            ? `Showing ${sorted.length} of ${permits.length} records${hideIssued ? ' (Issued hidden)' : ''}`
            : `${permits.length} records total`}
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

// ─── Situation badge (computed from dates, reactive in edit mode) ─────────────

function SitBadge({ sol, apl, emi }: { sol: string | null | undefined; apl: string | null | undefined; emi: string | null | undefined }) {
  const sit = calcSituacao(sol || null, apl || null, emi || null)
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SIT_STYLE[sit] ?? 'bg-muted text-muted-foreground'}`}>
      {sit}
    </span>
  )
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Td({ children, muted, date, first, center, className = '' }: {
  children: React.ReactNode
  muted?:   boolean
  date?:    boolean   // right border + center text
  first?:   boolean   // adds left border (for first date col)
  center?:  boolean
  className?: string
}) {
  return (
    <td className={`border-b border-border px-3 py-2.5 text-xs whitespace-nowrap
      ${muted          ? 'text-muted-foreground' : ''}
      ${date           ? 'border-r border-border text-center' : ''}
      ${first          ? 'border-l border-border' : ''}
      ${center && !date ? 'text-center' : ''}
      ${className}`}
    >
      {children}
    </td>
  )
}

function EditTd({ children, date, first, center, className = '' }: {
  children:   React.ReactNode
  date?:      boolean
  first?:     boolean
  center?:    boolean
  className?: string
}) {
  return (
    <td className={`border-b border-border px-2 py-1.5
      ${date   ? 'border-r border-border' : ''}
      ${first  ? 'border-l border-border' : ''}
      ${center ? 'text-center' : ''}
      ${className}`}
    >
      {children}
    </td>
  )
}
