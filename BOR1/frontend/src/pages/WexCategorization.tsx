import Cookies from 'js-cookie'
import React, { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import logoWhite from '../assets/logo_white.png'
import logoBlack from '../assets/logo_black.png'
import type { Theme } from '../types/common'
import type { User } from '@supabase/supabase-js'

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

type ParsedCsv = { headers: string[]; rows: string[][] }

function guessDelimiter(text: string): ',' | ';' | '\t' {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5)
  const sample = lines.join('\n')
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQ = false
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]
    if (ch === '"') { if (inQ && sample[i + 1] === '"') { i++; continue } inQ = !inQ; continue }
    if (!inQ && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return (best?.[0] as ',' | ';' | '\t') || ','
}

function parseCsvWithDelimiter(text: string, delim: ',' | ';' | '\t'): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  const pushF = () => { row.push(field); field = '' }
  const pushR = () => { rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { inQ = false } }
      else { field += ch }
      continue
    }
    if (ch === '"') { inQ = true; continue }
    if (ch === delim) { pushF(); continue }
    if (ch === '\n') { pushF(); pushR(); continue }
    if (ch === '\r') { if (text[i + 1] === '\n') continue; pushF(); pushR(); continue }
    field += ch
  }
  pushF()
  if (row.length > 1 || row[0]?.trim()) pushR()
  const headers = (rows[0] || []).map(h => h.trim())
  return { headers, rows: rows.slice(1).filter(r => r.some(c => c.trim())) }
}

function parseCsv(text: string): ParsedCsv {
  return parseCsvWithDelimiter(text, guessDelimiter(text))
}

function idx(headers: string[], name: string) {
  return headers.findIndex(h => h.trim() === name)
}

// ─── Date utils ───────────────────────────────────────────────────────────────

function toIso(raw: string): string | null {
  const s = raw.trim().split('T')[0]
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const i = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (i) return `${i[1]}-${i[2].padStart(2, '0')}-${i[3].padStart(2, '0')}`
  return null
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function weekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return WEEKDAY[d.getDay()] ?? ''
}

// ─── Name normalization (mirrors Python's normalize_name) ─────────────────────

function normalizeName(raw: string): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── QB Time — excluded jobcode_1 values ─────────────────────────────────────

const EXCLUDE_JOBS = new Set([
  'Lunch break', 'Holiday Paid', 'Sick', 'Admin', 'Office',
  'Lunck Break Paid', 'Lunch Break Paid', 'Lunch Break Office', 'Holiday',
])
const IGNORE_PARTS = new Set(['Admin', 'Office', 'TRANSPORT'])

// ─── Domain types ─────────────────────────────────────────────────────────────

type Company = 'framing' | 'hvac' | 'foundation' | 'pcg'
type PageState = 'menu' | 'mapping' | 'run' | 'results'

type NormEntry = {
  id: number
  driver_id: string   // 4-digit string, e.g. "0208"
  wex_name: string    // display name (from WEX file)
  qb_name: string     // normalized QB Time name for matching
  company: Company
  is_active: boolean
}

// Parsed row from QB Time CSV
type QbRow = {
  date: string             // YYYY-MM-DD (local_date)
  fullNameNorm: string     // FNAME LNAME normalized uppercase
  displayName: string      // "Fname Lname" as-is (for UI)
  address: string          // "jobcode_1, jobcode_2, ..."
}

