import type { TradeIconKey } from "./trade-icons"

export type QuestionType = "select" | "yn" | "multi" | "text"

// ALL PROJECTS = answered on every bid request; OPTIONAL = only when the project calls for it.
export type QuestionTag = "all_projects" | "optional" | null

export type Question = {
  id: string
  label: string
  type: QuestionType
  options: string[]   // empty for "text"
  hint: string        // placeholder / free-text guidance shown under the field
  tag: QuestionTag
  // Source form asked "Yes / No — qty: ___": the count is a second answer, only
  // relevant once the choice is affirmative. `hint` holds its unit ("rooms", "flues").
  needsQuantity: boolean
}

// Quantity answers live under their own key so the answer map stays flat.
export function quantityKey(questionId: string): string {
  return `${questionId}__qty`
}

export type Trade = {
  id: string
  name: string
  code: string | null      // BRF-PLB and friends; null for trades that skip the bid form
  icon: TradeIconKey
  hasBidForm: boolean      // false = contract generated straight from the standard scope
  standardNote: string
  questions: Question[]
  workIncluded: string[]
  exclusions: string[]
  responsibilityMatrix: string[]
  rules: ScopeRule[]
}

// ── Conditional scope ───────────────────────────────────────────────────────

export type ScopeSection = "workIncluded" | "exclusions" | "responsibilityMatrix"

export type RuleOperator = "equals" | "includes" | "answered" | "not_answered"

// `add` appends the clauses; `remove` drops the baseline clause named in `replaces`;
// `replace` does both, so one condition can swap a standing clause for another wording.
export type RuleAction = "add" | "remove" | "replace"

// One rule emits N clauses — the relation between a definition on the trade and
// what lands in the document is 1:N, never 1:1.
export type ScopeRule = {
  id: string
  questionId: string
  operator: RuleOperator
  value: string            // ignored by "answered" / "not_answered"
  action: RuleAction
  target: ScopeSection
  clauses: string[]        // what `add` / `replace` writes into the section
  replaces: string         // baseline clause `remove` / `replace` takes out
}

export const SCOPE_SECTION_LABEL: Record<ScopeSection, string> = {
  workIncluded:         "Work included",
  exclusions:           "Exclusions",
  responsibilityMatrix: "Responsibility matrix",
}

export const RULE_OPERATOR_LABEL: Record<RuleOperator, string> = {
  equals:       "is",
  includes:     "includes",
  answered:     "is answered",
  not_answered: "is not answered",
}

export const RULE_ACTION_LABEL: Record<RuleAction, string> = {
  add:     "Add clauses",
  remove:  "Remove a clause",
  replace: "Replace a clause",
}

// ── Company-level document defaults ─────────────────────────────────────────

export type DocumentScope = "bid" | "contract" | "both"
export type DocumentPlacement = "before_sections" | "after_sections"

// Text that belongs to PCG, not to a trade — editing one changes every document.
export type DocumentBlock = {
  id: string
  title: string
  body: string
  scope: DocumentScope
  placement: DocumentPlacement
}

export const DOCUMENT_SCOPE_LABEL: Record<DocumentScope, string> = {
  bid:      "Bid requests",
  contract: "Contracts",
  both:     "Both",
}

export const DOCUMENT_PLACEMENT_LABEL: Record<DocumentPlacement, string> = {
  before_sections: "Before specifications",
  after_sections:  "After specifications",
}

// The catalog itself defines the keys — see trade-icons.ts.
export type { TradeIconKey } from "./trade-icons"

// ── Projects ────────────────────────────────────────────────────────────────

export type ProjectStatus = "active" | "on_hold" | "completed"

// The eight states a trade moves through. Trades with no bid form skip
// straight from not_started to contract_draft.
export type TradeStatus =
  | "not_started" | "bid_draft" | "bid_sent" | "bid_received"
  | "bid_approved" | "contract_draft" | "contract_sent" | "contract_signed"

// Only two things are stored: what was asked, and what happened. Status, price
// and the sub are all read off the history — see _lib/events.ts.
export type ProjectTrade = {
  tradeId: string
  events: TradeEvent[]
  answers: Record<string, string | string[]>
}

