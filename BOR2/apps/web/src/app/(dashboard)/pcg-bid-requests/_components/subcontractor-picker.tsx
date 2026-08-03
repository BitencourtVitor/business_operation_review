"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, HardHat, Loader2, Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSubDocContractors } from "@/hooks/use-subcontractor-docs"

// The roster is the one maintained in Subcontractor Docs — this page never
// keeps its own list, so a sub added there shows up here with no extra step.
export function SubcontractorPicker({
  value, onChange,
}: {
  value: string
  onChange: (name: string) => void
}) {
  const { data: contractors, isLoading } = useSubDocContractors()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const options = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (contractors ?? [])
      .filter(c => c.status !== "inactive")
      .filter(c => !term || c.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [contractors, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50">
        <HardHat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={`flex-1 truncate text-left ${value ? "" : "text-muted-foreground"}`}>
          {value || "Not assigned"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[260px] p-0">
        {/* Search stays pinned — only the list below it scrolls */}
        <div className="sticky top-0 border-b bg-popover p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subcontractor…"
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
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading roster…
            </div>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {search ? "No match." : "No subcontractor registered."}
            </p>
          ) : (
            <>
              <PickerRow
                label="Not assigned"
                muted
                selected={!value}
                onClick={() => { onChange(""); setOpen(false) }}
              />
              {options.map(c => (
                <PickerRow
                  key={c.id}
                  label={c.name}
                  hint={c.company ?? undefined}
                  selected={value === c.name}
                  onClick={() => { onChange(c.name); setOpen(false) }}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PickerRow({
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
