"use client"

import { useState } from "react"
import { CheckCircle2, Circle, Clock4, MapPin, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import {
  MONTH_NAMES_SHORT, STATUS_COLOR, STATUS_LABEL,
  type FilterConfig, type WeekOption,
} from "../_lib/utils"

// ── Inline MultiSelect ────────────────────────────────────────────────────────

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  icon: Icon,
  className,
}: {
  options:     { value: string; label: string; sub?: string }[]
  selected:    string[]
  onChange:    (v: string[]) => void
  placeholder: string
  icon?:       React.ElementType
  className?:  string
}) {
  const allSelected = selected.length === 0 || selected.length === options.length
  const label = allSelected ? placeholder : `${selected.length} selected`

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value))
    else                          onChange([...selected, value])
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm transition-colors hover:bg-accent",
          className,
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className={cn("truncate", allSelected ? "text-muted-foreground" : "font-medium text-foreground")}>
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-56 p-1">
        {options.map(opt => {
          const checked = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <div className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}>
                {checked && (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="leading-tight font-medium">{opt.label}</span>
                {opt.sub && <span className="text-[10px] text-muted-foreground">{opt.sub}</span>}
              </div>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

// ── FiltersBar ────────────────────────────────────────────────────────────────

const STATUS_ICONS = {
  completed:   CheckCircle2,
  in_progress: Clock4,
  no_started:  Circle,
} as const

export function FiltersBar({
  filters,
  onFilterChange,
  availableYears,
  availableMonths,
  availableWeeks,
  allProjects,
  allTeams,
}: {
  filters:         FilterConfig
  onFilterChange:  <K extends keyof FilterConfig>(key: K, value: FilterConfig[K]) => void
  availableYears:  string[]
  availableMonths: number[]
  availableWeeks:  WeekOption[]
  allProjects:     { jobSite: string; city: string }[]
  allTeams:        string[]
}) {
  const [statusHover, setStatusHover] = useState<string | null>(null)

  function toggleStatus(s: string) {
    const cur = filters.activeStatuses
    if (cur.includes(s)) {
      if (cur.length === 1) return // keep at least one
      onFilterChange("activeStatuses", cur.filter(x => x !== s))
    } else {
      onFilterChange("activeStatuses", [...cur, s])
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">

      {/* ── Year / Month / Week ── */}
      <div className="flex items-center divide-x divide-input rounded-md border border-input bg-background">
        <Select value={filters.year} onValueChange={v => onFilterChange("year", v ?? "")}>
          <SelectTrigger className="h-8 gap-1.5 rounded-r-none border-0 px-2.5 text-sm focus:ring-0">
            <span className={cn(!filters.year && "text-muted-foreground")}>
              {filters.year || "Year"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All years</SelectItem>
            {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={filters.month}
          onValueChange={v => onFilterChange("month", v ?? "")}
          disabled={!filters.year}
        >
          <SelectTrigger className="h-8 gap-1.5 rounded-none border-0 px-2.5 text-sm focus:ring-0">
            <span className={cn(!filters.month && "text-muted-foreground")}>
              {filters.month ? MONTH_NAMES_SHORT[Number(filters.month) - 1] : "Month"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All months</SelectItem>
            {availableMonths.map(m => (
              <SelectItem key={m} value={String(m)}>{MONTH_NAMES_SHORT[m - 1]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.week}
          onValueChange={v => onFilterChange("week", v ?? "")}
          disabled={!filters.year}
        >
          <SelectTrigger className="h-8 gap-1.5 rounded-l-none border-0 px-2.5 text-sm focus:ring-0">
            <span className={cn(!filters.week && "text-muted-foreground")}>
              {filters.week ? `W${filters.week}` : "Week"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All weeks</SelectItem>
            {availableWeeks.map(w => (
              <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Date type toggle ── */}
      <div className="flex h-8 items-center rounded-md border border-input bg-background p-0.5">
        {(["startDate", "finishDate"] as const).map(dt => (
          <button
            key={dt}
            onClick={() => onFilterChange("dateType", dt)}
            className={cn(
              "h-7 rounded px-2.5 text-xs font-medium transition-colors",
              filters.dateType === dt
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {dt === "startDate" ? "Start" : "Finish"}
          </button>
        ))}
      </div>

      {/* ── Status pills ── */}
      <div className="relative flex h-8 items-center gap-1 rounded-md border border-input bg-background px-1.5">
        {(["completed", "in_progress", "no_started"] as const).map(s => {
          const Icon   = STATUS_ICONS[s]
          const active = filters.activeStatuses.includes(s)
          return (
            <div key={s} className="relative" onMouseEnter={() => setStatusHover(s)} onMouseLeave={() => setStatusHover(null)}>
              <button
                onClick={() => toggleStatus(s)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full transition-all",
                  active ? "opacity-100 ring-2 ring-offset-1" : "opacity-30 hover:opacity-60",
                )}
                style={{ color: STATUS_COLOR[s], ...(active ? { "--tw-ring-color": STATUS_COLOR[s] } as React.CSSProperties : {}) }}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
              {statusHover === s && (
                <div className="absolute -bottom-7 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-[11px] shadow-md ring-1 ring-border">
                  {STATUS_LABEL[s]}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── City • Jobsite multiselect ── */}
      <MultiSelect
        options={allProjects.map(p => ({
          value: p.jobSite,
          label: p.jobSite,
          sub:   p.city,
        }))}
        selected={filters.selectedProjects}
        onChange={v => onFilterChange("selectedProjects", v)}
        placeholder="All Jobsites"
        icon={MapPin}
        className="w-44"
      />

      {/* ── Team multiselect ── */}
      <MultiSelect
        options={allTeams.map(t => ({ value: t, label: t }))}
        selected={filters.selectedTeams}
        onChange={v => onFilterChange("selectedTeams", v)}
        placeholder="All Teams"
        icon={Users}
        className="w-36"
      />
    </div>
  )
}
