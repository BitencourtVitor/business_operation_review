"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, CalendarDays, CircleCheck, CircleDot, Loader2, MessageSquareText, Pencil, Plus, SendHorizontal, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { ROLE_ICON } from "@/components/features/forecast/obs-history"
import { useAuthStore } from "@/store/auth.store"
import { monthlyExecutionService, type GoalGroup, type ImprovementPoint } from "@/services/monthly-execution.service"
import { MONTH_NAMES } from "../_lib/series"

const stamp = (ts: string) =>
  new Date(ts).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" })

const KEY = ["monthly-execution", "points"]

/** Pontos de melhoria de um mês: o problema trazido, os job sites citados, o status e as respostas. */
export function PointsDialog({ year, month, points, groups, canEdit, onClose }: {
  year: number; month: number | null; points: ImprovementPoint[]; groups: GoalGroup[]; canEdit: boolean; onClose: () => void
}) {
  const qc = useQueryClient()
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY })
  const [adding, setAdding] = useState(false)
  if (month === null) return null
  const list = points.filter(p => p.month === month)

  return (
    <Dialog open onOpenChange={v => { if (!v) { setAdding(false); onClose() } }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Improvement points · {MONTH_NAMES[month - 1]} {year}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
          {list.length === 0 && !adding && <p className="text-xs text-muted-foreground">No points for this month.</p>}
          {list.map(p => <Point key={p.id} p={p} groups={groups} canEdit={canEdit} onChanged={refresh} />)}
          {adding && <PointEditor groups={groups} onCancel={() => setAdding(false)}
            onSave={(body, groupIds) => monthlyExecutionService.addPoint({ year, month, body, groupIds }).then(() => { setAdding(false); refresh() })} />}
        </div>

        {canEdit && !adding && (
          <Button variant="outline" size="sm" className="w-fit gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />Point
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusChip({ status }: { status: ImprovementPoint["status"] }) {
  return status === "resolved"
    ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" />Resolved</span>
    : <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><CircleDot className="h-3.5 w-3.5" />Pending</span>
}

function Point({ p, groups, canEdit, onChanged }: { p: ImprovementPoint; groups: GoalGroup[]; canEdit: boolean; onChanged: () => void }) {
  const me = useAuthStore(s => s.user?.id)
  const mine = !!me && p.authorId === me
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reply, setReply] = useState("")
  const role = ROLE_ICON[p.authorRole] ?? ROLE_ICON.user
  const named = groups.filter(g => p.groupIds.includes(g.id))

  const toggle = useMutation({
    mutationFn: () => monthlyExecutionService.setStatus(p.id, p.status === "pending" ? "resolved" : "pending"),
    onSuccess: onChanged,
    onError: () => toast.error("Could not change the status"),
  })
  const remove = useMutation({
    mutationFn: () => monthlyExecutionService.removePoint(p.id),
    onSuccess: onChanged,
    onError: () => toast.error("Could not delete the point"),
  })
  const send = useMutation({
    mutationFn: () => monthlyExecutionService.addReply(p.id, reply.trim()),
    onSuccess: () => { setReply(""); onChanged() },
    onError: () => toast.error("Could not post the reply"),
  })

  if (editing) {
    return <PointEditor groups={groups} initial={p} onCancel={() => setEditing(false)}
      onSave={(body, groupIds) => monthlyExecutionService.editPoint(p.id, body, groupIds).then(() => { setEditing(false); onChanged() })} />
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <role.Icon className={`h-3.5 w-3.5 ${role.className}`} />
        <span className="font-semibold text-foreground">{p.authorName || "Unknown"}</span>
        <CalendarDays className="ml-1.5 h-3.5 w-3.5" />
        <span className="tabular-nums">{stamp(p.createdAt)}</span>
        <span className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" disabled={!canEdit || toggle.isPending}
            onClick={() => toggle.mutate()} aria-label="Toggle status">
            <StatusChip status={p.status} />
          </Button>
          {mine && canEdit && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Edit point" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-red-600" aria-label="Delete point"
                disabled={remove.isPending} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </span>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" /> Delete this point?
            </AlertDialogTitle>
            <AlertDialogDescription>The point and its replies are removed for good.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><X className="h-4 w-4" /> Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => setConfirmDelete(false) })}>
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-sm break-words whitespace-pre-wrap">{p.body}</p>
      {named.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {named.map(g => (
            <span key={g.id} className="flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px]">
              <Building2 className="h-3 w-3 text-muted-foreground" />{g.name}
            </span>
          ))}
        </div>
      )}

      {p.replies.length > 0 && (
        <div className="grid gap-1.5 border-l-2 pl-3">
          {p.replies.map(r => {
            const rr = ROLE_ICON[r.authorRole] ?? ROLE_ICON.user
            return (
              <div key={r.id}>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <rr.Icon className={`h-3.5 w-3.5 ${rr.className}`} />
                  <span className="font-semibold text-foreground">{r.authorName || "Unknown"}</span>
                  <CalendarDays className="ml-1.5 h-3.5 w-3.5" />
                  <span className="tabular-nums">{stamp(r.createdAt)}</span>
                </div>
                <p className="text-sm break-words whitespace-pre-wrap">{r.body}</p>
              </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <InputGroup className="items-start">
          <InputGroupAddon className="pt-2.5"><MessageSquareText /></InputGroupAddon>
          <InputGroupTextarea rows={1} value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply (Ctrl+Enter to post)"
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && reply.trim()) send.mutate() }} />
          <InputGroupAddon align="inline-end" className="self-end pb-1.5">
            <InputGroupButton size="icon-xs" aria-label="Post reply" disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  )
}

/** Texto do ponto e os job sites citados (zero, um ou vários). */
function PointEditor({ groups, initial, onSave, onCancel }: {
  groups: GoalGroup[]; initial?: ImprovementPoint; onSave: (body: string, groupIds: string[]) => Promise<unknown>; onCancel: () => void
}) {
  const [body, setBody] = useState(initial?.body ?? "")
  const [ids, setIds] = useState<string[]>(initial?.groupIds ?? [])
  const save = useMutation({
    mutationFn: () => onSave(body.trim(), ids),
    onError: () => toast.error("Could not save the point"),
  })
  return (
    <div className="grid gap-2 rounded-lg border border-primary/40 p-3">
      <InputGroup className="items-start">
        <InputGroupAddon className="pt-2.5"><Pencil /></InputGroupAddon>
        <InputGroupTextarea autoFocus rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="What happened this month?"
          onKeyDown={e => {
            if (e.key === "Escape") { e.stopPropagation(); onCancel() }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) save.mutate()
          }} />
      </InputGroup>
      <div className="flex flex-wrap gap-1">
        {groups.map(g => {
          const on = ids.includes(g.id)
          return (
            <button key={g.id} onClick={() => setIds(on ? ids.filter(x => x !== g.id) : [...ids, g.id])}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <Building2 className="h-3 w-3" />{g.name}
            </button>
          )
        })}
      </div>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={onCancel}><X className="h-3.5 w-3.5" />Cancel</Button>
        <Button size="sm" className="h-7 gap-1" disabled={!body.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}Post
        </Button>
      </div>
    </div>
  )
}
