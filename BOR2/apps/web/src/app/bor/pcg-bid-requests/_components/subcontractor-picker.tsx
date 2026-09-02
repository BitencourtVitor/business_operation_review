"use client"

import { useMemo, useState } from "react"
import { ChevronDown, HardHat, Loader2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSubDocContractors } from "@/hooks/use-subcontractor-docs"
import { PickerRow, PickerSearchList } from "./picker-list"

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

  const options = useMemo(() => (
    (contractors ?? [])
      .filter(c => c.status !== "inactive")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => ({ value: c.name, label: c.name, hint: c.company ?? undefined }))
  ), [contractors])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50">
        <HardHat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={`flex-1 truncate text-left ${value ? "" : "text-muted-foreground"}`}>
          {value || "Not assigned"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[260px] gap-0 p-0">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading roster…
          </div>
        ) : (
          <PickerSearchList
            options={options}
            selected={value}
            placeholder="Search subcontractor…"
            emptyLabel="No subcontractor registered."
            onPick={name => { onChange(name); setOpen(false) }}
          >
            <PickerRow
              label="Not assigned"
              muted
              selected={!value}
              onClick={() => { onChange(""); setOpen(false) }}
            />
          </PickerSearchList>
        )}
      </PopoverContent>
    </Popover>
  )
}
