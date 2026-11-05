"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Loader2, ShieldUser } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sep } from "@/components/common/insight-card"
import { workforceInsightsService, type EmployeeWeek, type OvertimeNote } from "@/services/workforce-insights.service"

const COLORS = { regular: "#3B82F6", overtime: "#EF4444" }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const fmtH = (v: number) => `${Math.round(v).toLocaleString("en-US")} h`

function WeekTip({ active, payload }: { active?: boolean; payload?: { payload: EmployeeWeek }[] }) {
  if (!active || !payload?.length) return null
  const w = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">Week of {day(w.weekStart)}</p>
      <p className="flex justify-between gap-6"><span style={{ color: COLORS.regular }}>Regular</span><span className="tabular-nums">{fmtH(w.regular)}</span></p>
      <p className="flex justify-between gap-6"><span style={{ color: COLORS.overtime }}>Overtime</span><span className="tabular-nums">{fmtH(w.overtime)}</span></p>
    </div>
  )
}

/** "O que aconteceu?" de uma semana: grava ao sair do campo; vazio apaga. */
function NoteField({ note, canEdit, onSave, saving }: { note?: OvertimeNote; canEdit: boolean; onSave: (text: string) => void; saving: boolean }) {
  const [text, setText] = useState(note?.note ?? "")
  useEffect(() => setText(note?.note ?? ""), [note?.note])
  if (!canEdit) return <p className="text-xs text-muted-foreground">{note?.note || "No note."}</p>
  return (
    <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="What happened this week?"
      onBlur={() => { if (text.trim() !== (note?.note ?? "")) onSave(text) }}
      disabled={saving}
      className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus:border-ring dark:bg-input/30" />
  )
}

/**
 * Semanas de uma pessoa (WF-16): barras por semana, regular em azul e overtime em vermelho, com a
 * linha das 40 h. Cada semana com overtime tem o "o que aconteceu?", gravado com o autor.
 */
export function EmployeeWeeksDialog({ company, year, employee, supervisor, canEdit, onClose }: {
  company: string; year: number; employee: string | null; supervisor: boolean; canEdit: boolean; onClose: () => void
}) {
  const qc = useQueryClient()
  const key = ["workforce-insights", "employee-weeks", company, year, employee]
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => workforceInsightsService.employeeWeeks(company, year, employee!),
    enabled: !!employee,
  })
  const save = useMutation({
    mutationFn: (n: { weekStart: string; note: string }) => workforceInsightsService.saveOvertimeNote({ company, employee: employee!, ...n }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Could not save the note"),
  })
  const weeks = data?.weeks ?? []
  const otWeeks = weeks.filter(w => w.overtime > 0.01).slice().reverse()
  const notes = new Map((data?.notes ?? []).map(n => [n.weekStart, n]))
  const total = weeks.reduce((s, w) => s + w.regular + w.overtime, 0)
  const ot = weeks.reduce((s, w) => s + w.overtime, 0)

  return (
    <Dialog open={!!employee} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            {employee}
            {supervisor && <span className="flex items-center gap-1 text-xs font-normal text-primary"><ShieldUser className="h-3.5 w-3.5" />Supervisor</span>}
            <span className="ml-auto mr-6 text-xs font-normal text-muted-foreground">
              {year}<Sep />{fmtH(total)}<Sep /><span className="text-red-600 dark:text-red-400">{fmtH(ot)} overtime</span><Sep />{otWeeks.length} weeks over 40 h
            </span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading</div>
        ) : (
          <>
            <div className="h-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks} margin={{ top: 12, right: 6, left: 0, bottom: 0 }} className="[&_*:focus]:outline-none">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="weekStart" tickFormatter={day} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<WeekTip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  <ReferenceLine y={40} stroke="var(--foreground)" strokeDasharray="4 3" strokeOpacity={0.5}
                    label={{ value: "40 h", position: "insideTopLeft", fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <Bar dataKey="regular" stackId="w" fill={COLORS.regular} animationDuration={500} />
                  <Bar dataKey="overtime" stackId="w" fill={COLORS.overtime} radius={[2, 2, 0, 0]} animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Weeks over 40 h: what happened?</p>
              {otWeeks.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">No overtime this year.</p> : (
                <div className="grid gap-2">
                  {otWeeks.map(w => {
                    const n = notes.get(w.weekStart)
                    return (
                      <div key={w.weekStart} className="grid gap-1 rounded-md border bg-muted/20 p-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium">Week of {day(w.weekStart)}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {fmtH(w.regular + w.overtime)}<Sep /><span className="text-red-600 dark:text-red-400">{fmtH(w.overtime)} over</span>
                          </span>
                        </div>
                        <NoteField note={n} canEdit={canEdit} saving={save.isPending} onSave={text => save.mutate({ weekStart: w.weekStart, note: text })} />
                        {n && <p className="text-[10px] text-muted-foreground">{n.author || "Someone"}<Sep />{day(n.updatedAt.slice(0, 10))}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