// ── Event history ───────────────────────────────────────────────────────────

export type TradeEventType =
  | "created" | "bid_sent" | "bid_received" | "bid_approved"
  | "contract_sent" | "contract_signed"

// What a document was generated from: which frozen definition of the trade, and
// which answers. Together they reproduce the exact paper the sub received.
export type DocumentParams = {
  // The whole frozen definition, so the document can be reproduced exactly.
  tradeRevisionId: string
  // Only the part of it the bid request puts in front of the sub. An approval is
  // measured against this one: rewriting Exhibit A's scope changes the trade,
  // but it does not change the form somebody already priced.
  questionnaireId: string
  answers: Record<string, string | string[]>
}

// How long the sub said it takes. A count and the scale it is counted in, never
// prose — "12 weeks" typed by hand cannot be compared, sorted or converted.
export type LeadTimeUnit = "days" | "weeks" | "months"

export type TradeEvent = {
  id: string
  type: TradeEventType
  at: string           // the day it happened, as told by whoever logged it
  recordedAt: string   // when it was typed in — the two differ, and both matter
  by: string           // who logged it, taken from the session
  note: string
  params: DocumentParams | null   // captured by the events that put paper out
  url: string                     // SharePoint link, on contract_signed
  amount: number | null           // the price the sub quoted, on bid_received
  leadTimeValue: number | null    // how long they said it takes, on bid_received
  leadTimeUnit: LeadTimeUnit      // the scale that count is read in
  subcontractor: string           // who it went to, on the events that send paper
}

// What an already-logged event lets you correct. The step itself, the frozen
// params and the audit trail are deliberately out: a bid that went out is not
// retroactively a different step, and who typed it in when is not editable.
export type TradeEventEdit = Partial<
  Pick<TradeEvent, "at" | "note" | "url" | "amount" | "leadTimeValue" | "leadTimeUnit" | "subcontractor">
>

// A frozen copy of everything the document is built from. Shared by every event
// that used it, so twenty projects on the same definition point at one object.
export type TradeRevision = {
  id: string
  tradeId: string
  revisedAt: string
  trade: Trade
  blocks: DocumentBlock[]
}

export const TRADE_EVENT_LABEL: Record<TradeEventType, string> = {
  created:         "Trade opened",
  bid_sent:        "Bid sent to sub",
  bid_received:    "Bid received from sub",
  bid_approved:    "Bid approved",
  contract_sent:   "Contract sent to sub",
  contract_signed: "Contract signed",
}

// The status each event lands the trade on.
export const EVENT_STATUS: Record<TradeEventType, TradeStatus> = {
  created:         "not_started",
  bid_sent:        "bid_sent",
  bid_received:    "bid_received",
  bid_approved:    "bid_approved",
  contract_sent:   "contract_sent",
  contract_signed: "contract_signed",
}

export type Project = {
  id: string
  name: string
  address: string
  status: ProjectStatus
  trades: ProjectTrade[]
  createdAt: string
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active:    "Active",
  on_hold:   "On hold",
  completed: "Completed",
}

export const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  not_started:     "Not started",
  bid_draft:       "Bid form draft",
  bid_sent:        "Bid sent to sub",
  bid_received:    "Bid received",
  bid_approved:    "Bid approved",
  contract_draft:  "Contract draft",
  contract_sent:   "Contract sent",
  contract_signed: "Contract signed",
}

// Order matters — the trade screen walks this list, and progress counts the last one.
export const TRADE_STATUS_FLOW: TradeStatus[] = [
  "not_started", "bid_draft", "bid_sent", "bid_received",
  "bid_approved", "contract_draft", "contract_sent", "contract_signed",
]

// A trade with no bid form has nothing to send or approve — it goes straight to contract.
export const DIRECT_CONTRACT_FLOW: TradeStatus[] = [
  "not_started", "contract_draft", "contract_sent", "contract_signed",
]

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  select: "Single choice",
  yn:     "Yes / No",
  multi:  "Multiple choice",
  text:   "Free text",
}

export const TAG_LABEL: Record<"all_projects" | "optional", string> = {
  all_projects: "All projects",
  optional:     "Optional",
}
