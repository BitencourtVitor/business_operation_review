"use client"

import { Check, FileText, Loader2, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScheduleEvent, ScheduleHistoryItem } from "@/services/buildings.service"
import { EventIcon, fmtDateStr } from "../_lib/utils"

export function UploadHistoryRow({ item, isLast }: { item: ScheduleHistoryItem; isLast: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5 py-2", !isLast && "border-b border-border/50")}>
      <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", item.is_current ? "bg-primary/15" : "bg-muted")}>
        <FileText className={cn("h-3 w-3", item.is_current ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-medium truncate">{item.pdf_filename}</span>
          {item.is_current && (
            <span className="shrink-0 flex items-center justify-center h-4 w-4 rounded-full bg-primary/15">
              <Check className="h-2.5 w-2.5 text-primary" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
          <span>{fmtDateStr(item.uploaded_at)}</span>
          {item.task_count != null && <span>· {item.task_count} tasks</span>}
        </div>
      </div>
    </div>
  )
}

export function EventHistoryRow({ item, isLast, onEdit, onDelete, deleting }: {
  item:     ScheduleEvent
  isLast:   boolean
  onEdit:   () => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className={cn("flex items-start gap-2.5 py-2", !isLast && "border-b border-border/50")}>
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: item.type_color + "22" }}>
        <EventIcon name={item.type_icon} className="h-3 w-3" style={{ color: item.type_color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{item.type_name}</span>
          {item.days_delayed > 0 && (
            <span className="shrink-0 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
              +{item.days_delayed}d
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateStr(item.event_date)}</div>
        {item.notes && <div className="text-[11px] text-muted-foreground truncate">{item.notes}</div>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={onEdit} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={onDelete} disabled={deleting} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}
