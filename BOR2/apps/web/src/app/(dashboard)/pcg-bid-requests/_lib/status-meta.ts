import {
  BadgeCheck, CheckCircle2, Circle, CircleCheck, FileText, Inbox, PauseCircle, PencilLine,
  PlayCircle, Send, SendHorizontal,
} from "lucide-react"
import type { ProjectStatus, TradeStatus } from "./types"

// Same treatment for the project's own condition.
export const PROJECT_STATUS_META: Record<ProjectStatus, {
  icon: React.ElementType
  text: string
  border: string
  bg: string
}> = {
  active:    { icon: PlayCircle,   text: "text-emerald-500",      border: "border-emerald-500/40", bg: "bg-emerald-500/[0.07]" },
  on_hold:   { icon: PauseCircle,  text: "text-amber-500",        border: "border-amber-500/40",   bg: "bg-amber-500/[0.07]" },
  completed: { icon: CheckCircle2, text: "text-muted-foreground", border: "border-border/60",      bg: "bg-muted/30" },
}

// One icon and one color per condition — the trade row reads at a glance.
export const STATUS_META: Record<TradeStatus, {
  icon: React.ElementType
  text: string
  border: string
  bg: string
  dot: string
}> = {
  not_started: {
    icon: Circle,
    text: "text-muted-foreground", border: "border-border/60", bg: "bg-muted/30", dot: "bg-muted-foreground/40",
  },
  bid_draft: {
    icon: PencilLine,
    text: "text-slate-400", border: "border-slate-400/40", bg: "bg-slate-400/[0.07]", dot: "bg-slate-400",
  },
  bid_sent: {
    icon: Send,
    text: "text-amber-500", border: "border-amber-500/40", bg: "bg-amber-500/[0.07]", dot: "bg-amber-500",
  },
  bid_received: {
    icon: Inbox,
    text: "text-orange-500", border: "border-orange-500/40", bg: "bg-orange-500/[0.07]", dot: "bg-orange-500",
  },
  bid_approved: {
    icon: CircleCheck,
    text: "text-teal-500", border: "border-teal-500/40", bg: "bg-teal-500/[0.07]", dot: "bg-teal-500",
  },
  contract_draft: {
    icon: FileText,
    text: "text-violet-400", border: "border-violet-400/40", bg: "bg-violet-400/[0.07]", dot: "bg-violet-400",
  },
  contract_sent: {
    icon: SendHorizontal,
    text: "text-blue-500", border: "border-blue-500/40", bg: "bg-blue-500/[0.07]", dot: "bg-blue-500",
  },
  contract_signed: {
    icon: BadgeCheck,
    text: "text-emerald-500", border: "border-emerald-500/40", bg: "bg-emerald-500/[0.07]", dot: "bg-emerald-500",
  },
}
