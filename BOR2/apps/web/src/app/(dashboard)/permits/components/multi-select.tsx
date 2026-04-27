'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'

export function MultiSelect({ label, icon, options, selected, onChange, minWidth = 208, fitContent = false }: {
  label:       string
  icon?:       React.ReactNode
  options:     string[]
  selected:    string[]
  onChange:    (v: string[]) => void
  minWidth?:   number
  /** Auto-sizes dropdown to fit the longest option (right-aligned to trigger) */
  fitContent?: boolean
}) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const [rect, setRect]     = useState<DOMRect | null>(null)

  function openDropdown() {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) { setSearch(''); return }
    setTimeout(() => inputRef.current?.focus(), 0)
    function handler(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-multiselect-drop]') &&
          e.target !== triggerRef.current) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  }

  const dropdown = open && rect && createPortal(
    <div
      data-multiselect-drop
      className="overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        ...(fitContent
          ? { right: window.innerWidth - rect.right, width: 'max-content', minWidth: rect.width }
          : { left: rect.right - Math.max(rect.width, minWidth), width: Math.max(rect.width, minWidth) }),
        zIndex: 9999,
      }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      {/* All — fixed above the scrollable list */}
      <div className="px-1 pt-1">
        <button
          onClick={() => onChange([])}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${selected.length === 0 ? 'border-primary bg-primary' : 'border-border'}`}>
            {selected.length === 0 && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </span>
          All
        </button>
      </div>

      {/* Full-width separator */}
      <div className="mx-0 my-1 h-px bg-border" />

      {/* Scrollable options */}
      <div className="max-h-48 overflow-y-auto px-1 pb-1">
        {filtered.map(opt => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${selected.includes(opt) ? 'border-primary bg-primary' : 'border-border'}`}>
              {selected.includes(opt) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </span>
            <span className="truncate">{opt}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">No results</p>}
      </div>
    </div>,
    document.body
  )

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={openDropdown}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors ${
          selected.length > 0
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-input bg-transparent dark:bg-input/30 text-muted-foreground hover:text-foreground'
        }`}
      >
        {icon ?? <span>{label}</span>}
        {selected.length > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdown}
    </div>
  )
}
