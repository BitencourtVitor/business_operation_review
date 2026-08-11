"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, CircleCheck, Clock3, Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { COMPANY_LABEL } from "@/lib/company"
import { useSubDocWorkersCompReview, useUpdateSubDocWorkersCompCheck } from "@/hooks/use-subcontractor-docs"
import type { WorkersCompCheckStatus, WorkersCompReviewCheck } from "@/services/subcontractor-docs.service"

const STATUS = {
  pending: { label: "Pending", icon: Clock3, className: "text-amber-600" },
  regular: { label: "Regular", icon: ShieldCheck, className: "text-emerald-600" },
  irregular: { label: "Irregular", icon: ShieldAlert, className: "text-red-600" },
} satisfies Record<WorkersCompCheckStatus, { label: string; icon: typeof ShieldCheck; className: string }>

const STATUS_ORDER = Object.keys(STATUS) as WorkersCompCheckStatus[]

// Same logos the cards on the page use.
const DIVISION_IMAGES: Record<string, string> = {
  framing: "/images/sublogo_framing.png",
  hvac: "/images/sublogo_hvac.png",
  pcg: "/images/icon_pcg.png",
}

function divisionLabel(division: string) {
  const known = COMPANY_LABEL[division as keyof typeof COMPANY_LABEL]
  if (known) return known
  return division.split(/[-_\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-")
  return `${month}/${day}/${year}`
}

function Divisions({ divisions }: { divisions: string[] }) {
  if (!divisions.length) return <span className="text-xs text-muted-foreground">No division</span>
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {divisions.map(division => (
        <span key={division} className="flex min-w-0 items-center gap-1.5">
          <img src={DIVISION_IMAGES[division] ?? "/favicon.png"} alt="" className="h-4 w-auto shrink-0 object-contain" />
          <span className="truncate text-xs">{divisionLabel(division)}</span>
        </span>
      ))}
    </div>
  )
}

function StatusNav({ value, onChange, busy }: {
  value: WorkersCompCheckStatus
  onChange: (status: WorkersCompCheckStatus) => void
  busy: boolean
}) {
  return (
    <div className="flex w-fit items-center gap-0.5 rounded-lg border border-input p-0.5">
      {STATUS_ORDER.map(status => {
        const meta = STATUS[status]
        const Icon = meta.icon
        const active = value === status
        return (
          <button
            key={status}
            type="button"
            title={meta.label}
            aria-label={meta.label}
            aria-pressed={active}
            disabled={busy}
            onClick={() => { if (!active) onChange(status) }}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              active ? cn("bg-muted font-medium", meta.className) : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {active && busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {active && <span>{meta.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ReviewRow({ check, readOnly }: { check: WorkersCompReviewCheck; readOnly: boolean }) {
  const update = useUpdateSubDocWorkersCompCheck()
  const [notes, setNotes] = useState(check.notes)

  useEffect(() => setNotes(check.notes), [check.notes])

  const save = (status: WorkersCompCheckStatus, nextNotes = notes) => {
    update.mutate({ id: check.id, status, notes: nextNotes })
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 px-4 py-3 last:border-b-0 md:grid md:grid-cols-[minmax(180px,1.3fr)_minmax(130px,0.8fr)_210px_minmax(190px,1.4fr)] md:items-center md:gap-3 md:py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{check.contractor_name}</p>
        <p className="truncate text-xs text-muted-foreground">{check.email || "No email on file"}</p>
      </div>
      <Divisions divisions={check.divisions} />
      <StatusNav value={check.status} onChange={save} busy={update.isPending || readOnly} />
      <Input
        value={notes}
        onChange={event => setNotes(event.target.value)}
        onBlur={() => { if (notes !== check.notes) save(check.status, notes) }}
        placeholder="Verification notes..."
        disabled={readOnly}
        className="h-8 min-w-0 text-xs"
      />
    </div>
  )
}

function CycleNav({ date, prev, next, onGo, onCurrent, browsing }: {
  date: string
  prev: string
  next: string
  onGo: (date: string) => void
  onCurrent: () => void
  browsing: boolean
}) {
  return (
    <div className="flex w-full items-center justify-between gap-1 rounded-lg border border-border/60 px-1 py-1 sm:w-auto sm:justify-start">
      <button
        type="button"
        title="Previous cycle"
        aria-label="Previous cycle"
        disabled={!prev}
        onClick={() => onGo(prev)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={!browsing}
        onClick={onCurrent}
        title={browsing ? "Back to the current cycle" : "Current cycle"}
        className="min-w-[104px] rounded-md px-1 text-center text-sm font-medium transition-colors enabled:hover:bg-muted/60 disabled:cursor-default"
      >
        {shortDate(date)}
      </button>
      <button
        type="button"
        title="Next cycle"
        aria-label="Next cycle"
        disabled={!next}
        onClick={() => onGo(next)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function WorkersCompReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<WorkersCompCheckStatus | null>(null)
  const { data, isLoading, error } = useSubDocWorkersCompReview(open, date)

  useEffect(() => { if (!open) { setDate(undefined); setFilter(null) } }, [open])

  const counts = useMemo(() => ({
    pending: data?.checks.filter(check => check.status === "pending").length ?? 0,
    regular: data?.checks.filter(check => check.status === "regular").length ?? 0,
    irregular: data?.checks.filter(check => check.status === "irregular").length ?? 0,
  }), [data])

  // A filter whose bucket emptied out stops filtering on its own, so the list
  // never goes blank under a chip the user can no longer switch off.
  const activeFilter = filter && counts[filter] > 0 ? filter : null
  const visible = activeFilter ? (data?.checks ?? []).filter(check => check.status === activeFilter) : data?.checks ?? []
  const notOpened = data?.status === "not_opened"

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className="w-[min(1280px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />Workers&apos; Compensation Review</DialogTitle>
        </DialogHeader>

        {isLoading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : error ? <div className="p-5 text-sm text-red-600">Unable to load the review cycle.</div>
          : data ? <>
            <div className="flex flex-col gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center">
              <CycleNav
                date={data.review_date}
                prev={data.prev_review_date}
                next={data.next_review_date}
                onGo={next => { setDate(next); setFilter(null) }}
                onCurrent={() => { setDate(undefined); setFilter(null) }}
                browsing={date !== undefined}
              />
              {data.status === "closed" && <span className="text-xs text-muted-foreground">Closed</span>}
              {notOpened && <span className="text-xs text-muted-foreground">Not opened yet</span>}
              <div className="grid w-full grid-cols-3 gap-2 sm:flex-1">
                {STATUS_ORDER.map(status => {
                  const meta = STATUS[status]
                  const Icon = meta.icon
                  const count = counts[status]
                  const isActive = activeFilter === status
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={count === 0}
                      aria-pressed={isActive}
                      title={count === 0 ? `No ${meta.label.toLowerCase()} subcontractor` : isActive ? "Clear filter" : `Show only ${meta.label.toLowerCase()}`}
                      onClick={() => setFilter(isActive ? null : status)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                        count === 0 ? "cursor-not-allowed border-border/60 opacity-40" : "hover:bg-muted/50",
                        isActive ? "border-foreground/40 bg-muted/60" : "border-border/60",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", meta.className)} />
                      <span className="text-xs text-muted-foreground">{meta.label}</span>
                      <strong className="ml-auto text-sm">{count}</strong>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <div className="sticky top-0 z-10 hidden grid-cols-[minmax(180px,1.3fr)_minmax(130px,0.8fr)_210px_minmax(190px,1.4fr)] gap-3 border-b border-border bg-background px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
                <span>Subcontractor</span><span>Divisions</span><span>Result</span><span>Notes</span>
              </div>
              {visible.length ? visible.map(check => <ReviewRow key={check.id} check={check} readOnly={notOpened} />)
                : <div className="flex h-40 items-center justify-center px-5 text-center text-sm text-muted-foreground">
                    {notOpened ? "This cycle has not been opened yet." : "No subcontractor has a received Workers' Compensation document."}
                  </div>}
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleCheck className="h-3.5 w-3.5" />Results are saved immediately.</span>
              <button type="button" onClick={onClose} className="h-8 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted">Close</button>
            </div>
          </> : null}
      </DialogContent>
    </Dialog>
  )
}
