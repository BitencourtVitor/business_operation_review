"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, Search } from "lucide-react"
import { useState } from "react"

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  icon?: React.ElementType
  className?: string
  allLabel?: string
  /** Shows only the icon in the trigger (compact mode). Active filter highlights the icon. */
  iconOnly?: boolean
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  icon: Icon,
  className,
  allLabel = "All",
  iconOnly = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const allOptions = [{ value: "All", label: allLabel }, ...options]
  const filteredOptions = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const selectedLabel = allOptions.find((o) => o.value === value)?.label ?? placeholder

  function select(v: string) {
    onValueChange(v)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              iconOnly
                ? cn(
                    "h-8 w-8 p-0 justify-center",
                    value !== "All" && "border-primary/60 text-primary"
                  )
                : "h-8 w-auto min-w-[100px] max-w-[200px] justify-between gap-1.5 px-2.5 text-sm font-normal",
              className
            )}
          />
        }
      >
        {iconOnly ? (
          Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", value !== "All" ? "text-primary" : "text-muted-foreground")} />
        ) : (
          <>
            {Icon && <Icon className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="flex-1 truncate text-left">{selectedLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[180px] gap-0 p-0" align="end">
        {/* Search */}
        <div className="flex items-center border-b px-2">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* "All" pinned */}
        <div className="border-b p-1">
          <button
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent",
              value === "All" && "bg-accent font-medium"
            )}
            onClick={() => select("All")}
          >
            <Check className={cn("h-3 w-3 shrink-0", value === "All" ? "opacity-100" : "opacity-0")} />
            <span>{allLabel}</span>
          </button>
        </div>
        {/* Options */}
        <div className="max-h-[200px] overflow-y-auto p-1">
          {filteredOptions.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No results</p>
          ) : (
            filteredOptions.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent",
                  value === opt.value && "bg-accent font-medium"
                )}
                onClick={() => select(opt.value)}
              >
                <Check className={cn("h-3 w-3 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")} />
                <span className="whitespace-nowrap">{opt.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
