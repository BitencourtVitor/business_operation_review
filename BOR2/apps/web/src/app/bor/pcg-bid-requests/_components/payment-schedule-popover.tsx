"use client"

import { useState } from "react"
import { ListChecks, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatMoney } from "../_lib/format"
import { milestoneAmount, scheduleRemaining, scheduleTotal } from "../_lib/types"
import type { PaymentMilestone } from "../_lib/types"

// The schedule hangs off the approval because that is where the number it
// divides comes from: percentages agreed against a price that is only known once
// a bid wins. Kept as percentages, never as money — the amounts below are drawn
// from the approved bid, so the two can never drift apart.
export function PaymentSchedulePopover({
  schedule, bidAmount, canEdit, onSave,
}: {
  schedule: PaymentMilestone[]
  bidAmount: number | null
  canEdit: boolean
  onSave: (schedule: PaymentMilestone[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<PaymentMilestone[]>(schedule)

  // The draft is this session's, not the store's: opening starts again from what
  // is saved, so a cancelled edit leaves nothing behind.
  function toggle(next: boolean) {
    if (next) setLines(schedule)
    setOpen(next)
  }

  const remaining = scheduleRemaining(lines)

  function patchLine(id: string, patch: Partial<PaymentMilestone>) {
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  // Whatever is still unallocated goes to the new line, so the usual case —
  // filling the schedule top to bottom — needs no arithmetic from the user.
  function addLine() {
    setLines(ls => [
      ...ls,
      { id: `m${ls.length}${Math.random().toString(36).slice(2, 7)}`, milestone: "", percent: scheduleRemaining(ls) },
    ])
  }

  // Capped at what is free, so the total can never pass 100%.
  function setPercent(line: PaymentMilestone, raw: string) {
    const value = Number(raw.replace(/[^\d.]/g, ""))
    const free = 100 - scheduleTotal(lines.filter(l => l.id !== line.id))
    patchLine(line.id, { percent: Math.max(0, Math.min(Number.isFinite(value) ? value : 0, free)) })
  }

  function save() {
    // A milestone with no description would print as a blank row.
    onSave(lines.filter(l => l.milestone.trim()))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger render={<Button size="sm" variant="outline" className="mt-2" />}>
        <ListChecks className="h-3.5 w-3.5" />
        {schedule.length
          ? `Payment schedule · ${schedule.length} milestone${schedule.length > 1 ? "s" : ""}`
          : "Set the payment schedule"}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        collisionAvoidance={{ fallbackAxisSide: "none" }}
        className="max-h-(--available-height) w-[26rem] gap-0 overflow-y-auto p-0"
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <p className="flex-1 text-sm font-medium">Payment schedule</p>
          <span className={`text-xs tabular-nums ${remaining === 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
            {scheduleTotal(lines)}% allocated
            {remaining > 0 && ` · ${remaining}% left`}
          </span>
        </div>

        <div className="flex flex-col gap-2 px-3 py-2.5">
          {lines.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No milestones yet. Each one takes a share of the approved bid.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {lines.map((line, i) => (
                <li key={line.id} className="flex items-center gap-1.5">
                  <span className="w-3 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <Input
                    value={line.milestone}
                    onChange={e => patchLine(line.id, { milestone: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Milestone, as it prints"
                    className="h-8 min-w-0 flex-1 text-sm"
                  />
                  <div className="relative w-16 shrink-0">
                    <Input
                      value={String(line.percent)}
                      onChange={e => setPercent(line, e.target.value)}
                      disabled={!canEdit}
                      inputMode="decimal"
                      className="h-8 pr-5 text-right text-sm tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {formatMoney(milestoneAmount(line.percent, bidAmount))}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => setLines(ls => ls.filter(l => l.id !== line.id))}
                      aria-label={`Remove milestone ${i + 1}`}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}

          {canEdit && (
            <Button variant="outline" size="sm" onClick={addLine} disabled={remaining === 0}>
              <Plus className="h-3.5 w-3.5" />
              Add milestone
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
          {/* What the percentages add up to in money — the number that has to
              match the bid, sitting next to the button that commits it. */}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {bidAmount === null ? (
              "Amounts appear once the bid carries a price"
            ) : (
              <>
                Total split:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(milestoneAmount(scheduleTotal(lines), bidAmount))}
                </span>
              </>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!canEdit}>Save schedule</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
