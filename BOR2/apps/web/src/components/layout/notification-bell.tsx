"use client"

import { useNotifications, useMarkNotificationViewed, useDeleteNotification } from "@/hooks/use-notifications"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Bell, Trash2, ExternalLink, CheckCheck } from "lucide-react"
import { useState } from "react"
import type { Notification } from "@/services/notification.service"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day:   "numeric",
    hour:  "2-digit",
    minute:"2-digit",
  })
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationRow({
  n,
  userID,
  onMarkViewed,
  onDelete,
  onClick,
}: {
  n:            Notification
  userID:       string
  onMarkViewed: (id: number) => void
  onDelete:     (id: number) => void
  onClick:      (n: Notification) => void
}) {
  const isRead = n.viewedBy.includes(userID)

  return (
    <div
      className={`group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60 ${isRead ? "opacity-60" : ""}`}
      onClick={() => {
        if (!isRead) onMarkViewed(n.id)
        onClick(n)
      }}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-primary"}`} />

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${isRead ? "font-normal" : "font-semibold"}`}>{n.title}</p>
        <p className="truncate text-xs text-muted-foreground">{n.content}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/60">{formatDate(n.createdAt)}</p>
      </div>

      <button
        className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        title="Delete"
        onClick={e => { e.stopPropagation(); onDelete(n.id) }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationBell() {
  const { user }                                  = useAuth()
  const { data: notifications = [] }              = useNotifications()
  const markViewed                                = useMarkNotificationViewed()
  const deleteNotif                               = useDeleteNotification()

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [selected,    setSelected]    = useState<Notification | null>(null)
  const [modalOpen,   setModalOpen]   = useState(false)

  const userID = user?.id ?? ""
  const unread = notifications.filter(n => !n.viewedBy.includes(userID)).length

  function markAllRead() {
    notifications
      .filter(n => !n.viewedBy.includes(userID))
      .forEach(n => markViewed.mutate(n.id))
  }

  function openDetail(n: Notification) {
    setSelected(n)
    setModalOpen(true)
    setPopoverOpen(false)
  }

  return (
    <>
      {/* ── Bell trigger — Base UI uses render prop, not asChild ── */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          render={<Button variant="ghost" size="icon" className="relative" />}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent align="end" side="bottom" sideOffset={8} className="w-80 p-0">

          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={markAllRead}
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-20" />
              <p className="text-xs">No notifications</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[360px]">
              <div className="px-1 py-1">
                {notifications.map(n => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    userID={userID}
                    onMarkViewed={id => markViewed.mutate(id)}
                    onDelete={id => deleteNotif.mutate(id)}
                    onClick={openDetail}
                  />
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-3 py-2">
              <button
                className="flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => { setSelected(null); setModalOpen(true); setPopoverOpen(false) }}
              >
                <ExternalLink className="h-3 w-3" />
                View all notifications
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Detail / All modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? selected.title : "All Notifications"}</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">{formatDate(selected.createdAt)}</p>
              <p className="text-sm leading-relaxed">{selected.content}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Bell className="h-10 w-10 opacity-20" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="space-y-1 pr-2">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={`group rounded-lg border p-3 transition-colors ${
                        n.viewedBy.includes(userID)
                          ? "border-border/40 opacity-60"
                          : "border-primary/20 bg-primary/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${n.viewedBy.includes(userID) ? "font-normal" : "font-semibold"}`}>
                            {n.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{n.content}</p>
                          <p className="mt-1.5 text-[10px] text-muted-foreground/60">{formatDate(n.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {!n.viewedBy.includes(userID) && (
                            <button
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title="Mark as read"
                              onClick={() => markViewed.mutate(n.id)}
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete"
                            onClick={() => deleteNotif.mutate(n.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