// Result row per WEX transaction
type ResultRow = {
  txDate: string
  weekday: string
  txTime: string
  cardNumber: string
  units: number
  unitOfMeasure: string
  unitCost: number
  totalFuelCost: number
  merchantCity: string
  driverId: string              // Driver Prompt ID (for override lookup)
  driverWexName: string         // "Driver Full Name (Padrão do Wex)"
  driverQbName: string          // "full_name (Padrão do Quickbooks)"
  obrasTrabalhadas: string      // pipe-separated obras
  qtyObras: number
  costPerJobcode: number
  isOffice: boolean             // true when fell back to Office
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function buildQbIndex(qbRows: QbRow[]): Map<string, string[]> {
  // key: "YYYY-MM-DD|FULLNAMENORM" → unique obra addresses[]
  const map = new Map<string, string[]>()
  for (const r of qbRows) {
    const key = `${r.date}|${r.fullNameNorm}`
    const existing = map.get(key) ?? []
    if (!existing.includes(r.address)) existing.push(r.address)
    map.set(key, existing)
  }
  return map
}

function runAllocation(
  wexText: string,
  qbRows: QbRow[],
  normMap: Map<string, NormEntry>,         // driver_id → NormEntry
  fromDate: string,
  toDate: string,
  overrides: Record<string, string> = {}   // driver_id → QB display name (runtime)
): ResultRow[] {
  const { headers, rows } = parseCsv(wexText)
  const qbIdx = buildQbIndex(qbRows)

  const results: ResultRow[] = []

  for (const row of rows) {
    const getCol = (name: string) => (row[idx(headers, name)] ?? '').trim()

    const rawDate = getCol('Transaction Date')
    const isoDate = toIso(rawDate)
    if (!isoDate) continue
    if (fromDate && isoDate < fromDate) continue
    if (toDate && isoDate > toDate) continue

    // Driver full name: prefer Emboss Line 2
    const emboss = getCol('Emboss Line 2')
    const driverFName = getCol('Driver First Name')
    const driverLName = getCol('Driver Last Name')
    const driverWexName = emboss || `${driverFName} ${driverLName}`.trim()

    // Driver Prompt ID → normalized QB name
    const rawId = getCol('Driver Prompt ID')
    const driverId = rawId.replace(/\s/g, '')
    const normDriverId = driverId.padStart(4, '0')
    const normEntry = normMap.get(driverId) ?? normMap.get(normDriverId)

    // Resolve QB name: DB mapping → runtime override → fallback
    let driverQbName = normEntry
      ? (normEntry.qb_name === 'Sem QB Time' || normEntry.qb_name === '-' ? '' : normEntry.qb_name)
      : normalizeName(driverWexName)

    // Apply runtime override if provided for this driver
    const overrideVal = overrides[normDriverId]
    if (overrideVal && overrideVal !== '__office__') driverQbName = overrideVal
    // '__office__' override: skip QB lookup entirely (intentional Office)
    const forceOffice = overrideVal === '__office__'

    const driverQbNorm = normalizeName(driverQbName)
    const qbKey = `${isoDate}|${driverQbNorm}`
    const obras = forceOffice ? [] : (qbIdx.get(qbKey) ?? [])
    const uniqueObras = [...new Set(obras)].sort()

    const totalCost = parseFloat(getCol('Total Fuel Cost').replace(/[^0-9.-]/g, '')) || 0
    const isOffice = uniqueObras.length === 0
    const finalObras = isOffice ? ['Office'] : uniqueObras
    const qtyObras = finalObras.length
    const costPer = totalCost / qtyObras

    results.push({
      txDate: rawDate,
      weekday: weekday(isoDate),
      txTime: getCol('Transaction Time'),
      cardNumber: getCol('Card Number'),
      units: parseFloat(getCol('Units').replace(/[^0-9.-]/g, '')) || 0,
      unitOfMeasure: getCol('Unit of Measure'),
      unitCost: parseFloat(getCol('Unit Cost').replace(/[^0-9.-]/g, '')) || 0,
      totalFuelCost: totalCost,
      merchantCity: getCol('Merchant City'),
      driverId: normDriverId,
      driverWexName,
      driverQbName: driverQbName || driverWexName,
      obrasTrabalhadas: finalObras.join(' | '),
      qtyObras,
      costPerJobcode: costPer,
      isOffice,
    })
  }

  return results
}

// ─── QB Time parser ───────────────────────────────────────────────────────────

function parseQbTime(text: string): QbRow[] {
  const { headers, rows } = parseCsv(text)

  const fI = idx(headers, 'fname')
  const lI = idx(headers, 'lname')
  const dI = idx(headers, 'local_date')
  const j1 = idx(headers, 'jobcode_1')
  const j2 = idx(headers, 'jobcode_2')
  const j3 = idx(headers, 'jobcode_3')
  const j4 = idx(headers, 'jobcode_4')

  if (fI === -1 || lI === -1 || dI === -1 || j1 === -1) return []

  const result: QbRow[] = []
  for (const row of rows) {
    const jc1 = (row[j1] ?? '').trim()
    if (EXCLUDE_JOBS.has(jc1)) continue

    const date = (row[dI] ?? '').trim().split('T')[0]
    if (!date) continue

    const fname = (row[fI] ?? '').trim()
    const lname = (row[lI] ?? '').trim()
    const fullNameNorm = normalizeName(`${fname} ${lname}`)

    const jcols = [j1, j2, j3, j4]
      .map(i => (i >= 0 ? (row[i] ?? '').trim() : ''))
      .filter(v => v && !IGNORE_PARTS.has(v))
    if (jcols.length === 0) continue

    result.push({ date, fullNameNorm, displayName: `${fname} ${lname}`.trim(), address: jcols.join(', ') })
  }
  return result
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportToExcel(rows: ResultRow[], company: Company) {
  const data = [
    ['Transaction Date', 'Weekday', 'Transaction Time', 'Card Number',
     'Units', 'Unit of Measure', 'Unit Cost', 'Total Fuel Cost', 'Merchant City',
     'Driver Full Name (Padrão do Wex)', 'full_name (Padrão do Quickbooks)',
     'Obras Trabalhadas', 'Qty_Obras', 'Cost_Per_Jobcode'],
    ...rows.map(r => [
      r.txDate, r.weekday, r.txTime, r.cardNumber,
      r.units, r.unitOfMeasure, r.unitCost, r.totalFuelCost, r.merchantCity,
      r.driverWexName, r.driverQbName,
      r.obrasTrabalhadas, r.qtyObras, r.costPerJobcode
    ])
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, company.toUpperCase())
  XLSX.writeFile(wb, `wex_${company}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── File Drop Zone ────────────────────────────────────────────────────────────

function FileDropZone({ label, accept, fileName, onFile }: {
  label: string; accept: string; fileName: string; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      style={{
        border: `2px dashed ${dragging ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
        borderRadius: 10, padding: '24px 20px', textAlign: 'center', cursor: 'pointer',
        background: dragging ? 'rgba(46,107,230,0.06)' : 'var(--color-background-secondary)',
        transition: 'all 0.15s', userSelect: 'none',
      }}
    >
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      {fileName ? (
        <>
          <i className="bi bi-file-earmark-check" style={{ fontSize: 26, color: '#10B981', display: 'block', marginBottom: 6 }} />
          <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 14 }}>{fileName}</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 3 }}>Click or drop to replace</div>
        </>
      ) : (
        <>
          <i className="bi bi-cloud-upload" style={{ fontSize: 26, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }} />
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{label}</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 3 }}>Drag & drop or click to select</div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const COMPANIES: Company[] = ['framing', 'hvac', 'foundation', 'pcg']

