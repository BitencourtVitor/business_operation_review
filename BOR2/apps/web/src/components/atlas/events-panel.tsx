"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import {
  useAtlasEvents, useAtlasReplies, useCreateAtlasEvent, useCreateAtlasReply,
  useUpdateAtlasEvent,
} from "@/hooks/use-atlas"
import type { AtlasEvent } from "@/services/atlas.service"
import { CheckCircle2, MapPin, MessageSquare, Plus, Send } from "lucide-react"
import { useState } from "react"

const KINDS = [
  ["comment", "Comment"], ["issue", "Issue"], ["task", "Task"], ["rfi", "RFI"],
] as const

const STATUS: Record<string, { label: string; className: string }> = {
  open:     { label: "Open",       className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  answered: { label: "Answered",   className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  resolved: { label: "Resolved",   className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
}

function Thread({ event, jobsiteId, canWrite, sheetId }: {
  event: AtlasEvent; jobsiteId: string; canWrite: boolean; sheetId?: string
}) {
  const { data: replies } = useAtlasReplies(event.id)
  const reply = useCreateAtlasReply(event.id, jobsiteId)
  const update = useUpdateAtlasEvent(jobsiteId, sheetId)
  const [text, setText] = useState("")

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
      {replies?.map(r => (
        <div key={r.id} className="flex flex-col gap-0.5 rounded-md bg-muted/40 p-2.5">
          <span className="text-xs font-medium">{r.authorName || "—"}</span>
          <span className="whitespace-pre-wrap text-sm">{r.body}</span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(r.createdAt).toLocaleString()}
          </span>
        </div>
      ))}

      {canWrite && (
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Reply"
            onKeyDown={e => {
              if (e.key === "Enter" && text.trim()) {
                reply.mutate(text.trim(), { onSuccess: () => setText("") })
              }
            }}
          />
          <Button
            size="icon"
            variant="outline"
            disabled={!text.trim() || reply.isPending}
            onClick={() => reply.mutate(text.trim(), { onSuccess: () => setText("") })}
          >
            <Send className="h-4 w-4" />
          </Button>
          {event.status !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate({ eventId: event.id, patch: { status: "resolved" } })}
            >
              <CheckCircle2 className="h-4 w-4" />
              Resolve
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Eventos da obra (AT-15). Um evento pode estar ancorado num ponto da folha ou
 * ser da obra inteira — o pin na planta é a mesma linha, com coordenada.
 */
export function EventsPanel({ jobsiteId, canWrite, sheetId }: {
  jobsiteId: string; canWrite: boolean; sheetId?: string
}) {
  const { data: events, isLoading } = useAtlasEvents(jobsiteId, sheetId)
  const create = useCreateAtlasEvent(jobsiteId, sheetId)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [form, setForm] = useState({ kind: "issue", title: "", body: "" })

  function submit() {
    if (!form.title.trim() && !form.body.trim()) return
    create.mutate({ ...form, sheetId: sheetId ?? null } as Partial<AtlasEvent>, {
      onSuccess: () => { setForm({ kind: "issue", title: "", body: "" }); setOpen(false) },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" variant={open ? "ghost" : "outline"} onClick={() => setOpen(!open)}>
            <Plus className="h-4 w-4" />
            {open ? "Cancel" : "New event"}
          </Button>
        </div>
      )}

      {open && canWrite && (
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-kind">Kind</Label>
              <NativeSelect id="event-kind" value={form.kind}
                onChange={e => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="event-title">Title</Label>
              <Input id="event-title" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-body">Description</Label>
            <Textarea id="event-body" rows={3} value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Opening…" : "Open event"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : !events?.length ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">No events</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Issues, RFIs and field comments show up here — and on the drawing, when
            anchored to a sheet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map(e => {
            const status = STATUS[e.status]
            const isOpen = expanded === e.id
            return (
              <div key={e.id} className="rounded-lg border border-border/60 bg-card p-4">
                <button
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">
                      {e.title || e.body.slice(0, 60) || "Untitled"}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(e.createdAt).toLocaleDateString()}</span>
                      {e.pageX != null && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          pinned on the drawing
                        </span>
                      )}
                      {e.replies > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {e.replies}
                        </span>
                      )}
                    </p>
                  </div>
                  {status && <Badge variant="outline" className={status.className}>{status.label}</Badge>}
                </button>

                {isOpen && (
                  <div className="mt-3 flex flex-col gap-3">
                    {e.body && <p className="whitespace-pre-wrap text-sm">{e.body}</p>}
                    <Thread event={e} jobsiteId={jobsiteId} canWrite={canWrite} sheetId={sheetId} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
