"use client"

import { useState } from "react"
import { Check, Eraser, Trash2, X } from "lucide-react"

// One stray click used to wipe written text with no way back. Anything with
// content asks in place — a modal for a single line is heavier than the action.
export function DeleteButton({
  label, confirm, floating, mode = "delete", onDelete,
}: {
  label: string
  confirm: boolean
  floating?: boolean            // pinned to the top-right corner of a relative field
  mode?: "delete" | "clear"     // clearing keeps the field, so it is not a trash can
  onDelete: () => void
}) {
  const [asking, setAsking] = useState(false)

  const anchor = floating ? "absolute right-1.5 top-1.5" : ""
  const Icon = mode === "clear" ? Eraser : Trash2

  if (!asking) {
    return (
      <button
        onClick={() => (confirm ? setAsking(true) : onDelete())}
        aria-label={label}
        className={`${anchor} rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive`}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <span className={`${anchor} flex items-center gap-0.5`}>
      <span className="text-[11px] text-muted-foreground">Sure?</span>
      <button
        onClick={() => { onDelete(); setAsking(false) }}
        aria-label={`Confirm: ${label}`}
        className="rounded-md p-1 text-destructive transition-colors hover:bg-destructive/10"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setAsking(false)}
        aria-label="Keep it"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}
