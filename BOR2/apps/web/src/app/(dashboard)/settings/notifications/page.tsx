"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { useAllNotifications, useCreateNotification, useUpdateNotification, useDeleteNotification } from "@/hooks/use-notifications"
import { useUsers } from "@/hooks/use-settings"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  ArrowLeft, Bell, CalendarClock, Check, Clock, Loader2,
  Pencil, Plus, Send, ShieldAlert, Trash2, Users,
} from "lucide-react"
import type { Notification } from "@/services/notification.service"
import type { UserWithPermissions } from "@/services/settings.service"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour:  "2-digit", minute: "2-digit",
  })
}

function isScheduled(n: Notification): boolean {
  if (!n.scheduledAt) return false
  return new Date(n.scheduledAt) > new Date()
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const roleMeta: Record<string, { label: string; className: string }> = {
  dev:     { label: "Developer", className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  owner:   { label: "Owner",     className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  manager: { label: "Manager",   className: "border-primary/40 bg-primary/10 text-primary" },
  user:    { label: "User",      className: "border-border bg-secondary text-foreground" },
}

function RoleBadge({ role }: { role: string }) {
  const m = roleMeta[role] ?? { label: role, className: "border-border bg-secondary text-foreground" }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${m.className}`}>
      {m.label}
    </span>
  )
}

// ─── Notification form modal ──────────────────────────────────────────────────

const inputBase =
  "w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const inputCls  = `${inputBase} h-8 py-0`
const areaCls   = `${inputBase} py-2 resize-none`

function NotificationFormModal({
  open, onClose, existing, users,
}: {
  open:     boolean
  onClose:  () => void
  existing: Notification | null
  users:    UserWithPermissions[]
}) {
  const isEdit       = !!existing
  const createNotif  = useCreateNotification()
  const updateNotif  = useUpdateNotification()

  const [title,        setTitle]        = useState(existing?.title   ?? "")
  const [content,      setContent]      = useState(existing?.content ?? "")
  const [recipients,   setRecipients]   = useState<Set<string>>(new Set(existing?.recipients ?? []))
  const [allUsers,     setAllUsers]     = useState(false)
  const [scheduleMode, setScheduleMode] = useState(!!existing?.scheduledAt)
  const [scheduledAt,  setScheduledAt]  = useState(
    existing?.scheduledAt ? new Date(existing.scheduledAt).toISOString().slice(0, 16) : ""
  )

  useEffect(() => {
    setTitle(existing?.title   ?? "")
    setContent(existing?.content ?? "")
    setRecipients(new Set(existing?.recipients ?? []))
    setAllUsers(false)
    setScheduleMode(!!existing?.scheduledAt)
    setScheduledAt(existing?.scheduledAt ? new Date(existing.scheduledAt).toISOString().slice(0, 16) : "")
  }, [existing])

  function toggleRecipient(id: string) {
    setRecipients(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setAllUsers(false)
  }

  function toggleAll(checked: boolean) {
    setAllUsers(checked)
    setRecipients(checked ? new Set(users.map(u => u.id)) : new Set())
  }

  async function handleSubmit() {
    if (!title.trim() || !content.trim() || recipients.size === 0) return
    const payload = {
      title:       title.trim(),
      content:     content.trim(),
      recipients:  Array.from(recipients),
      scheduledAt: scheduleMode && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    }
    if (isEdit) {
      await updateNotif.mutateAsync({ id: existing!.id, data: payload })
    } else {
      await createNotif.mutateAsync(payload)
    }
    onClose()
  }

  const pending    = createNotif.isPending || updateNotif.isPending
  const canSubmit  = title.trim().length > 0 && content.trim().length > 0 && recipients.size > 0

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {isEdit ? "Edit Notification" : "New Notification"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input
              className={inputCls}
              placeholder="Notification title…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              className={areaCls}
              placeholder="Write your message…"
              rows={3}
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          {/* Schedule toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={scheduleMode}
              onCheckedChange={v => setScheduleMode(v === true)}
            />
            <label
              className="flex cursor-pointer items-center gap-1.5 text-sm"
              onClick={() => setScheduleMode(p => !p)}
            >
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              Schedule for later
            </label>
          </div>

          {scheduleMode && (
            <div className="space-y-1.5 pl-6">
              <label className="text-xs font-medium text-muted-foreground">Send at</label>
              <DateTimePicker
                value={scheduledAt}
                onChange={setScheduledAt}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
          )}

          {/* Recipients */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Recipients
              {recipients.size > 0 && (
                <span className="ml-1 text-primary">({recipients.size} selected)</span>
              )}
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 transition-colors hover:bg-primary/10">
              <Checkbox checked={allUsers} onCheckedChange={v => toggleAll(v === true)} />
              <span className="text-sm font-medium">All users</span>
              <span className="ml-auto text-xs text-muted-foreground">{users.length} users</span>
            </label>

            <div className="max-h-52 overflow-y-auto rounded-md border">
              <div className="p-1.5">
                {users.map(u => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-muted">
                    <Checkbox
                      checked={recipients.has(u.id)}
                      onCheckedChange={() => toggleRecipient(u.id)}
                    />
                    <span className="flex-1 truncate text-sm">{u.name}</span>
                    <RoleBadge role={u.role} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions — fixed outside scroll */}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || pending}>
            {pending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
              : isEdit
                ? <><Check className="h-3.5 w-3.5" />Save Changes</>
                : scheduleMode
                  ? <><CalendarClock className="h-3.5 w-3.5" />Schedule</>
                  : <><Send className="h-3.5 w-3.5" />Send Now</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteModal({ open, onClose, notif }: { open: boolean; onClose: () => void; notif: Notification | null }) {
  const del = useDeleteNotification()
  async function confirm() {
    if (!notif) return
    await del.mutateAsync(notif.id)
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            Delete Notification
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Delete <span className="font-medium text-foreground">"{notif?.title}"</span>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={del.isPending}>
            {del.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><Trash2 className="h-3.5 w-3.5" />Delete</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  const { user }                               = useAuth()
  const { data: notifications = [], isLoading } = useAllNotifications()
  const { data: users = [] }                   = useUsers()

  const [formOpen,     setFormOpen]     = useState(false)
  const [editTarget,   setEditTarget]   = useState<Notification | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null)

  if (user && !["admin", "dev", "owner"].includes(user.role)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-8 w-px bg-border" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                Create, schedule and manage system notifications
              </p>
            </div>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="h-3.5 w-3.5" />
            New Notification
          </Button>
        </div>

        {/* List */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b bg-muted/40 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notification</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recipients</span>
            <span className="w-32 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
            <span className="w-16 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div>
              {notifications.map((n, i) => {
                const scheduled = isScheduled(n)
                return (
                  <div
                    key={n.id}
                    className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30 ${i < notifications.length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    {/* Info */}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.content}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                        Created {formatDate(n.createdAt)}
                      </p>
                    </div>

                    {/* Recipients */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {n.recipients.length}
                    </div>

                    {/* Status */}
                    <div className="w-32 text-right">
                      {scheduled ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(n.scheduledAt!)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex w-16 items-center justify-end gap-1">
                      {scheduled && (
                        <button
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Edit"
                          onClick={() => { setEditTarget(n); setFormOpen(true) }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                        onClick={() => setDeleteTarget(n)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <NotificationFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null) }}
        existing={editTarget}
        users={users}
      />
      <DeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        notif={deleteTarget}
      />
    </>
  )
}
