"use client"

import { cn } from "@/lib/utils"

export type SegOption<T extends string> = {
  value: T
  label: string
  icon?: React.ReactNode
}

// Segmented control matching the app's "Warranty" filter style:
// p-0.5 container with inner pill buttons; active = bg-background + shadow.
export function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T
  onChange: (v: T) => void
  options: SegOption<T>[]
  label?: string
  className?: string
}) {
  const control = (
    <div className={cn("flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30", className)}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
  if (!label) return control
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {control}
    </div>
  )
}
