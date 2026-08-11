"use client"

import { useEffect, useMemo, useState } from "react"
import { CircleCheck, Clock3, Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useSubDocWorkersCompReview, useUpdateSubDocWorkersCompCheck } from "@/hooks/use-subcontractor-docs"
import type { WorkersCompCheckStatus, WorkersCompReviewCheck } from "@/services/subcontractor-docs.service"

const STATUS = {
  pending: { label: "Pending", icon: Clock3, className: "text-amber-600" },
  regular: { label: "Regular", icon: ShieldCheck, className: "text-emerald-600" },
  irregular: { label: "Irregular", icon: ShieldAlert, className: "text-red-600" },
} satisfies Record<WorkersCompCheckStatus, { label: string; icon: typeof ShieldCheck; className: string }>

function shortDate(value: string) {
  const [year, month, day] = value.split("-")
  return `${month}/${day}/${year}`
}

function ReviewRow({ check }: { check: WorkersCompReviewCheck }) {
  const update = useUpdateSubDocWorkersCompCheck()
  const [notes, setNotes] = useState(check.notes)

  useEffect(() => setNotes(check.notes), [check.notes])

  const save = (status: WorkersCompCheckStatus, nextNotes = notes) => {
    update.mutate({ id: check.id, status, notes: nextNotes })
  }
  const meta = STATUS[check.status]
  const Icon = meta.icon

  return (
    <div className="grid min-w-[700px] grid-cols-[minmax(190px,1.3fr)_minmax(140px,1fr)_140px_minmax(190px,1.4fr)] items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{check.contractor_name}</p>
        <p className="truncate text-xs text-muted-foreground">{check.email || "No email on file"}</p>
      </div>
      <p className="truncate text-xs text-muted-foreground">{check.divisions.join(", ") || "No division"}</p>
      <Select value={check.status} onValueChange={value => value && save(value as WorkersCompCheckStatus)}>
        <SelectTrigger className="h-8 text-xs" disabled={update.isPending}>
          <span className={cn("flex items-center gap-1.5", meta.className)}>
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {meta.label}
          </span>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {(Object.keys(STATUS) as WorkersCompCheckStatus[]).map(status => {
            const item = STATUS[status]
            const ItemIcon = item.icon
            return <SelectItem key={status} value={status}><span className={cn("flex items-center gap-2", item.className)}><ItemIcon className="h-3.5 w-3.5" />{item.label}</span></SelectItem>
          })}
        </SelectContent>
      </Select>
      <Input
        value={notes}
        onChange={event => setNotes(event.target.value)}
        onBlur={() => { if (notes !== check.notes) save(check.status, notes) }}
        placeholder="Verification notes..."
        className="h-8 text-xs"
      />
    </div>
  )
}

export function WorkersCompReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useSubDocWorkersCompReview(open)
  const counts = useMemo(() => ({
    pending: data?.checks.filter(check => check.status === "pending").length ?? 0,
    regular: data?.checks.filter(check => check.status === "regular").length ?? 0,
    irregular: data?.checks.filter(check => check.status === "irregular").length ?? 0,
  }), [data])

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className="w-[min(920px,calc(100vw-2rem))] max-w-none overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />Workers&apos; Compensation Review</DialogTitle>
          {/* A cycle runs until the next review opens; nothing else is sent. */}
          {data && (
            <p className="text-xs text-muted-foreground">
              Review {shortDate(data.review_date)}
              {data.status === "closed" && " · Closed"}
            </p>
          )}
        </DialogHeader>

        {isLoading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : error ? <div className="p-5 text-sm text-red-600">Unable to load the review cycle.</div>
          : data ? <>
            <div className="grid grid-cols-3 gap-3 border-b border-border px-5 py-3">
              {(["pending", "regular", "irregular"] as const).map(status => {
                const meta = STATUS[status]
                const Icon = meta.icon
                return <div key={status} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"><Icon className={cn("h-4 w-4", meta.className)} /><span className="text-xs text-muted-foreground">{meta.label}</span><strong className="ml-auto text-sm">{counts[status]}</strong></div>
              })}
            </div>
            <div className="overflow-x-auto">
              <div className="max-h-[55vh] overflow-y-auto">
                <div className="sticky top-0 z-10 grid min-w-[700px] grid-cols-[minmax(190px,1.3fr)_minmax(140px,1fr)_140px_minmax(190px,1.4fr)] gap-3 border-b border-border bg-background px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Subcontractor</span><span>Divisions</span><span>Result</span><span>Notes</span>
                </div>
                {data.checks.length ? data.checks.map(check => <ReviewRow key={check.id} check={check} />) : <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No subcontractor has a received Workers&apos; Compensation document.</div>}
              </div>
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
