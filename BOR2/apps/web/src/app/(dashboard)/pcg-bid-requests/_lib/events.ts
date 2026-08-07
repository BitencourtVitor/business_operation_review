import { formatLeadTime } from "./format"
import { EVENT_STATUS } from "./types"
import type {
  DocumentParams, DocumentBlock, LeadTimeUnit, PaymentMilestone, ProjectTrade, Trade, TradeEvent,
  TradeEventType, TradeRevision,
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

// The questionnaire, and nothing else: the heading, the standard note and the
// questions with their options. This is the only thing a new approval hangs on
// — what was asked of the sub, and what was answered.
// Deliberately excludes work included, exclusions, the responsibility matrix and
// the conditional rules — none of that reaches the sub at pricing time, it lands
// in the contract's Exhibit A. It also excludes the document blocks: contract
// wording changes through a contract adjustment, logged with the sub, and the
// step after an adjustment is the signature, not another approval. Hashing them
// here meant renumbering one paragraph in the catalog tore up every outstanding
// approval on every project at once.
export function questionnaireId(trade: Trade): string {
  return hash(JSON.stringify({
    name: trade.name,
    code: trade.code,
    standardNote: trade.standardNote,
    questions: trade.questions,
  }))
}

// ── Status ──────────────────────────────────────────────────────────────────

export function lastEvent(pt: ProjectTrade): TradeEvent | null {
  return pt.events.length ? pt.events[pt.events.length - 1] : null
}

// The last event that moved the trade along. An adjustment is a fact about the
// paper, not a step on the ladder, so it never becomes the trade's status —
// otherwise rewriting a clause on a signed contract would un-sign it.
function lastStatusEvent(pt: ProjectTrade): TradeEvent | null {
  for (let i = pt.events.length - 1; i >= 0; i--) {
    if (EVENT_STATUS[pt.events[i].type]) return pt.events[i]
  }
  return null
}

// Draft states have no event behind them — they are simply "opened, and someone
// has started filling it in".
export function currentStatus(trade: Trade | undefined, pt: ProjectTrade) {
  const last = lastStatusEvent(pt)
  if (last && last.type !== "created") return EVENT_STATUS[last.type]!
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
// Starts at the *first* send of the current paper and includes it: a round is
// every sub the same form went to, not just what came after the last envelope.
export function roundEvents(pt: ProjectTrade, current: DocumentParams | null): TradeEvent[] {
  const start = pt.events.findIndex(e => e.type === "bid_sent" && sameParams(e.params, current))
  return start < 0 ? [] : pt.events.slice(start)
}

// The round as a table: one line per sub the form went to, with what they
// answered and how it ended. This is what makes "listing all sent" possible —
// the history alone reads as a pile of events.
export type RoundBid = {
  subcontractor: string
  sentAt: string
  amount: number | null
  leadTimeValue: number | null
  leadTimeUnit: LeadTimeUnit
  receivedAt: string | null
  outcome: "approved" | "declined" | null
}

export function roundBids(pt: ProjectTrade, current: DocumentParams | null): RoundBid[] {
  const out: RoundBid[] = []
  const find = (sub: string) => out.find(b => b.subcontractor === sub)

  for (const e of roundEvents(pt, current)) {
    const sub = e.subcontractor
    if (!sub) continue
    if (e.type === "bid_sent" && !find(sub)) {
      out.push({
        subcontractor: sub, sentAt: e.at, amount: null,
        leadTimeValue: null, leadTimeUnit: "weeks", receivedAt: null, outcome: null,
      })
      continue
    }
    const bid = find(sub)
    if (!bid) continue
    if (e.type === "bid_received") {
      bid.amount = e.amount
      bid.leadTimeValue = e.leadTimeValue
      bid.leadTimeUnit = e.leadTimeUnit
      bid.receivedAt = e.at
    }
    if (e.type === "bid_approved") bid.outcome = "approved"
    if (e.type === "bid_declined") bid.outcome = "declined"
  }
  return out
}

// The steps that settle how the price is paid. Anything else that carries a
// schedule is data nobody wrote through the UI.
export const SETS_SCHEDULE: TradeEventType[] = ["bid_approved", "contract_adjustment"]

// The schedule the contract prints: the last one agreed. An adjustment supersedes
// the approval; without one, the approval still stands. Read off the history for
// the same reason status and price are — one place the answer comes from.
export function scheduleInForce(pt: ProjectTrade): PaymentMilestone[] {
  for (let i = pt.events.length - 1; i >= 0; i--) {
    const schedule = pt.events[i].paymentSchedule
    if (schedule?.length) return schedule
  }
  return []
}

// The last thing that happened to this one sub. Read back off the round rather
// than off the history, because the round already collapsed the events into the
// only four states a bid can be in.
export function lastBidEventType(bid: RoundBid): TradeEventType {
  if (bid.outcome === "approved") return "bid_approved"
  if (bid.outcome === "declined") return "bid_declined"
  return bid.receivedAt ? "bid_received" : "bid_sent"
}

// What can honestly be logged next. A price cannot come back from a bid that was
// never sent, and a bid cannot be approved before the questionnaire is finished.
export function availableEventTypes(
  trade: Trade | undefined,
  pt: ProjectTrade,
  { complete, current }: { complete: boolean; current: DocumentParams | null },
): TradeEventType[] {
  const has = (type: TradeEventType) => pt.events.some(e => e.type === type)

  // An adjustment can be logged as long as there is paper out that has not been
  // signed yet — that is exactly the window where a sub argues a clause. Once,
  // though: the adjustment is the record that this contract was renegotiated,
  // and everything that was renegotiated lives in the terms and the schedule it
  // carries. A second one would say the same thing twice and split that record
  // between two rows.
  const adjustable =
    has("contract_sent") && !has("contract_signed") && !has("contract_adjustment")

  if (!trade?.hasBidForm) {
    const out: TradeEventType[] = []
    if (complete && !has("contract_sent")) out.push("contract_sent")
    if (adjustable) out.push("contract_adjustment")
    if (has("contract_sent") && !has("contract_signed")) out.push("contract_signed")
    return out
  }

  const approved = approvalInForce(pt)
  const approvedAndCurrent = !!approved && sameParams(approved.params, current)
  const bids = roundBids(pt, current)

  // The same form goes to as many subs as PCG wants, and each of them answers on
  // their own. What cannot happen twice is the approval: one bid wins the trade.
  const awaitingPrice = bids.some(b => !b.receivedAt)
  const undecided = bids.some(b => b.receivedAt && !b.outcome)

  const out: TradeEventType[] = []
  if (complete && !approvedAndCurrent) out.push("bid_sent")
  if (awaitingPrice && !approvedAndCurrent) out.push("bid_received")
  if (complete && undecided && !approvedAndCurrent) out.push("bid_approved")
  if (undecided) out.push("bid_declined")
  // The sub won, then came back saying they do not do part of it. The answers
  // already say so; this is what carries the approval over to them.
  if (complete && !!approved && !approvedAndCurrent) out.push("bid_adjustment")
  if (approvedAndCurrent && !has("contract_sent")) out.push("contract_sent")
  if (adjustable) out.push("contract_adjustment")
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
  if (has("bid_sent")) return { label: "Record the sub's price and set the term", tone: "plain" }
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
// The price of the bid that won. With several subs answering the same form, the
// last price typed in is just the last one typed in — it is the approval that
// says which of them the contract is written against.
function winningBid(pt: ProjectTrade): TradeEvent | null {
  const approved = lastOfType(pt, "bid_approved")
  if (approved?.subcontractor) {
    const theirs = pt.events.filter(
      e => e.type === "bid_received" && e.subcontractor === approved.subcontractor,
    )
    if (theirs.length) return theirs[theirs.length - 1]
  }
  return lastOfType(pt, "bid_received")
}

export function bidAmountOf(pt: ProjectTrade): number | null {
  return winningBid(pt)?.amount ?? null
}

export function leadTimeOf(pt: ProjectTrade): string {
  const bid = winningBid(pt)
  return bid ? formatLeadTime(bid.leadTimeValue, bid.leadTimeUnit) : ""
}

// The sub the trade belongs to: whoever won the bid, and before that whoever the
// last piece of paper went to. Assigning a sub is not a separate action — it is
// part of sending them something, or of picking their price.
export function subcontractorOf(pt: ProjectTrade): string {
  const approved = lastOfType(pt, "bid_approved")
  if (approved?.subcontractor) return approved.subcontractor
  for (let i = pt.events.length - 1; i >= 0; i--) {
    if (pt.events[i].subcontractor) return pt.events[i].subcontractor
  }
  return ""
}

// The events that name a sub: the ones that put paper in their hands, and the
// ones that decide their bid.
export const NAMES_SUBCONTRACTOR: TradeEventType[] = [
  "bid_sent", "bid_received", "bid_approved", "bid_declined", "contract_sent",
]

export function eventsOfType(pt: ProjectTrade, type: TradeEventType): TradeEvent[] {
  return pt.events.filter(e => e.type === type)
}

export function lastOfType(pt: ProjectTrade, type: TradeEventType): TradeEvent | null {
  const list = eventsOfType(pt, type)
  return list.length ? list[list.length - 1] : null
}

// The approval in force. An adjustment is the sub coming back with "I do not do
// this part" after winning: the answers change, but the approval moves with them
// instead of being torn up — which is what editing the questionnaire by hand
// would do.
export function approvalInForce(pt: ProjectTrade): TradeEvent | null {
  for (let i = pt.events.length - 1; i >= 0; i--) {
    const e = pt.events[i]
    if (e.type === "bid_approved" || e.type === "bid_adjustment") return e
  }
  return null
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
// Every type has a place here, including the ones that are not steps of their
// own: left out, indexOf returns -1 and they sink below the opening of the trade
// on their own day. A refusal belongs to the step it decides — the same step as
// the approval — so the two sit together, with the approval last because it is
// the outcome that closes the step. Same for an adjustment: it follows the
// paper it adjusts.
const STEP_ORDER: TradeEventType[] = [
  "created", "bid_sent", "bid_received",
  "bid_declined", "bid_approved", "bid_adjustment",
  // An adjustment sits between sending and signing: it is what the sub asked for
  // after reading the paper, and it has to be settled before they sign it.
  "contract_sent", "contract_adjustment", "contract_signed",
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
// Sending is the exception, because it is not a step on the ladder but another
// envelope in the same round: the same form goes to several subs, and those
// envelopes do not queue behind each other. One logged after a price already
// came back from another sub still left on the day it left.
export function newEventMinDay(events: TradeEvent[], type: TradeEventType): string | null {
  if (type === "bid_sent") return null
  const last = events[events.length - 1]
  return last ? eventDay(last.at) : null
}

export function clampNewEventDate(events: TradeEvent[], at: string, type: TradeEventType): string {
  const min = newEventMinDay(events, type)
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
