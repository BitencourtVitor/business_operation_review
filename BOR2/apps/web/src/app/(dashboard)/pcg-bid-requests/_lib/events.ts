import { formatLeadTime } from "./format"
import { EVENT_STATUS } from "./types"
import type {
  DocumentParams, DocumentBlock, ProjectTrade, Trade, TradeEvent, TradeEventType, TradeRevision,
} from "./types"

// ── Revisions ───────────────────────────────────────────────────────────────

// Content-addressed: the same definition always yields the same id, so editing a
// trade and undoing it does not spawn a second revision.
function hash(value: string): string {
  let h = 5381
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function revisionId(trade: Trade, blocks: DocumentBlock[]): string {
  return `${trade.id}-${hash(JSON.stringify({ trade, blocks }))}`
}

export function makeRevision(trade: Trade, blocks: DocumentBlock[], now: string): TradeRevision {
  return { id: revisionId(trade, blocks), tradeId: trade.id, revisedAt: now, trade, blocks }
}

// The bid request, and nothing else: the heading, the standard note, the
// questions with their options, and the company blocks that print on a bid.
// Deliberately excludes work included, exclusions, the responsibility matrix and
// the conditional rules — none of that reaches the sub at pricing time, it lands
// in the contract's Exhibit A. Rewriting scope text must not invalidate a price
// that was already given against this form.
export function questionnaireId(trade: Trade, blocks: DocumentBlock[]): string {
  return hash(JSON.stringify({
    name: trade.name,
    code: trade.code,
    standardNote: trade.standardNote,
    questions: trade.questions,
    blocks: blocks.filter(b => b.scope === "bid" || b.scope === "both"),
  }))
}

// ── Status ──────────────────────────────────────────────────────────────────

export function lastEvent(pt: ProjectTrade): TradeEvent | null {
  return pt.events.length ? pt.events[pt.events.length - 1] : null
}

// Draft states have no event behind them — they are simply "opened, and someone
// has started filling it in".
export function currentStatus(trade: Trade | undefined, pt: ProjectTrade) {
  const last = lastEvent(pt)
  if (last && last.type !== "created") return EVENT_STATUS[last.type]
  const started = Object.values(pt.answers).some(v => (Array.isArray(v) ? v.length > 0 : !!v?.trim()))
  if (!started) return "not_started" as const
  return trade?.hasBidForm ? ("bid_draft" as const) : ("contract_draft" as const)
}

// Every step of the ladder, in order — shown whole so the stages are legible,
// even the ones that cannot be logged yet.
export function eventFlow(trade: Trade | undefined): TradeEventType[] {
  return trade?.hasBidForm
    ? ["bid_sent", "bid_received", "bid_approved", "contract_sent", "contract_signed"]
    : ["contract_sent", "contract_signed"]
}

// The bid round in force right now: it starts at the last send whose paper
// matches what the trade says today. Change an answer and that send stops
// counting — the round restarts, and a price received against the old paper is
// no longer a step already taken.
export function roundEvents(pt: ProjectTrade, current: DocumentParams | null): TradeEvent[] {
  let start = -1
  pt.events.forEach((e, i) => {
    if (e.type === "bid_sent" && sameParams(e.params, current)) start = i
  })
  return start < 0 ? [] : pt.events.slice(start + 1)
}

// What can honestly be logged next. A price cannot come back from a bid that was
// never sent, and a bid cannot be approved before the questionnaire is finished.
export function availableEventTypes(
  trade: Trade | undefined,
  pt: ProjectTrade,
  { complete, current }: { complete: boolean; current: DocumentParams | null },
): TradeEventType[] {
  const has = (type: TradeEventType) => pt.events.some(e => e.type === type)

  if (!trade?.hasBidForm) {
    const out: TradeEventType[] = []
    if (complete && !has("contract_sent")) out.push("contract_sent")
    if (has("contract_sent") && !has("contract_signed")) out.push("contract_signed")
    return out
  }

  const approved = lastOfType(pt, "bid_approved")
  const approvedAndCurrent = !!approved && sameParams(approved.params, current)
  const round = roundEvents(pt, current)
  const sentThisRound = pt.events.some(e => e.type === "bid_sent" && sameParams(e.params, current))
  const receivedThisRound = round.some(e => e.type === "bid_received")

  // One step at a time: a paper already out is not offered again until something
  // makes it stale. Change an answer and the round restarts, so the send comes
  // back on its own.
  const out: TradeEventType[] = []
  if (complete && !approvedAndCurrent && !sentThisRound) out.push("bid_sent")
  if (sentThisRound && !approvedAndCurrent && !receivedThisRound) out.push("bid_received")
  if (complete && receivedThisRound && !approvedAndCurrent) out.push("bid_approved")
  if (approvedAndCurrent && !has("contract_sent")) out.push("contract_sent")
  if (has("contract_sent") && !has("contract_signed")) out.push("contract_signed")
  return out
}

// Why nothing can be logged, when that is the case — worth saying out loud
// instead of leaving a dead button.
export function blockedReason(
  trade: Trade | undefined,
  pt: ProjectTrade,
  { complete }: { complete: boolean; current?: DocumentParams | null },
): string {
  if (!complete) return "Finish the questionnaire first"
  if (pt.events.some(e => e.type === "contract_signed")) return "This trade is finished"
  if (trade?.hasBidForm && pt.events.some(e => e.type === "bid_approved")) {
    return "Nothing to log — the approved bid still matches the answers"
  }
  return "Nothing to log at this point"
}

// The one task the trade is waiting on, in the order the work actually happens.
// Read from the state, not from the first option offered — after an approval you
// can still re-record a price, but that is not what the trade is waiting for.
export type NextStep = { label: string; tone: "ready" | "warn" | "done" | "plain" }

export function nextStepHint(
  trade: Trade | undefined,
  pt: ProjectTrade,
  { complete, staleApproval }: { complete: boolean; staleApproval: boolean },
): NextStep {
  const has = (type: TradeEventType) => pt.events.some(e => e.type === type)

  if (has("contract_signed")) return { label: "Finished", tone: "done" }
  if (has("contract_sent")) return { label: "File the signed contract", tone: "plain" }
  if (staleApproval) return { label: "Waiting on a new approval", tone: "warn" }
  if (!complete) return { label: "Fill in the questionnaire", tone: "plain" }
  // Approved — or never needed approving. Either way the contract can go out.
  if (!trade?.hasBidForm || has("bid_approved")) {
    return { label: "Ready to generate the contract", tone: "ready" }
  }
  if (has("bid_received")) return { label: "Approve the bid", tone: "plain" }
  if (has("bid_sent")) return { label: "Record the sub's price and lead time", tone: "plain" }
  return { label: "Send the bid request to the sub", tone: "plain" }
}

export const STEP_TONE: Record<NextStep["tone"], string> = {
  ready: "text-emerald-500",
  warn:  "text-amber-500",
  done:  "text-muted-foreground",
  plain: "text-muted-foreground",
}

// The price is whatever the sub last quoted — it is not typed anywhere else, so
// it cannot drift away from the event that produced it.
export function bidAmountOf(pt: ProjectTrade): number | null {
  const received = lastOfType(pt, "bid_received")
  return received?.amount ?? null
}

export function leadTimeOf(pt: ProjectTrade): string {
  const received = lastOfType(pt, "bid_received")
  return received ? formatLeadTime(received.leadTimeValue, received.leadTimeUnit) : ""
}

// Whoever the last piece of paper went to. Assigning a sub is not a separate
// action — it is part of sending them something.
export function subcontractorOf(pt: ProjectTrade): string {
  for (let i = pt.events.length - 1; i >= 0; i--) {
    if (pt.events[i].subcontractor) return pt.events[i].subcontractor
  }
  return ""
}

// The events that put paper in a sub's hands, and therefore name them.
export const NAMES_SUBCONTRACTOR: TradeEventType[] = ["bid_sent", "contract_sent"]

export function eventsOfType(pt: ProjectTrade, type: TradeEventType): TradeEvent[] {
  return pt.events.filter(e => e.type === type)
}

export function lastOfType(pt: ProjectTrade, type: TradeEventType): TradeEvent | null {
  const list = eventsOfType(pt, type)
  return list.length ? list[list.length - 1] : null
}

// ── Re-approval ─────────────────────────────────────────────────────────────

// Same paper, same answers. "Same paper" means the form the sub priced, not the
// whole trade — see questionnaireId.
export function sameParams(a: DocumentParams | null, b: DocumentParams | null): boolean {
  if (!a || !b) return false
  if (a.questionnaireId !== b.questionnaireId) return false
  return JSON.stringify(normalize(a.answers)) === JSON.stringify(normalize(b.answers))
}

function normalize(answers: DocumentParams["answers"]) {
  return Object.keys(answers).sort().map(k => [k, answers[k]])
}

export type ParamDiff = { questionId: string; label: string; approved: string; current: string }

// What changed between the approved paper and what the questionnaire says today.
export function diffParams(trade: Trade, approved: DocumentParams, current: DocumentParams): ParamDiff[] {
  const show = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v.join(", ") : (v ?? "").trim() || "—"

  const ids = new Set([...Object.keys(approved.answers), ...Object.keys(current.answers)])
  const out: ParamDiff[] = []
  for (const id of ids) {
    const before = show(approved.answers[id])
    const after = show(current.answers[id])
    if (before === after) continue
    const q = trade.questions.find(x => x.id === id)
    out.push({ questionId: id, label: q?.label ?? id, approved: before, current: after })
  }
  return out
}

// ── Editing an event's date ─────────────────────────────────────────────────

// The timeline reads dates in local time, so the day an event belongs to has to
// be drawn there too — not from the UTC slice of the timestamp.
export function eventDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Midday, so a timezone shift can never push the day across midnight.
export function dayToISO(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString()
}

// The whole ladder as one order. The contract-only flow is a subsequence of it,
// so a single table ranks any two events.
const STEP_ORDER: TradeEventType[] = [
  "created", "bid_sent", "bid_received", "bid_approved", "contract_sent", "contract_signed",
]

// Chronological by the day it happened — and inside a day, by the ladder, never
// by the clock: `at` carries a real time only on "created", a placeholder midday
// on everything else, so comparing timestamps would put a bid ahead of the
// opening it came from. Two events of the same step on the same day fall back to
// the order they were typed in.
export function compareEvents(a: TradeEvent, b: TradeEvent): number {
  const day = eventDay(a.at).localeCompare(eventDay(b.at))
  if (day !== 0) return day
  const step = STEP_ORDER.indexOf(a.type) - STEP_ORDER.indexOf(b.type)
  if (step !== 0) return step
  return a.recordedAt.localeCompare(b.recordedAt)
}

// The ladder is a sequence of facts: a bid cannot come back before it went out,
// and a contract cannot be signed before it was sent. Events are stored in the
// order they happened, so correcting a date is only honest inside the window its
// neighbours leave open. Both ends are inclusive — two steps can share a day.
export function eventDateBounds(
  events: TradeEvent[], eventId: string,
): { min: string | null; max: string | null } {
  const i = events.findIndex(e => e.id === eventId)
  if (i < 0) return { min: null, max: null }
  return {
    min: i > 0 ? eventDay(events[i - 1].at) : null,
    max: i < events.length - 1 ? eventDay(events[i + 1].at) : null,
  }
}

// A new event lands at the end of the ladder, so its only floor is the last
// thing that happened: a price cannot come back on a day before the bid went
// out. There is no ceiling — nothing is scheduled after it yet.
export function newEventMinDay(events: TradeEvent[]): string | null {
  const last = events[events.length - 1]
  return last ? eventDay(last.at) : null
}

export function clampNewEventDate(events: TradeEvent[], at: string): string {
  const min = newEventMinDay(events)
  return min && eventDay(at) < min ? dayToISO(min) : at
}

// Last line of defence: the picker already hides the days outside the window,
// but nothing that writes to the history gets to bypass the order.
export function clampEventDate(events: TradeEvent[], eventId: string, at: string): string {
  const { min, max } = eventDateBounds(events, eventId)
  const day = eventDay(at)
  if (min && day < min) return dayToISO(min)
  if (max && day > max) return dayToISO(max)
  return at
}

export function nextEventId(pt: ProjectTrade): string {
  const used = new Set(pt.events.map(e => e.id))
  let n = pt.events.length + 1
  while (used.has(`e${n}`)) n++
  return `e${n}`
}
