"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DeleteButton } from "./delete-button"

export function ScopeList({
  title, description, items, onChange,
}: {
  title: string
  description: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  function update(i: number, value: string) {
    onChange(items.map((item, idx) => (idx === i ? value : item)))
  }

  return (
    // Level 2 of the nesting stays unfilled — the panel behind it already carries
    // the card tint, and stacking a second one just muddies both.
    <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border/60">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
        <span className="flex items-center text-sm font-semibold leading-none">{title}</span>
        <span className="flex items-center text-xs leading-none text-muted-foreground">{items.length}</span>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <p className="text-xs text-muted-foreground">{description}</p>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            Nothing here yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li
                key={i}
                className="relative flex items-stretch rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30"
              >
                <span className="flex w-8 shrink-0 items-start justify-end pr-1 pt-2 text-xs tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <textarea
                  value={item}
                  onChange={e => update(i, e.target.value)}
                  rows={2}
                  className="min-w-0 flex-1 resize-y bg-transparent py-1.5 pr-9 text-sm outline-none"
                />
                <DeleteButton
                  label={`Remove item ${i + 1}`}
                  confirm={item.trim().length > 0}
                  floating
                  onDelete={() => onChange(items.filter((_, idx) => idx !== i))}
                />
              </li>
            ))}
          </ol>
        )}

        <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...items, ""])}>
          <Plus className="h-3.5 w-3.5" />
          Add item
        </Button>
      </div>
    </div>
  )
}
