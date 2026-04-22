'use client'

import { Calendar, CheckCircle2, CircleArrowUp, CircleDashed, Clock, Database } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ALL, DATE_FIELDS, MONTHS, type DateField } from '../types'
import { MultiSelect } from './multi-select'

// ─── Situation select options (with icons — defined here to keep types.ts JSX-free) ─

export const SIT_OPTIONS = [
  { value: ALL,           label: 'All',         icon: null,                                                                                              color: ''                                          },
  { value: 'Pending',     label: 'Pending',     icon: <CircleDashed  className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400"              />, color: 'text-gray-500 dark:text-gray-400'          },
  { value: 'Not Applied', label: 'Not Applied', icon: <Clock         className="h-3.5 w-3.5 text-red-500 dark:text-red-300"                />, color: 'text-red-500 dark:text-red-300'            },
  { value: 'Applied',     label: 'Applied',     icon: <CircleArrowUp className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-300"          />, color: 'text-yellow-500 dark:text-yellow-300'      },
  { value: 'Issued',      label: 'Issued',      icon: <CheckCircle2  className="h-3.5 w-3.5 text-primary"                                  />, color: 'text-primary'                              },
]

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PermitFiltersProps {
  // period
  yearFilter:    string
  monthFilter:   string
  dateField:     DateField
  availableMonths: { value: string; label: string }[]
  years:         string[]
  onYearChange:  (v: string) => void
  onMonthChange: (v: string) => void
  onDateFieldChange: (v: DateField) => void
  // situation
  situation:     string
  onSituationChange: (v: string) => void
  // client / jobsite
  clients:       string[]
  jobsites:      string[]
  clientFilter:  string[]
  jobsiteFilter: string[]
  onClientFilterChange:  (v: string[]) => void
  onJobsiteFilterChange: (v: string[]) => void
  // manage / insights
  canManage:     boolean
  onManageClick: () => void
  insightsTriggerButton: React.ReactNode
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PermitFilters({
  yearFilter, monthFilter, dateField, availableMonths, years,
  onYearChange, onMonthChange, onDateFieldChange,
  situation, onSituationChange,
  clients, jobsites, clientFilter, jobsiteFilter,
  onClientFilterChange, onJobsiteFilterChange,
  canManage, onManageClick, insightsTriggerButton,
}: PermitFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Permit Control</h1>
        <p className="text-sm text-muted-foreground">Track permit requests, applications and approvals</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">

        {/* Period */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
          <div className="flex h-8 items-center rounded-lg border border-input bg-transparent dark:bg-input/30">

            {/* Calendar icon + Year */}
            <div className="flex items-center gap-0.5 pl-2.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
            <Select value={yearFilter} onValueChange={v => { if (v) { onYearChange(v); onMonthChange(ALL) } }}>
              <SelectTrigger className="h-8 w-[68px] border-0 bg-transparent pl-1.5 pr-1 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                <span className="flex-1 truncate text-left text-sm">{yearFilter === ALL ? 'All' : yearFilter}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-5 w-px shrink-0 bg-border" />

            <Select value={monthFilter} onValueChange={onMonthChange}>
              <SelectTrigger className="h-8 w-[108px] border-0 bg-transparent pl-1.5 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                <span className="flex-1 truncate text-left text-sm">
                  {monthFilter === ALL ? 'All months' : MONTHS.find(m => m.value === monthFilter)?.label ?? 'All'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All months</SelectItem>
                {availableMonths.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex h-full items-center border-l border-border px-2.5">
              <span className="select-none text-[10px] font-medium text-muted-foreground/50">by</span>
            </div>

            <Select value={dateField} onValueChange={v => onDateFieldChange(v as DateField)}>
              <SelectTrigger className="h-8 w-[148px] border-0 bg-transparent pl-0 pr-2 shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent">
                <span className="flex-1 truncate text-left text-sm">
                  {DATE_FIELDS.find(f => f.value === dateField)?.label}
                </span>
              </SelectTrigger>
              <SelectContent>
                {DATE_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>

          </div>
        </div>

        {/* Situation */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Situation</span>
          <Select value={situation} onValueChange={onSituationChange}>
            <SelectTrigger className="h-8 w-[148px] rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-none ring-0 focus-visible:ring-0 dark:bg-input/30">
              <span className="flex flex-1 items-center gap-1.5 truncate text-left">
                {SIT_OPTIONS.find(o => o.value === situation)?.icon}
                <span className={SIT_OPTIONS.find(o => o.value === situation)?.color || 'text-muted-foreground'}>
                  {SIT_OPTIONS.find(o => o.value === situation)?.label ?? 'All'}
                </span>
              </span>
            </SelectTrigger>
            <SelectContent>
              {SIT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-2">
                    {o.icon ?? <span className="h-3.5 w-3.5" />}
                    <span className={o.color || 'text-muted-foreground'}>{o.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Client */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Client</span>
          <MultiSelect label="Client" options={clients} selected={clientFilter} onChange={onClientFilterChange} />
        </div>

        {/* Jobsite */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Jobsite</span>
          <MultiSelect label="Jobsite" options={jobsites} selected={jobsiteFilter} onChange={onJobsiteFilterChange} />
        </div>

        {/* Changes + Insights — dev or permits-write only */}
        {canManage && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Changes</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onManageClick}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Database className="h-3.5 w-3.5" />
                Manage Data
              </button>
              {insightsTriggerButton}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
