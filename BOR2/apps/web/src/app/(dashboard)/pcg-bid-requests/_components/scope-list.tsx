"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
              <Textarea
                value={item}
                onChange={e => update(i, e.target.value)}
                rows={2}
                className="min-h-0 flex-1 text-sm"
              />
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                aria-label={`Remove item ${i + 1}`}
                className="mt-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...items, ""])}>
        <Plus className="h-3.5 w-3.5" />
        Add item
      </Button>
    </div>
  )
}
