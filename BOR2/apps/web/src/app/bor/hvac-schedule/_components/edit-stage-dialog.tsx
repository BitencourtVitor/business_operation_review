"use client"

import { useMemo, useState } from "react"
import { ArrowRight, CalendarIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateHVACStages } from "@/hooks/use-forecast"
import {
  editPlan, formatDate, STAGES,
  type ProjectStages, type Stage,
} from "../_lib/stages"

// Mexer na data de uma etapa à mão.
//
// Duas coisas que a tela não deixa passar: a justificativa é obrigatória, e o
// que vai ser gravado aparece por escrito antes de confirmar. A segunda existe
// por causa da cascata — empurrar uma etapa mexe nas seguintes, e ninguém
// deveria descobrir isso depois de salvar.
export function EditStageDialog({
  lot, stage, open, onOpenChange,
}: {
  lot: ProjectStages
  stage: Stage
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [start, setStart] = useState<Date | null>(stage.start)
  const [end, setEnd] = useState<Date | null>(stage.end)
  const [cascade, setCascade] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")

  const save = useUpdateHVACStages()

  const isLast = STAGES[STAGES.length - 1].key === stage.key
  const plan = useMemo(
    () => editPlan(lot, stage.key, start, end, cascade),
    [lot, stage.key, start, end, cascade],
  )

  async function confirm() {
    setError("")
    if (!note.trim()) {
      setError("Write why this date is changing.")
      return
    }
    if (plan.changes.length === 0) {
      setError("Nothing changed yet.")
      return
    }
    try {
      await save.mutateAsync({ id: lot.project.id, dates: plan.dates, note: note.trim() })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{stage.label}</DialogTitle>
          <DialogDescription>
            The purchase date is recalculated on its own — it is never typed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <DateField label="Start" value={start} onChange={setStart} />
          <DateField label="End" value={end} onChange={setEnd} />
        </div>

        {!isLast && (
          <label className="flex items-start gap-2.5 rounded-lg border p-3">
            <Checkbox
              checked={cascade}
              onCheckedChange={v => setCascade(v === true)}
              disabled={!stage.start || !start}
            />
            <span className="text-sm">
              Move the following stages by the same number of days
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {stage.start
                  ? "Start and end move together, so no stage gets shorter."
                  : "Needs a previous start date to know how far to move."}
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stage-note">Why</Label>
          <Textarea
            id="stage-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Client moved the schedule, crew unavailable, inspection delayed…"
          />
        </div>

        {plan.changes.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {plan.changes.length === 1 ? "1 date will change" : `${plan.changes.length} dates will change`}
            </p>
            {plan.changes.map(c => (
              <p key={c.label} className="flex items-center gap-2 text-xs tabular-nums">
                <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                <span className="text-muted-foreground">{formatDate(c.from)}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{formatDate(c.to)}</span>
              </p>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DateField({
  label, value, onChange,
}: {
  label: string
  value: Date | null
  onChange: (date: Date | null) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" className="justify-between font-normal">
              {value ? formatDate(value) : <span className="text-muted-foreground">No date</span>}
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0" positionerStyle={{ width: "auto" }}>
          <Calendar
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? undefined}
            onSelect={date => {
              onChange(date ?? null)
              setOpen(false)
            }}
          />
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear date
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
