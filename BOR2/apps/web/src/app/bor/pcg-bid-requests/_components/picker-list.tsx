"use client"

import { useMemo, useState } from "react"
import { Check, Search, X } from "lucide-react"

export type PickerOption = {
  value: string
  label: string
  hint?: string
}

// The popover body every picker on this page shares: search pinned at the top,
// only the rows below it scroll.
export function PickerSearchList({
  options, selected, placeholder, emptyLabel, onPick, children,
}: {
  options: PickerOption[]
  selected?: string
  placeholder: string
  emptyLabel: string
  onPick: (value: string) => void
  children?: React.ReactNode   // extra rows pinned above the results
}) {
  const [search, setSearch] = useState("")

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return options
    return options.filter(o => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(term))
  }, [options, search])

  return (
    <>
      {/* rounded-t: the header is the topmost fill in the popup, so square corners
          here paint over the popup's own rounding. */}
      <div className="sticky top-0 rounded-t-lg border-b bg-popover p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-6 text-sm outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring dark:bg-input/30"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[240px] overflow-y-auto p-1">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {search ? "No match." : emptyLabel}
          </p>
        ) : (
          <>
            {children}
            {visible.map(o => (
              <PickerRow
                key={o.value}
                label={o.label}
                hint={o.hint}
                selected={selected === o.value}
                onClick={() => onPick(o.value)}
              />
            ))}
          </>
        )}
      </div>
    </>
  )
}

export function PickerRow({
  label, hint, selected, muted, onClick,
}: {
  label: string
  hint?: string
  selected: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
        muted ? "text-muted-foreground" : ""
      }`}
    >
      <span className="min-w-0 flex-1 truncate">
        {label}
        {hint && <span className="ml-1.5 text-[11px] uppercase text-muted-foreground">{hint}</span>}
      </span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  )
}
