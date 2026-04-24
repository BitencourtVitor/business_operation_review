import Cookies from 'js-cookie'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import logoWhite from '../assets/logo_white.png'
import logoBlack from '../assets/logo_black.png'

// ─── CSV parsing ──────────────────────────────────────────────────────────────

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

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const delim = guessDelimiter(text)
  const rowsRaw: string[][] = []
  let row: string[] = [], field = '', inQ = false
  const pushF = () => { row.push(field.trim()); field = '' }
  const pushR = () => { if (row.length) { rowsRaw.push(row); row = [] } }
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
  const headers = (rowsRaw[0] || []).map(h => h.trim())
  return { headers, rows: rowsRaw.slice(1).filter(r => r.some(c => c.trim())) }
}

function parseHours(raw: string): number {
  if (!raw) return 0
  const t = raw.trim()
  if (t.includes(':')) {
    const [h, m] = t.split(':').map(Number)
    return (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m) / 60
  }
  return parseFloat(t) || 0
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MON_WED = new Set(['Mon', 'Tue', 'Wed'])
const LS_EXCLUDED_KEY = 'whc_excluded_categories'

const KNOWN_EXCLUDED_PREFIXES = [
  'Lunch break', 'Lunch Break', 'Lunch Break Paid', 'Lunch Break Office',
  'Lunck Break Paid', 'Holiday Paid', 'Holiday', 'Sick', 'Admin', 'Office',
]

function isKnownExcluded(key: string) {
  return KNOWN_EXCLUDED_PREFIXES.some(p => key === p || key.startsWith(p + ' ›'))
}

function buildJobcodeKey(row: string[], headers: string[]): string {
  return ['jobcode_1', 'jobcode_2', 'jobcode_3', 'jobcode_4']
    .map(col => row[headers.findIndex(h => h === col)]?.trim() || '')
    .filter(Boolean)
    .join(' › ')
}

function loadSavedExcluded(): Set<string> | null {
  try {
    const raw = localStorage.getItem(LS_EXCLUDED_KEY)
    if (!raw) return null
    return new Set(JSON.parse(raw) as string[])
  } catch { return null }
}

function saveExcluded(excluded: Set<string>) {
  try { localStorage.setItem(LS_EXCLUDED_KEY, JSON.stringify([...excluded])) } catch { /* */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EmployeeResult = {
  name: string
  hoursMonWed: number
  surplus: number
  thursFriAvailable: number
}

// ─── Category multi-select dropdown ──────────────────────────────────────────

function CategoryDropdown({
  allCategories,
  excluded,
  onChange,
  disabled,
}: {
  allCategories: string[]
  excluded: Set<string>
  onChange: (next: Set<string>) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)

  function openDropdown() {
    if (disabled) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 400) })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const filtered = allCategories.filter(c => c.toLowerCase().includes(search.toLowerCase()))
  const includedCount = allCategories.length - excluded.size

  function toggle(cat: string) {
    const next = new Set(excluded)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    onChange(next)
  }

  const triggerLabel = disabled
    ? 'Upload a file first'
    : `${includedCount} of ${allCategories.length} included`

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--color-border-divider)',
          background: disabled ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
          color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {triggerLabel}
        </span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 11, flexShrink: 0, marginLeft: 6, color: 'var(--color-text-secondary)' }} />
      </button>

      {open && dropdownPos && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: dropdownPos.left,
          width: dropdownPos.width,
          zIndex: 9999,
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-divider)' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories…"
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--color-border-divider)',
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--color-border-divider)' }}>
            <button
              onClick={() => onChange(new Set(allCategories))}
              style={{ flex: 1, padding: '4px', borderRadius: 5, fontSize: 11, border: '1px solid var(--color-border-divider)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
            >Exclude all</button>
            <button
              onClick={() => onChange(new Set())}
              style={{ flex: 1, padding: '4px', borderRadius: 5, fontSize: 11, border: '1px solid var(--color-border-divider)', background: 'rgba(16,185,129,0.06)', color: '#10B981', cursor: 'pointer', fontWeight: 600 }}
            >Include all</button>
          </div>

          {/* List */}
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 && (
              <p style={{ padding: '12px 12px', fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>No matches</p>
            )}
            {filtered.map(cat => {
              const isExcluded = excluded.has(cat)
              return (
                <label
                  key={cat}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', cursor: 'pointer',
                    background: isExcluded ? 'rgba(239,68,68,0.04)' : 'transparent',
                    borderLeft: `2px solid ${isExcluded ? '#ef4444' : 'transparent'}`,
                  }}
                >
                  <input
                    type="checkbox" checked={isExcluded} onChange={() => toggle(cat)}
                    style={{ accentColor: '#ef4444', width: 13, height: 13, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span
                    title={cat}
                    style={{
                      fontSize: 12, flex: 1,
                      color: isExcluded ? '#ef4444' : 'var(--color-text-primary)',
                      fontWeight: isExcluded ? 500 : 400,
                    }}
                  >{cat}</span>
                </label>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Image export ─────────────────────────────────────────────────────────────

function exportResultsAsImage(
  results: EmployeeResult[],
  hoursPerDay: number,
  fileName: string,
  theme: 'light' | 'dark',
) {
  const dpr    = Math.min(window.devicePixelRatio || 1, 2)
  const W      = 860
  const padX   = 40
  const padY   = 36
  const rowH   = 42
  const thH    = 40
  const titleH = 72
  const statsH = 72
  const footerH= 32
  const H      = padY + titleH + statsH + thH + results.length * rowH + padY + footerH

  const canvas = document.createElement('canvas')
  canvas.width  = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const isDark = theme === 'dark'
  const BG       = isDark ? '#0d0d1a' : '#f1f4f9'
  const CARD     = isDark ? '#1a1a2e' : '#ffffff'
  const T1       = isDark ? '#e2e8f0' : '#1a202c'
  const T2       = isDark ? '#718096' : '#718096'
  const BORDER   = isDark ? '#2d3748' : '#e2e8f0'
  const ACCENT   = '#2e6be6'
  const RED      = '#ef4444'
  const GREEN    = '#10B981'
  const ROWODD   = isDark ? '#131325' : '#f8fafc'

  const cols = [
    { label: 'Employee',          x: padX,             w: 300, align: 'left'   as const },
    { label: 'Hours Mon–Wed',     x: padX + 300,        w: 150, align: 'center' as const },
    { label: 'Surplus',           x: padX + 450,        w: 130, align: 'center' as const },
    { label: 'Thu–Fri Available', x: padX + 580,        w: 200, align: 'center' as const },
  ]

  // Background
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Card background
  ctx.fillStyle = CARD
  roundRect(ctx, padX - 16, padY - 16, W - (padX - 16) * 2, H - padY + 16 - footerH, 14)
  ctx.fill()

  // Title
  ctx.fillStyle = ACCENT
  ctx.font = `600 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText('Weekly Hours Control', padX, padY + 22)
  ctx.fillStyle = T2
  ctx.font = `12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText(`${fileName}  ·  ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`, padX, padY + 44)

  // Stats row
  const sy = padY + titleH
  const sw = (W - padX * 2) / 3 - 8
  const statData = [
    { label: 'Employees',         value: `${results.length}`,       color: ACCENT },
    { label: 'Expected Mon–Wed',  value: `${hoursPerDay * 3}h`,     color: T1 },
    { label: 'Max Thu–Fri',       value: `${hoursPerDay * 2}h`,     color: GREEN },
  ]
  statData.forEach((s, i) => {
    const sx = padX + i * (sw + 8)
    ctx.fillStyle = isDark ? '#111122' : '#f0f4ff'
    roundRect(ctx, sx, sy, sw, statsH - 8, 8)
    ctx.fill()
    ctx.fillStyle = s.color
    ctx.font = `700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(s.value, sx + sw / 2, sy + 28)
    ctx.fillStyle = T2
    ctx.font = `11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.fillText(s.label, sx + sw / 2, sy + 48)
    ctx.textAlign = 'left'
  })

  // Table header
  const ty = sy + statsH
  ctx.fillStyle = isDark ? '#111122' : '#f0f4ff'
  ctx.fillRect(padX - 16, ty, W - (padX - 16) * 2, thH)

  ctx.fillStyle = T2
  ctx.font = `700 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  cols.forEach(col => {
    const label = col.label.toUpperCase()
    if (col.align === 'center') {
      ctx.textAlign = 'center'
      ctx.fillText(label, col.x + col.w / 2, ty + 24)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(label, col.x, ty + 24)
    }
  })
  ctx.textAlign = 'left'

  // Divider
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX - 16, ty + thH)
  ctx.lineTo(W - padX + 16, ty + thH)
  ctx.stroke()

  // Rows
  results.forEach((r, i) => {
    const ry = ty + thH + i * rowH

    if (i % 2 === 1) {
      ctx.fillStyle = ROWODD
      ctx.fillRect(padX - 16, ry, W - (padX - 16) * 2, rowH)
    }

    // Divider
    ctx.strokeStyle = BORDER
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(padX - 16, ry + rowH)
    ctx.lineTo(W - padX + 16, ry + rowH)
    ctx.stroke()

    ctx.font = `500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    const cy = ry + rowH / 2 + 5

    // Employee
    ctx.fillStyle = T1
    ctx.textAlign = 'left'
    ctx.fillText(r.name, cols[0].x, cy)

    // Hours Mon-Wed
    ctx.fillStyle = T1
    ctx.font = `700 14px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(`${r.hoursMonWed}h`, cols[1].x + cols[1].w / 2, cy)

    // Surplus — inverted: positive = red (bad), negative = green (good)
    const surplusColor = r.surplus > 0 ? RED : r.surplus < 0 ? GREEN : T2
    const surplusLabel = `${r.surplus > 0 ? '+' : ''}${r.surplus}h`
    ctx.fillStyle = surplusColor
    ctx.font = `700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    ctx.fillText(surplusLabel, cols[2].x + cols[2].w / 2, cy)

    // Thu-Fri Available
    ctx.fillStyle = r.thursFriAvailable === 0 ? RED : T1
    ctx.font = `700 14px monospace`
    ctx.fillText(`${r.thursFriAvailable}h`, cols[3].x + cols[3].w / 2, cy)

    ctx.textAlign = 'left'
  })

  // Footer
  ctx.fillStyle = T2
  ctx.font = `11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.fillText('Premium Group · Business Operations Review', padX, H - 10)

  const link = document.createElement('a')
  link.download = `weekly-hours-${new Date().toISOString().split('T')[0]}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeeklyHoursControl() {
  const navigate = useNavigate()

  const [theme, setTheme] = useState<'light' | 'dark'>(
    Cookies.get('theme') === 'dark' ? 'dark' : 'light'
  )
  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 })
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const [step, setStep]               = useState<'upload' | 'results'>('upload')
  const [fileName, setFileName]       = useState('')
  const [headers, setHeaders]         = useState<string[]>([])
  const [rows, setRows]               = useState<string[][]>([])
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [excluded, setExcluded]       = useState<Set<string>>(loadSavedExcluded() ?? new Set())
  const [results, setResults]         = useState<EmployeeResult[]>([])
  const [onlyExceeding, setOnlyExceeding] = useState(false)
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [error, setError]             = useState('')
  const [isDragging, setIsDragging]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // persist excluded
  useEffect(() => { saveExcluded(excluded) }, [excluded])

  // auto-recalculate when settings or data change
  useEffect(() => {
    if (!rows.length) return
    const dayIdx   = headers.findIndex(h => h === 'local_day')
    const hoursIdx = headers.findIndex(h => h === 'hours')
    const fnameIdx = headers.findIndex(h => h === 'fname')
    const lnameIdx = headers.findIndex(h => h === 'lname')
    const usernameIdx = headers.findIndex(h => h === 'username')

    const expectedMonWed = hoursPerDay * 3
    const fullWeek       = hoursPerDay * 5
    const map = new Map<string, { name: string; hours: number }>()

    for (const row of rows) {
      const day = row[dayIdx]?.trim()
      if (!MON_WED.has(day)) continue
      const cat = buildJobcodeKey(row, headers)
      if (excluded.has(cat)) continue
      const fname    = row[fnameIdx]?.trim() || ''
      const lname    = row[lnameIdx]?.trim() || ''
      const username = row[usernameIdx]?.trim() || ''
      const key      = username || `${fname} ${lname}`.trim()
      const name     = `${fname} ${lname}`.trim() || username
      if (!map.has(key)) map.set(key, { name, hours: 0 })
      map.get(key)!.hours += parseHours(row[hoursIdx] || '0')
    }

    setResults(
      [...map.values()].map(({ name, hours }) => {
        const h = Math.round(hours * 100) / 100
        return {
          name,
          hoursMonWed: h,
          surplus: Math.round((h - expectedMonWed) * 100) / 100,
          thursFriAvailable: Math.max(0, Math.round((fullWeek - h) * 100) / 100),
        }
      }).sort((a, b) => b.surplus - a.surplus)
    )
  }, [rows, headers, excluded, hoursPerDay])

  // ─── File handling ──────────────────────────────────────────────────────────

  function processFile(file: File) {
    setError('')
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const { headers: h, rows: r } = parseCsvText(text)

        const dayIdx   = h.findIndex(x => x === 'local_day')
        const hoursIdx = h.findIndex(x => x === 'hours')
        const jc1Idx   = h.findIndex(x => x === 'jobcode_1')

        if (jc1Idx === -1 || dayIdx === -1 || hoursIdx === -1) {
          setError('Required columns not found. Make sure this is a QB Time CSV export.')
          return
        }

        const cats = new Set<string>()
        for (const row of r) {
          const key = buildJobcodeKey(row, h)
          if (key) cats.add(key)
        }

        setHeaders(h)
        setRows(r)
        setFileName(file.name)
        setAllCategories([...cats].sort((a, b) => a.localeCompare(b)))

        // merge saved with auto-detected
        const saved = loadSavedExcluded()
        if (saved) {
          const merged = new Set(saved)
          for (const cat of cats) { if (isKnownExcluded(cat)) merged.add(cat) }
          setExcluded(merged)
        } else {
          setExcluded(new Set([...cats].filter(isKnownExcluded)))
        }

        setStep('results')
      } catch {
        setError('Failed to parse the file. Make sure it is a valid QB Time CSV export.')
      }
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 12,
    padding: '20px 24px',
  }

  const sideLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.8, color: 'var(--color-text-secondary)', marginBottom: 6,
    display: 'block',
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-secondary)' }}>

      {/* ── Fixed header ── */}
      <header style={{
        width: '100%', height: 64,
        background: 'var(--color-background-primary)',
        borderBottom: '1.5px solid var(--color-border-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px 0 0',
        position: 'fixed', top: 0, left: 0, zIndex: 1000, boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 215, minWidth: 215, height: '100%',
          borderRight: '1.5px solid var(--color-border-divider)',
        }}>
          <img src={theme === 'dark' ? logoWhite : logoBlack} alt="Logo"
            style={{ width: '75%', height: 'auto', objectFit: 'contain' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 20, letterSpacing: 0.5 }}>
            Weekly Hours Control
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>
            Mon–Wed summary · Thu–Fri availability
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/dashboard')}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ height: 38, padding: '0 14px', fontSize: 13, gap: 6 }}>
            <i className="bi bi-grid" style={{ fontSize: 14 }} />Dashboard
          </button>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
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

      {/* ── Body (header offset) ── */}
      <div style={{ display: 'flex', paddingTop: 64, minHeight: 'calc(100vh - 64px)' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          position: 'fixed', top: 64, left: 0,
          width: 215, minWidth: 215,
          height: 'calc(100vh - 64px)',
          background: 'var(--color-background-primary)',
          borderRight: '1.5px solid var(--color-border-divider)',
          display: 'flex', flexDirection: 'column',
          zIndex: 10, overflowY: 'auto',
        }}>
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>

            {/* Hours per day */}
            <div>
              <span style={sideLabel}>Expected Hours / Day</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number" min={1} max={24} value={hoursPerDay}
                  onChange={e => setHoursPerDay(Math.max(1, Math.min(24, parseInt(e.target.value) || 8)))}
                  style={{
                    width: 64, padding: '7px 10px', borderRadius: 7,
                    border: '1px solid var(--color-border-divider)',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 16, fontWeight: 700, textAlign: 'center',
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  <div>Mon–Wed: <strong style={{ color: 'var(--color-text-primary)' }}>{hoursPerDay * 3}h</strong></div>
                  <div>Thu–Fri: <strong style={{ color: 'var(--color-text-primary)' }}>{hoursPerDay * 2}h</strong></div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--color-border-divider)', margin: '0 -16px' }} />

            {/* Job code categories */}
            <div style={{ flex: 1 }}>
              <span style={sideLabel}>Job Code Categories</span>
              <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Checked items are <span style={{ color: '#ef4444', fontWeight: 600 }}>excluded</span> from the hours total. Saved automatically.
              </p>
              <CategoryDropdown
                allCategories={allCategories}
                excluded={excluded}
                onChange={setExcluded}
                disabled={allCategories.length === 0}
              />
              {allCategories.length > 0 && (
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  <i className="bi bi-floppy" style={{ marginRight: 4 }} />
                  {excluded.size} excluded · {allCategories.length - excluded.size} counted
                </p>
              )}
            </div>

            {/* Divider */}
            {step === 'results' && results.length > 0 && (
              <div style={{ height: 1, background: 'var(--color-border-divider)', margin: '0 -16px' }} />
            )}

            {/* Export options */}
            {step === 'results' && results.length > 0 && (
              <div>
                <span style={sideLabel}>Export</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={onlyExceeding}
                    onChange={e => setOnlyExceeding(e.target.checked)}
                    style={{ accentColor: '#ef4444', width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Only <span style={{ color: '#ef4444', fontWeight: 600 }}>exceeding</span> employees
                  </span>
                </label>
                <button
                  onClick={() => exportResultsAsImage(onlyExceeding ? results.filter(r => r.surplus > 0) : results, hoursPerDay, fileName, theme)}
                  className="btn-secondary-custom"
                  style={{ width: '100%', padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <i className="bi bi-image" />
                  Export as Image
                </button>
              </div>
            )}

            {/* New file */}
            {step === 'results' && (
              <button
                onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setAllCategories([]); setFileName(''); setResults([]) }}
                className="btn-secondary-custom"
                style={{ width: '100%', padding: '7px', borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <i className="bi bi-arrow-counterclockwise" />
                New file
              </button>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, marginLeft: 215, padding: '28px 28px' }}>

          {/* Error banner */}
          {error && (
            <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16, color: '#ef4444', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <i className="bi bi-exclamation-circle" style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* ══════════ UPLOAD ══════════ */}
          {step === 'upload' && (
            <div style={{ maxWidth: 640, margin: '0 auto', marginTop: 40 }}>
              <div style={card}>
                <h2 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>
                  Upload QB Time Report
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 20px' }}>
                  Export the weekly timesheet from QB Time and drop it here. The report will be calculated automatically.
                </p>

                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                    borderRadius: 10, padding: '52px 24px', textAlign: 'center', cursor: 'pointer',
                    background: isDragging ? 'rgba(46,107,230,0.04)' : 'var(--color-background-secondary)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <i className="bi bi-file-earmark-arrow-up"
                    style={{ fontSize: 44, color: 'var(--color-accent-primary)', display: 'block', marginBottom: 14 }} />
                  <p style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15, margin: '0 0 4px' }}>
                    Drop the CSV here
                  </p>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: 0 }}>or click to browse</p>
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFileInput} />
                </div>
              </div>
            </div>
          )}

          {/* ══════════ RESULTS ══════════ */}
          {step === 'results' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Summary chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ ...card, textAlign: 'center', padding: '16px 20px' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-accent-primary)' }}>{results.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Employees</div>
                </div>
                <div style={{ ...card, textAlign: 'center', padding: '16px 20px' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-text-primary)' }}>{hoursPerDay * 3}h</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Expected Mon–Wed</div>
                </div>
                <div style={{ ...card, textAlign: 'center', padding: '16px 20px' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#10B981' }}>{hoursPerDay * 2}h</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Max Thu–Fri</div>
                </div>
              </div>

              {/* Results table */}
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h3 style={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 600, margin: '0 0 2px' }}>
                      Results — Mon to Wed
                    </h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, margin: 0 }}>
                      {fileName} · {hoursPerDay}h/day · {excluded.size} categor{excluded.size !== 1 ? 'ies' : 'y'} excluded
                    </p>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-background-secondary)' }}>
                        {[
                          { label: 'Employee',          align: 'left'   as const },
                          { label: 'Hours Mon–Wed',     align: 'center' as const },
                          { label: 'Surplus',           align: 'center' as const },
                          { label: 'Thu–Fri Available', align: 'center' as const },
                        ].map(({ label, align }) => (
                          <th key={label} style={{
                            padding: '10px 20px', textAlign: align,
                            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: 0.5, color: 'var(--color-text-secondary)',
                            borderBottom: '1px solid var(--color-border-divider)', whiteSpace: 'nowrap',
                          }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>
                            No Mon–Wed entries found with the current filters.
                          </td>
                        </tr>
                      )}
                      {(onlyExceeding ? results.filter(r => r.surplus > 0) : results).map((r, i) => (
                        <tr key={r.name} style={{ borderBottom: '1px solid var(--color-border-divider)', background: i % 2 === 1 ? 'var(--color-background-secondary)' : undefined }}>
                          <td style={{ padding: '12px 20px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.name}</td>

                          <td style={{ padding: '12px 20px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>
                            {r.hoursMonWed}h
                          </td>

                          {/* Surplus: positive = red (bad), negative = green (good) */}
                          <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                              background: r.surplus > 0
                                ? 'rgba(239,68,68,0.10)'
                                : r.surplus < 0
                                ? 'rgba(16,185,129,0.12)'
                                : 'rgba(156,163,175,0.12)',
                              color: r.surplus > 0 ? '#ef4444' : r.surplus < 0 ? '#10B981' : 'var(--color-text-secondary)',
                            }}>
                              {r.surplus > 0 && <i className="bi bi-arrow-up" style={{ fontSize: 11 }} />}
                              {r.surplus < 0 && <i className="bi bi-arrow-down" style={{ fontSize: 11 }} />}
                              {r.surplus > 0 ? '+' : ''}{r.surplus}h
                            </span>
                          </td>

                          <td style={{ padding: '12px 20px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: r.thursFriAvailable === 0 ? '#ef4444' : 'var(--color-text-primary)' }}>
                            {r.thursFriAvailable}h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
