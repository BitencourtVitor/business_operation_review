"use client"

import { useForecastObs } from "@/hooks/use-forecast"
import { FileClock, Gauge, CodeXml, Loader2, MessageSquareText, User, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Same role iconography as Settings › Users, so a badge means the same thing everywhere. */
const ROLE_ICON: Record<string, { Icon: React.ElementType; className: string }> = {
  dev:     { Icon: CodeXml,   className: "text-yellow-600 dark:text-yellow-400" },
  owner:   { Icon: Gauge, className: "text-emerald-600 dark:text-emerald-400" },
  manager: { Icon: Users, className: "text-primary" },
  user:    { Icon: User,  className: "text-muted-foreground" },
  // Observations that predate authorship tracking, seeded by migration 000106.
  system:  { Icon: FileClock, className: "text-muted-foreground" },
}

/** First name only — the card and the history rows both credit the author this way. */
export function firstName(full?: string | null): string {
  if (!full) return ""
  return full.trim().split(/\s+/)[0] ?? ""
}

/** Timestamps arrive as UTC instants; render them in the reader's local date. */
export function fmtStamp(ts?: string | null): string {
  if (!ts) return ""
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

export function ObsCredit({
  author,
  role,
  at,
  className,
}: {
  author?: string | null
  role?: string | null
  at?: string | null
  className?: string
}) {
  const who  = firstName(author)
  const when = fmtStamp(at)
  if (!who && !when) return null

  const meta = role ? ROLE_ICON[role] : undefined

  return (
    <span className={cn("flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80", className)}>
      {meta && <meta.Icon className={cn("h-3 w-3 shrink-0", meta.className)} />}
      {who}
      {who && when && " · "}
      {when}
    </span>
  )
}

/**
 * Full observation trail for a project, oldest first.
 * Lives beside the modal body instead of inside it so the main column stays short.
 */
export function ObsHistoryPanel({
  projectId,
  open,
  onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  const { data: entries = [], isLoading } = useForecastObs(projectId, open)

  return (
    <div className="flex max-h-[85vh] w-full shrink-0 flex-col border-t bg-muted/20 sm:w-[320px] sm:border-l sm:border-t-0">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Observation History
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close observation history"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No observations recorded yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => (
              <div key={e.id} className="rounded-lg border bg-background px-3 py-2">
                <p className="whitespace-pre-wrap text-xs leading-relaxed">{e.body}</p>
                <div className="mt-1.5 flex items-center justify-end">
                  <ObsCredit author={e.authorName} role={e.authorRole} at={e.createdAt} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
