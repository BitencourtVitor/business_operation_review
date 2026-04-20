'use client'

import { ChevronDown, ChevronRight } from "lucide-react"

export function Section({
  title, icon: Icon, count, children, open, onToggle,
}: {
  title: string
  icon: React.ElementType
  count?: number
  children: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {count != null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
        {open
          ? <ChevronDown  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        }
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}