export default function WexCategorization() {
  const navigate = useNavigate()

  // Layout
  const [theme, setTheme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light')
  const [user, setUser] = useState<User | null>(null)
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [role, setRole] = useState('')
  const [pageState, setPageState] = useState<PageState>('menu')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Company selector (persistent across sections)
  const [company, setCompany] = useState<Company>('framing')

  // Mapping section
  const [normEntries, setNormEntries] = useState<NormEntry[]>([])
  const [mappingLoading, setMappingLoading] = useState(false)
  const [newId, setNewId] = useState('')
  const [newWexName, setNewWexName] = useState('')
  const [newQbName, setNewQbName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editDriverId, setEditDriverId] = useState('')
  const [editWexName, setEditWexName] = useState('')
  const [editQbName, setEditQbName] = useState('')

  // Run section
  const [wexText, setWexText] = useState('')
  const [wexFileName, setWexFileName] = useState('')
  const [wexPreview, setWexPreview] = useState<{ txCount: number; employees: string[]; total: number } | null>(null)
  const [wexError, setWexError] = useState('')

  const [qbRows, setQbRows] = useState<QbRow[]>([])
  const [qbFileName, setQbFileName] = useState('')
  const [qbPreview, setQbPreview] = useState<{ entries: number; employees: string[] } | null>(null)
  const [qbError, setQbError] = useState('')

  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Results
  const [results, setResults] = useState<ResultRow[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runtimeOverrides, setRuntimeOverrides] = useState<Record<string, string>>({}) // driverId → qb display name
  const [runCompany, setRunCompany] = useState<Company | null>(null) // null = nenhuma empresa selecionada ainda

  // ── Auth & theme ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUser(user)
      supabase.from('usuarios').select('id, nome_completo').eq('email', user.email).single()
        .then(({ data: u }) => {
          if (!u) return
          setNomeCompleto(u.nome_completo)
          supabase.from('perfis').select('tipo').eq('usuario_id', u.id).single()
            .then(({ data: p }) => { if (p) setRole(p.tipo) })
        })
    })
  }, [])

  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 })
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // ── Normalization CRUD ────────────────────────────────────────────────────
  const fetchNorm = async (c: Company = company) => {
    setMappingLoading(true)
    const { data } = await supabase
      .from('wex_normalization')
      .select('*')
      .eq('company', c)
      .order('driver_id')
    if (data) setNormEntries(data as NormEntry[])
    setMappingLoading(false)
  }

  useEffect(() => { fetchNorm(company) }, [company])

  const normMap = new Map<string, NormEntry>(normEntries.map(e => [e.driver_id, e]))

  const handleAdd = async () => {
    if (!newId.trim() || !newQbName.trim()) {
      setToast({ type: 'error', text: 'Driver ID and QB Name are required.' })
      return
    }
    const driverId = newId.trim().padStart(4, '0')
    const { error } = await supabase.from('wex_normalization').insert([{
      driver_id: driverId,
      wex_name: newWexName.trim() || null,
      qb_name: newQbName.trim(),
      company,
      is_active: true,
    }])
    if (error) { setToast({ type: 'error', text: error.message }); return }
    setNewId(''); setNewWexName(''); setNewQbName('')
    setToast({ type: 'success', text: 'Entry added.' })
    fetchNorm()
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this entry?')) return
    await supabase.from('wex_normalization').delete().eq('id', id)
    fetchNorm()
  }

  const handleSaveEdit = async () => {
    if (editId === null) return
    const { error } = await supabase.from('wex_normalization').update({
      driver_id: editDriverId.padStart(4, '0'),
      wex_name: editWexName.trim() || null,
      qb_name: editQbName.trim(),
    }).eq('id', editId)
    if (error) { setToast({ type: 'error', text: error.message }); return }
    setEditId(null)
    fetchNorm()
  }

  const startEdit = (e: NormEntry) => {
    setEditId(e.id)
    setEditDriverId(e.driver_id)
    setEditWexName(e.wex_name ?? '')
    setEditQbName(e.qb_name)
  }

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleWexFile = async (file: File) => {
    setWexFileName(file.name); setWexError('')
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)

      // Validate required columns
      const required = ['Transaction Date', 'Driver Prompt ID', 'Total Fuel Cost']
      const missing = required.filter(c => idx(headers, c) === -1)
      if (missing.length > 0) {
        setWexError(`Missing columns: ${missing.join(', ')}. Found: ${headers.slice(0, 8).join(', ')}…`)
        return
      }

      setWexText(text)

      // Build preview
      let total = 0
      const employees = new Set<string>()
      for (const row of rows) {
        const emboss = (row[idx(headers, 'Emboss Line 2')] ?? '').trim()
        const fName = (row[idx(headers, 'Driver First Name')] ?? '').trim()
        const lName = (row[idx(headers, 'Driver Last Name')] ?? '').trim()
        employees.add(emboss || `${fName} ${lName}`.trim())
        total += parseFloat((row[idx(headers, 'Total Fuel Cost')] ?? '').replace(/[^0-9.-]/g, '')) || 0
      }
      setWexPreview({ txCount: rows.length, employees: [...employees].filter(Boolean), total })
    } catch (e) { setWexError('Failed to parse: ' + String(e)) }
  }

  const handleQbFile = async (file: File) => {
    setQbFileName(file.name); setQbError('')
    try {
      const text = await file.text()
      const { headers } = parseCsv(text)

      const required = ['fname', 'lname', 'local_date', 'jobcode_1']
      const missing = required.filter(c => idx(headers, c) === -1)
      if (missing.length > 0) {
        setQbError(`Missing columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`)
        return
      }

      const parsed = parseQbTime(text)
      setQbRows(parsed)
      const employees = [...new Set(parsed.map(r => r.fullNameNorm))]
      setQbPreview({ entries: parsed.length, employees })
    } catch (e) { setQbError('Failed to parse: ' + String(e)) }
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  const handleRun = (overridesArg?: Record<string, string>) => {
    if (!wexText) { setToast({ type: 'error', text: 'Upload the WEX file first.' }); return }
    if (qbRows.length === 0) { setToast({ type: 'error', text: 'Upload the QB Time file first.' }); return }
    setIsRunning(true)
    setTimeout(() => {
      try {
        const effectiveOverrides = overridesArg ?? runtimeOverrides
        const rows = runAllocation(wexText, qbRows, normMap, filterFrom, filterTo, effectiveOverrides)
        setResults(rows)
        const officeCount = rows.filter(r => r.isOffice).length
        const msg = officeCount > 0
          ? `${rows.length} transações — ${officeCount} sem obras (→ Office)`
          : `${rows.length} transações processadas.`
        setToast({ type: officeCount > 0 ? 'error' : 'success', text: msg })
      } catch (e) {
        setToast({ type: 'error', text: 'Error: ' + String(e) })
      }
      setIsRunning(false)
    }, 0)
  }

  // Apply a runtime override: save to DB + re-run immediately
  const handleOverride = async (driverId: string, qbDisplayName: string) => {
    const newOverrides = { ...runtimeOverrides, [driverId]: qbDisplayName }
    setRuntimeOverrides(newOverrides)
    handleRun(newOverrides)

    // Persist to wex_normalization
    const wexName = unresolvedDrivers.find(d => d.driverId === driverId)?.wexName ?? ''
    const qbNameToSave = qbDisplayName === '__office__' ? 'Sem QB Time' : qbDisplayName
    const { error } = await supabase.from('wex_normalization').upsert({
      driver_id: driverId,
      wex_name: wexName,
      qb_name: qbNameToSave,
      company: runCompany!,
      is_active: true,
    }, { onConflict: 'driver_id,company' })

    if (error) {
      setToast({ type: 'error', text: `Erro ao salvar mapeamento: ${error.message}` })
    } else {
      setToast({ type: 'success', text: `Mapeamento de "${wexName}" salvo.` })
      fetchNorm() // refresh mapping table
    }
  }

  // Derived: QB employees available for override selection
  const qbEmployeeOptions = [...new Map(qbRows.map(r => [r.fullNameNorm, r.displayName])).values()].sort()

  // Derived: unique unresolved drivers (fell back to Office and not intentionally assigned)
  const unresolvedDrivers = (() => {
    const seen = new Map<string, { driverId: string; wexName: string }>()
    for (const r of results) {
      if (r.isOffice && runtimeOverrides[r.driverId] !== '__office__' && !seen.has(r.driverId))
        seen.set(r.driverId, { driverId: r.driverId, wexName: r.driverWexName })
    }
    return [...seen.values()]
  })()

  // ── Dismiss toast ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function renderRoleBadge() {
    const isDark = document.documentElement.classList.contains('dark')
    const badges: Record<string, React.CSSProperties & { label: string }> = {
      dev: { label: 'Developer', borderColor: isDark ? '#BFA100' : '#FFD700', background: 'rgba(255,215,0,0.12)', color: isDark ? '#BFA100' : '#FFD700' },
      manager: { label: 'Manager', borderColor: 'var(--color-accent-primary)', background: 'rgba(46,107,230,0.10)', color: 'var(--color-accent-primary)' },
      gestor: { label: 'Manager', borderColor: 'var(--color-accent-primary)', background: 'rgba(46,107,230,0.10)', color: 'var(--color-accent-primary)' },
      owner: { label: 'Owner', borderColor: isDark ? '#10B981' : '#059669', background: 'rgba(16,185,129,0.12)', color: isDark ? '#10B981' : '#059669' },
    }
    const b = badges[role]
    if (!b) return null
    const { label, ...style } = b
    return <span style={{ borderRadius: 20, padding: '4px 14px', fontWeight: 600, fontSize: 12, border: '1px solid', ...style }}>{label}</span>
  }

  // ── Section: Company selector strip ──────────────────────────────────────
  function CompanyStrip() {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginRight: 4 }}>Company:</span>
        {COMPANIES.map(c => (
          <button key={c} onClick={() => setCompany(c)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: '1.5px solid', transition: 'all 0.15s',
              borderColor: company === c ? 'var(--color-accent-primary)' : 'var(--color-border-divider)',
              background: company === c ? 'rgba(46,107,230,0.12)' : 'transparent',
              color: company === c ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
              textTransform: 'capitalize',
            }}
          >{c}</button>
        ))}
      </div>
    )
  }

  // ── Section renders ───────────────────────────────────────────────────────

  const renderMenu = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-text-primary)', fontWeight: 400, margin: '0 0 8px' }}>WEX Fuel Cost Categorization</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: 0 }}>
          Match WEX fuel transactions to QB Time job sites and distribute costs per obra.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: 'bi-people-fill', label: 'Driver Mapping', desc: 'Map Driver IDs to QB Time names', state: 'mapping' as PageState },
          { icon: 'bi-play-circle-fill', label: 'Run', desc: 'Upload WEX + QB Time and process', state: 'run' as PageState },
          { icon: 'bi-table', label: 'Results', desc: 'View last allocation output', state: 'results' as PageState, disabled: results.length === 0 },
        ].map(card => (
          <div key={card.state} onClick={() => !card.disabled && setPageState(card.state)}
            className={card.disabled ? '' : 'hover-card'}
            style={{
              width: 220, height: 180, background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-divider)', borderRadius: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: card.disabled ? 'default' : 'pointer', opacity: card.disabled ? 0.4 : 1,
              boxShadow: '0 4px 6px rgba(0,0,0,0.05)', transition: 'transform 0.2s',
            }}>
            <i className={`bi ${card.icon}`} style={{ fontSize: 44, color: 'var(--color-accent-primary)', marginBottom: 14 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>{card.label}</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, textAlign: 'center', margin: 0, padding: '0 12px' }}>{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )

  const renderMapping = () => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--color-text-primary)', fontSize: 22, fontWeight: 400, margin: 0 }}>Driver Mapping</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
            Map each WEX <strong>Driver Prompt ID</strong> to the corresponding QB Time employee name.
          </p>
        </div>
        <CompanyStrip />
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Add form */}
        <div style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h4 style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Add New Entry</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Driver ID</label>
              <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="e.g. 6712"
                style={inputStyle} className="custom-input" />
            </div>
            <div>
              <label style={labelStyle}>WEX Display Name</label>
              <input value={newWexName} onChange={e => setNewWexName(e.target.value)} placeholder="e.g. Jose Honorio"
                style={inputStyle} className="custom-input" />
            </div>
            <div>
              <label style={labelStyle}>QB Time Name (for matching)</label>
              <input value={newQbName} onChange={e => setNewQbName(e.target.value)} placeholder="e.g. JOSE NETO"
                style={inputStyle} className="custom-input" />
            </div>
            <button onClick={handleAdd} className="btn-primary-custom"
              style={{ height: 38, padding: '0 20px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
              <i className="bi bi-plus-lg" style={{ marginRight: 6 }} />Add
            </button>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, margin: '10px 0 0' }}>
            Use <strong>"Sem QB Time"</strong> as QB Name for drivers without QB Time entries (cost will be unallocated).
          </p>
        </div>

        {/* Table */}
        {mappingLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>Loading…</div>
        ) : (
          <div style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border-divider)' }}>
                  {['Driver ID', 'WEX Name', 'QB Time Name', 'Company', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderRight: '1px solid var(--color-border-divider)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {normEntries.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>No entries for {company}. Add above.</td></tr>
                )}
                {normEntries.map(e => editId === e.id ? (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'rgba(46,107,230,0.04)' }}>
                    <td style={{ padding: '8px 16px', borderRight: '1px solid var(--color-border-divider)' }}>
                      <input value={editDriverId} onChange={e2 => setEditDriverId(e2.target.value)} style={{ ...inputStyle, width: 80 }} />
                    </td>
                    <td style={{ padding: '8px 16px', borderRight: '1px solid var(--color-border-divider)' }}>
                      <input value={editWexName} onChange={e2 => setEditWexName(e2.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </td>
                    <td style={{ padding: '8px 16px', borderRight: '1px solid var(--color-border-divider)' }}>
                      <input value={editQbName} onChange={e2 => setEditQbName(e2.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </td>
                    <td style={{ padding: '8px 16px', color: 'var(--color-text-secondary)', textTransform: 'capitalize', borderRight: '1px solid var(--color-border-divider)' }}>{e.company}</td>
                    <td style={{ padding: '8px 16px' }}>
                      <button onClick={handleSaveEdit} className="btn-primary-custom" style={{ marginRight: 8, padding: '4px 14px', borderRadius: 6, fontSize: 12 }}>Save</button>
                      <button onClick={() => setEditId(null)} className="btn-secondary-custom" style={{ padding: '4px 14px', borderRadius: 6, fontSize: 12 }}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border-divider)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-accent-primary)', fontSize: 14, borderRight: '1px solid var(--color-border-divider)' }}>{e.driver_id}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--color-text-primary)', borderRight: '1px solid var(--color-border-divider)' }}>{e.wex_name ?? <span style={{ color: 'var(--color-text-secondary)' }}>—</span>}</td>
                    <td style={{ padding: '10px 16px', borderRight: '1px solid var(--color-border-divider)' }}>
                      <span style={{
                        color: e.qb_name === 'Sem QB Time' || e.qb_name === '-' ? '#ef4444' : 'var(--color-text-primary)',
                        fontWeight: e.qb_name === 'Sem QB Time' || e.qb_name === '-' ? 400 : 500
                      }}>{e.qb_name}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)', textTransform: 'capitalize', borderRight: '1px solid var(--color-border-divider)' }}>{e.company}</td>
                    <td style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(e)} className="btn-secondary-custom" style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12 }}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer' }}>
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )

  const renderRun = () => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h2 style={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 400, margin: 0 }}>Run Allocation</h2>
      </div>

      {/* ── Company + uploads + run ── */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-border-divider)', alignItems: 'stretch' }}>

        {/* Company selector */}
        <div style={{ flexShrink: 0, width: 160, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: 0.5, marginBottom: 4 }}>Empresa</span>
          {COMPANIES.map(c => (
            <button key={c} onClick={() => { setRunCompany(c); setCompany(c) }}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid', transition: 'all 0.15s', textAlign: 'left', textTransform: 'capitalize',
                borderColor: runCompany === c ? 'var(--color-accent-primary)' : 'var(--color-border-divider)',
                background: runCompany === c ? 'rgba(46,107,230,0.12)' : 'transparent',
                color: runCompany === c ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
              }}
            >{c}</button>
          ))}
          {runCompany && normEntries.length === 0 && (
            <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 4 }} />
              <button onClick={() => setPageState('mapping')} style={{ background: 'none', border: 'none', color: '#F59E0B', cursor: 'pointer', fontWeight: 700, fontSize: 11, padding: 0, textDecoration: 'underline' }}>Sem mapeamentos →</button>
            </div>
          )}
          {!runCompany && (
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '6px 0 0', fontStyle: 'italic' }}>Selecione a empresa para continuar</p>
          )}
        </div>

        {/* WEX */}
        <div style={{ flex: 1, background: 'var(--color-background-primary)', border: `1px solid ${wexText ? '#10B981' : 'var(--color-border-divider)'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: runCompany ? 1 : 0.4, pointerEvents: runCompany ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: 0.5 }}>WEX Report</span>
            {wexText && <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>✓ Loaded</span>}
          </div>
          <FileDropZone label="Drop WEX CSV here" accept=".csv,text/csv" fileName={wexFileName} onFile={handleWexFile} />
          {wexError && <p style={{ ...errStyle, margin: 0 }}><i className="bi bi-exclamation-circle" style={{ marginRight: 5 }} />{wexError}</p>}
          {wexPreview && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>{wexPreview.txCount}</strong> transactions</span>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>{wexPreview.employees.length}</strong> drivers</span>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>${wexPreview.total.toFixed(2)}</strong> total</span>
            </div>
          )}
        </div>

        {/* QB Time */}
        <div style={{ flex: 1, background: 'var(--color-background-primary)', border: `1px solid ${qbRows.length > 0 ? '#10B981' : 'var(--color-border-divider)'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: runCompany ? 1 : 0.4, pointerEvents: runCompany ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: 0.5 }}>QuickBooks Time</span>
            {qbRows.length > 0 && <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>✓ Loaded</span>}
          </div>
          <FileDropZone label="Drop QB Time CSV here" accept=".csv,text/csv" fileName={qbFileName} onFile={handleQbFile} />
          {qbError && <p style={{ ...errStyle, margin: 0 }}><i className="bi bi-exclamation-circle" style={{ marginRight: 5 }} />{qbError}</p>}
          {qbPreview && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>{qbPreview.entries}</strong> entries</span>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>{qbPreview.employees.length}</strong> employees</span>
              <span style={{ fontStyle: 'italic' }}>Lunch/Holiday filtered out</span>
            </div>
          )}
        </div>

        {/* Run button */}
        <div style={{ flexShrink: 0, width: 140, display: 'flex', alignItems: 'stretch' }}>
          <button onClick={() => handleRun()} disabled={isRunning || !runCompany || !wexText || qbRows.length === 0}
            className="btn-primary-custom"
            style={{ width: '100%', borderRadius: 10, fontWeight: 700, fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: (isRunning || !runCompany || !wexText || qbRows.length === 0) ? 0.5 : 1 }}>
            <i className={`bi ${isRunning ? 'bi-hourglass-split' : 'bi-play-fill'}`} style={{ fontSize: 28 }} />
            {isRunning ? 'Processando…' : 'Run Allocation'}
          </button>
        </div>
      </div>

      {/* ── Resolve unmatched drivers ── */}
      {unresolvedDrivers.length > 0 && (
        <div style={{ flexShrink: 0, padding: '10px 16px', borderBottom: '1px solid var(--color-border-divider)', background: 'rgba(245,158,11,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
            {unresolvedDrivers.length} motorista{unresolvedDrivers.length > 1 ? 's' : ''} não identificado{unresolvedDrivers.length > 1 ? 's' : ''} no QuickBooks Time — selecione o correspondente
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '6px 12px' }}>
            {unresolvedDrivers.map(d => (
              <div key={d.driverId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 7, padding: '5px 10px' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 0 auto', maxWidth: 120 }} title={d.wexName}>{d.wexName}</span>
                <i className="bi bi-arrow-right" style={{ fontSize: 10, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                <select
                  value={runtimeOverrides[d.driverId] ?? ''}
                  onChange={e => { if (e.target.value) handleOverride(d.driverId, e.target.value) }}
                  style={{ flex: 1, minWidth: 0, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border-divider)', background: 'var(--color-background-secondary)', color: runtimeOverrides[d.driverId] ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}
                >
                  <option value="">— selecionar —</option>
                  <option value="__office__">Office</option>
                  {qbEmployeeOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results table — fills remaining space ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Table header bar */}
        <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {results.length > 0
              ? <>{results.length} transactions &nbsp;·&nbsp; ${results.reduce((s, r) => s + r.totalFuelCost, 0).toFixed(2)} total &nbsp;·&nbsp; {results.filter(r => r.isOffice).length > 0 && <span style={{ color: '#F59E0B' }}>{results.filter(r => r.isOffice).length} → Office</span>}</>
              : <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>Results will appear here after running</span>
            }
          </span>
          {results.length > 0 && (
            <button onClick={() => exportToExcel(results, company)} className="btn-secondary-custom"
              style={{ padding: '5px 14px', borderRadius: 7, fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="bi bi-file-earmark-excel" />Export Excel
            </button>
          )}
        </div>

        {/* Scrollable table */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border-divider)' }}>
                {['Date', 'Day', 'Driver (WEX)', 'QB Time Name', 'Total Cost', 'Obras Trabalhadas', 'Qty', 'Cost / Obra', 'City'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border-divider)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <i className="bi bi-play-circle" style={{ fontSize: 32, display: 'block', marginBottom: 10, opacity: 0.3 }} />
                    Upload both files and click Run Allocation
                  </td>
                </tr>
              )}
              {results.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border-divider)', background: r.isOffice ? 'rgba(245,158,11,0.04)' : i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border-divider)' }}>{r.txDate}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border-divider)' }}>{r.weekday.slice(0, 3)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border-divider)' }}>{r.driverWexName}</td>
                  <td style={{ padding: '8px 12px', borderRight: '1px solid var(--color-border-divider)', color: r.driverQbName ? 'var(--color-text-primary)' : '#ef4444', fontStyle: r.driverQbName ? 'normal' : 'italic' }}>
                    {r.driverQbName || 'no mapping'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border-divider)' }}>${r.totalFuelCost.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', borderRight: '1px solid var(--color-border-divider)', color: r.isOffice ? '#F59E0B' : 'var(--color-text-primary)', fontStyle: r.isOffice ? 'italic' : 'normal', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={r.obrasTrabalhadas}>
                    {r.obrasTrabalhadas}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border-divider)' }}>{r.qtyObras || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-accent-primary)', whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border-divider)' }}>
                    {r.qtyObras > 0 ? `$${r.costPerJobcode.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>{r.merchantCity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const renderResults = () => {
    const totalCost = results.reduce((s, r) => s + r.totalFuelCost, 0)
    const unmatched = results.filter(r => !r.obrasTrabalhadas)
    const unmatchedCost = unmatched.reduce((s, r) => s + r.totalFuelCost, 0)

    // Cost by obra (exploded)
    const byObra = new Map<string, number>()
    for (const r of results) {
      if (!r.obrasTrabalhadas) continue
      for (const obra of r.obrasTrabalhadas.split(' | ')) {
        const o = obra.trim()
        if (o) byObra.set(o, (byObra.get(o) ?? 0) + r.costPerJobcode)
      }
    }
    const obraSummary = [...byObra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: 'var(--color-text-primary)', fontSize: 22, fontWeight: 400, margin: 0 }}>Results — {company.toUpperCase()}</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
              {results.length} transactions · {[...new Set(results.map(r => r.driverQbName).filter(Boolean))].length} drivers matched
            </p>
          </div>
          <button onClick={() => exportToExcel(results, company)} className="btn-secondary-custom"
            style={{ padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-file-earmark-excel" />Export Excel
          </button>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
            {[
              { icon: 'bi-currency-dollar', label: 'Total Fuel Cost', value: `$${totalCost.toFixed(2)}` },
              { icon: 'bi-building', label: 'Unique Obras', value: byObra.size },
              { icon: 'bi-receipt', label: 'Transactions', value: results.length },
              { icon: 'bi-exclamation-triangle', label: 'Unallocated', value: `$${unmatchedCost.toFixed(2)}`, warn: unmatchedCost > 0 },
            ].map(c => (
              <div key={c.label} style={{ flex: '1 1 150px', background: 'var(--color-background-primary)', border: `1px solid ${c.warn ? '#ef4444' : 'var(--color-border-divider)'}`, borderRadius: 10, padding: '14px 18px' }}>
                <i className={`bi ${c.icon}`} style={{ fontSize: 18, color: c.warn ? '#ef4444' : 'var(--color-accent-primary)', display: 'block', marginBottom: 6 }} />
                <div style={{ fontSize: 20, fontWeight: 700, color: c.warn ? '#ef4444' : 'var(--color-text-primary)' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Obra bar chart */}
          {obraSummary.length > 0 && (
            <div style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <h4 style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Cost by Obra (top {obraSummary.length})</h4>
              {obraSummary.map(([obra, cost]) => {
                const pct = totalCost > 0 ? cost / totalCost : 0
                return (
                  <div key={obra} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                    <span style={{ minWidth: 260, fontSize: 12, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={obra}>{obra}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--color-background-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: 'var(--color-accent-primary)', borderRadius: 4 }} />
                    </div>
                    <span style={{ minWidth: 72, fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'right' }}>${cost.toFixed(2)}</span>
                    <span style={{ minWidth: 40, fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{(pct * 100).toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Unmatched warning */}
          {unmatched.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 18px', marginBottom: 20 }}>
              <p style={{ color: '#ef4444', fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>
                <i className="bi bi-exclamation-triangle" style={{ marginRight: 8 }} />
                {unmatched.length} transaction(s) with no QB Time obras (${unmatchedCost.toFixed(2)})
              </p>
              <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>
                Drivers: {[...new Set(unmatched.map(r => `${r.driverWexName} (ID: ${r.cardNumber})`))].join(', ')}
              </p>
            </div>
          )}

          {/* Transaction table */}
          <div style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border-divider)' }}>
                  {['Date', 'Day', 'Driver (WEX)', 'QB Time Name', 'Total Cost', 'Obras', 'Qty', 'Cost/Obra', 'City'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>No results. Run the allocation first.</td></tr>
                )}
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border-divider)', background: !r.obrasTrabalhadas ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{r.txDate}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--color-text-secondary)' }}>{r.weekday.slice(0, 3)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{r.driverWexName}</td>
                    <td style={{ padding: '9px 12px', color: r.driverQbName ? 'var(--color-text-primary)' : '#ef4444' }}>
                      {r.driverQbName || '— no mapping —'}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--color-text-primary)', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>${r.totalFuelCost.toFixed(2)}</td>
                    <td style={{ padding: '9px 12px', color: r.obrasTrabalhadas ? 'var(--color-text-primary)' : '#ef4444', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.obrasTrabalhadas || 'No obras found'}>
                      {r.obrasTrabalhadas || '— no obras —'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{r.qtyObras || '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-accent-primary)', whiteSpace: 'nowrap' }}>
                      {r.qtyObras > 0 ? `$${r.costPerJobcode.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--color-text-secondary)' }}>{r.merchantCity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div onClick={() => setToast(null)} style={{
          position: 'fixed', top: 72, right: 20, zIndex: 2000,
          background: toast.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
          color: '#fff', padding: '10px 18px', borderRadius: 9, fontSize: 14, fontWeight: 500,
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 420
        }}>
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle' : 'bi-x-circle'}`} style={{ fontSize: 16 }} />
          {toast.text}
        </div>
      )}

      {/* Header */}
      <header style={{ width: '100%', height: 64, background: 'var(--color-background-primary)', borderBottom: '1.5px solid var(--color-border-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 0 0', position: 'fixed', top: 0, left: 0, zIndex: 1000, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: 215, minWidth: 215, height: '100%', justifyContent: 'center', borderRight: '1.5px solid var(--color-border-divider)' }}>
          <img src={theme === 'dark' ? logoWhite : logoBlack} alt="Logo" style={{ width: '75%', height: 'auto', objectFit: 'contain' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 20, letterSpacing: 0.5 }}>WEX Categorization</span>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>Fuel cost allocation by obra</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 16 }}>{nomeCompleto || user?.email}</span>
          {renderRoleBadge()}
          <button type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16 }}>
            <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`} />
          </button>
          <button onClick={() => { supabase.auth.signOut(); sessionStorage.clear(); navigate('/login') }}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16 }} title="Sign out">
            <i className="bi bi-door-open" />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{ position: 'fixed', top: 64, left: 0, width: 215, minWidth: 215, height: 'calc(100vh - 64px)', background: 'var(--color-background-primary)', borderRight: '1.5px solid var(--color-border-divider)', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '10px 10px 0' }}>
          <button className="btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2"
            style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
            onClick={() => navigate('/dashboard')}>
            <i className="bi bi-grid" style={{ fontSize: 14 }} />Dashboard
          </button>
          <div style={{ width: '100%', height: 1, background: 'var(--color-border-divider)', margin: '8px 0' }} />

          {([
            { state: 'menu', icon: 'bi-house', label: 'Home' },
            { state: 'mapping', icon: 'bi-people-fill', label: 'Driver Mapping' },
            { state: 'run', icon: 'bi-play-circle', label: 'Run' },
            { state: 'results', icon: 'bi-table', label: 'Results', disabled: results.length === 0 },
          ] as { state: PageState; icon: string; label: string; disabled?: boolean }[]).map(item => (
            <button key={item.state}
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2 ${pageState === item.state ? 'btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: item.disabled ? 'default' : 'pointer', opacity: item.disabled ? 0.4 : 1 }}
              onClick={() => !item.disabled && setPageState(item.state)}
              disabled={item.disabled}>
              <i className={`bi ${item.icon}`} style={{ fontSize: 14 }} />{item.label}
            </button>
          ))}

          <div style={{ width: '100%', height: 1, background: 'var(--color-border-divider)', margin: '8px 0' }} />

          {/* Status */}
          <div style={{ padding: '0 12px' }}>
            <small style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Status</small>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
              <div>
                <i className={`bi ${wexText ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ marginRight: 6, color: wexText ? '#10B981' : 'var(--color-border-divider)' }} />
                WEX: {wexText ? `${wexPreview?.txCount ?? '?'} tx` : 'not loaded'}
              </div>
              <div>
                <i className={`bi ${qbRows.length > 0 ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ marginRight: 6, color: qbRows.length > 0 ? '#10B981' : 'var(--color-border-divider)' }} />
                QB Time: {qbRows.length > 0 ? `${qbRows.length} entries` : 'not loaded'}
              </div>
              <div>
                <i className={`bi ${results.length > 0 ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ marginRight: 6, color: results.length > 0 ? '#10B981' : 'var(--color-border-divider)' }} />
                Results: {results.length > 0 ? `${results.length} rows` : 'none'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ marginLeft: 215, marginTop: 64, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {pageState === 'menu' && renderMenu()}
        {pageState === 'mapping' && renderMapping()}
        {pageState === 'run' && renderRun()}
        {pageState === 'results' && renderResults()}
      </main>
    </div>
  )
}

// ─── Small local helpers ──────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', color: 'var(--color-text-secondary)',
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 5
}
const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7, fontSize: 13,
  border: '1px solid var(--color-border-divider)',
  background: 'var(--color-background-secondary)',
  color: 'var(--color-text-primary)', width: '100%'
}
const errStyle: React.CSSProperties = { color: '#ef4444', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center' }
const infoStyle: React.CSSProperties = { color: 'var(--color-text-primary)', fontSize: 13, marginTop: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }

function StepCard({ number, title, subtitle, children }: {
  number: number; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>
          {number}
        </span>
        <div>
          <h4 style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15, margin: '0 0 3px' }}>{title}</h4>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, margin: 0 }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
