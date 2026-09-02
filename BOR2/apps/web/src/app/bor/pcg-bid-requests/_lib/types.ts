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

// The free-text note that closes the printed form. It is not a question — no
// trade defines it and it never counts towards completeness — but it is part of
// the paper the sub prices, so it rides in the answer map with the rest.
export const NOTES_KEY = "__notes"
export const NOTES_LABEL = "Additional Notes"

// ── Contract document number ────────────────────────────────────────────────

// Three letters of the trade, five digits of a single system-wide sequence:
// PLB-00001, ELC-00002. The counter is global, so the digits say how many
// contracts PCG has issued in all, and the letters say which trade this one is.
export const DOC_NUMBER_DIGITS = 5

export function formatDocumentNumber(code: string, seq: number): string {
  return `${code}-${String(seq).padStart(DOC_NUMBER_DIGITS, "0")}`
}

// The trade's three letters. Trades carried a BRF- prefix that said nothing —
// every trade was BRF — so the code is the three letters that follow it. Read
// defensively rather than assumed: a catalog saved before the change still has
// "BRF-PLB" stored, and a trade created by hand may have anything.
export function tradeShortCode(trade: Pick<Trade, "code" | "name">): string {
  const raw = (trade.code ?? "").toUpperCase()
  const tail = raw.split("-").pop() ?? ""
  if (/^[A-Z]{3}$/.test(tail)) return tail
  // Never seen a code: fall back to the name's first three letters, so a trade
  // added in the catalog still prints something meaningful.
  const letters = trade.name.toUpperCase().replace(/[^A-Z]/g, "")
  return letters.slice(0, 3).padEnd(3, "X") || "XXX"
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

// What a module is made of. `text` is written in the modal; `generated` is drawn
// by the renderer from the trade and the answers; `locked` is standing text
// nobody edits. Position is the one thing all three share — a generated or
// locked module cannot be rewritten, but it can be moved.
export type DocumentBlockKind = "text" | "generated" | "locked"

// The generated modules the renderer knows how to draw. Every contract has to
// carry both, so they are modules with a fixed body, not optional blocks.
export type GeneratedModule = "scope_of_work" | "signatures" | "payment_schedule"

// A module of the document body. The frame around it — letterhead, title, the
// project data table, the footer — stays in the renderer: those are not text
// anybody edits, they are the shape of the paper.
export type DocumentBlock = {
  id: string
  title: string
  body: string
  scope: DocumentScope
  kind: DocumentBlockKind
  // Numbered modules take the next number in the document they print on, so
  // deleting section 4 renumbers what follows instead of leaving a hole.
  numbered: boolean
  generated: GeneratedModule | null
}

// Order is the array's order. Kept as position rather than a stored field so
// there is no second source of truth to drift — the modal reorders the list.
export function documentModules(blocks: DocumentBlock[], scope: "bid" | "contract"): DocumentBlock[] {
  return blocks.filter(b => b.scope === scope || b.scope === "both")
}

// The number each module prints with, counted over the numbered ones only.
export function moduleNumbers(modules: DocumentBlock[]): Map<string, number> {
  const out = new Map<string, number>()
  let n = 0
  for (const m of modules) if (m.numbered) out.set(m.id, ++n)
  return out
}

export const DOCUMENT_SCOPE_LABEL: Record<DocumentScope, string> = {
  bid:      "Bid requests",
  contract: "Contracts",
  both:     "Both",
}

export const DOCUMENT_KIND_LABEL: Record<DocumentBlockKind, string> = {
  text:      "Editable",
  generated: "Generated",
  locked:    "Standard",
}

// What a generated module is called in the list. It draws its own heading (or
// none at all) in the document, so the title field is usually empty — without
// this the modal would call every one of them the same thing.
export const GENERATED_MODULE_TITLE: Record<GeneratedModule, string> = {
  scope_of_work:    "Exhibit A: Scope of Work",
  signatures:       "Signatures",
  payment_schedule: "Payment schedule",
}

export const GENERATED_MODULE_LABEL: Record<GeneratedModule, string> = {
  scope_of_work:    "Built from the trade's scope and the approved specifications",
  signatures:       "Signature blocks for both parties",
  payment_schedule: "The milestones agreed on this contract, priced from the approved bid",
}

// The catalog itself defines the keys — see trade-icons.ts.
export type { TradeIconKey } from "./trade-icons"

// ── Projects ────────────────────────────────────────────────────────────────

export type ProjectStatus = "active" | "on_hold" | "completed"

// What kind of job this is. Asked once for the house, not once per trade — the
// bid and the contract both carry it, right under the address.
export type ProjectType = "new_construction" | "addition" | "renovation"

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  new_construction: "New Construction",
  addition:         "Addition",
  renovation:       "Renovation",
}

export const PROJECT_TYPES: ProjectType[] = ["new_construction", "addition", "renovation"]

// The nine states a trade moves through. Trades with no bid form skip
// straight from not_started to contract_draft.
//
// `questionnaire_pending` não é um degrau da escada: é a marca de que a obra tem
// evento lançado sem o questionário respondido. Ela some sozinha quando a última
// pergunta é respondida, e por isso é derivada, nunca gravada.
export type TradeStatus =
  | "not_started" | "questionnaire_pending" | "bid_draft" | "bid_sent" | "bid_received"
  | "bid_approved" | "contract_draft" | "contract_sent" | "contract_signed"

// Only two things are stored: what was asked, and what happened. Status, price
// and the sub are all read off the history — see _lib/events.ts.
// A line of the payment schedule. The percentage is what is agreed; the money is
// always derived from it and the approved bid, so the two can never disagree.
export type PaymentMilestone = {
  id: string
  milestone: string
  percent: number
}

export function scheduleTotal(schedule: PaymentMilestone[]): number {
  return schedule.reduce((sum, m) => sum + (Number.isFinite(m.percent) ? m.percent : 0), 0)
}

// What is left to hand out. Never negative — the editor caps at 100.
export function scheduleRemaining(schedule: PaymentMilestone[]): number {
  return Math.max(0, 100 - scheduleTotal(schedule))
}

export function milestoneAmount(percent: number, total: number | null): number | null {
  return total === null ? null : Math.round(total * percent) / 100
}

export type ProjectTrade = {
  tradeId: string
  events: TradeEvent[]
  answers: Record<string, string | string[]>
  // Stamped the first time a contract is generated and never recomputed: the
  // number printed on the paper somebody signed cannot move because another
  // contract was created, deleted or reordered afterwards. Absent on trades
  // whose contract was never generated. Bid requests have no number — they are
  // a set of questions and answers, not an identifiable document.
  contractNumber?: string
  // Standing text rewritten for this contract alone: module id -> body. A sub who
  // argues one clause — $35.00 an hour against their $40.00 — changes their own
  // paper, never PCG's catalog or anybody else's contract.
  moduleOverrides: Record<string, string>
}

// What the document actually prints for a module: the override if this contract
// has one, the catalog's text otherwise.
export function moduleBody(block: DocumentBlock, overrides: ProjectTrade["moduleOverrides"]): string {
  const override = overrides?.[block.id]
  return override === undefined ? block.body : override
}

// ── Event history ───────────────────────────────────────────────────────────

export type TradeEventType =
  | "created" | "bid_sent" | "bid_received" | "bid_approved"
  | "bid_declined" | "bid_adjustment"
  | "contract_sent" | "contract_signed" | "contract_adjustment"

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

// How long PCG gives the trade. Set by us when the price comes back, not quoted
// by the sub. A count and the scale it is counted in, never prose — "12 weeks"
// typed by hand cannot be compared, sorted or converted.
export type LeadTimeUnit = "days" | "weeks" | "months"

export type TradeEvent = {
  id: string
  type: TradeEventType
  at: string           // the day it happened, as told by whoever logged it
  // Nem todo evento importado sabe o dia em que aconteceu. `at` continua
  // preenchido — é ele que ordena a linha do tempo inteira, e um nulo aqui
  // quebraria a ordenação, os limites de data e os documentos —, mas a tela
  // mostra "data não informada" em vez de uma data que ninguém afirmou.
  atUnknown?: boolean
  recordedAt: string   // when it was typed in — the two differ, and both matter
  by: string           // who logged it, taken from the session
  note: string
  params: DocumentParams | null   // captured by the events that put paper out
  url: string                     // SharePoint link, on contract_signed
  amount: number | null           // the price the sub quoted, on bid_received
  leadTimeValue: number | null    // the term PCG sets for the work, on bid_received
  leadTimeUnit: LeadTimeUnit      // the scale that count is read in
  subcontractor: string           // who it went to, on the events that send paper
  // How the price is to be paid, on the events that settle it: the approval
  // agrees one, a contract adjustment renegotiates it. Carried by the event and
  // not by the trade, so renegotiating does not rewrite what was approved —
  // what the sub agreed to in August is still readable in October. Absent on
  // every other event, which is most of them.
  paymentSchedule?: PaymentMilestone[]
}

// What an already-logged event lets you correct. The step itself, the frozen
// params and the audit trail are deliberately out: a bid that went out is not
// retroactively a different step, and who typed it in when is not editable.
export type TradeEventEdit = Partial<
  Pick<TradeEvent, "at" | "atUnknown" | "note" | "url" | "amount" | "leadTimeValue" | "leadTimeUnit" | "subcontractor">
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
  created:             "Trade opened",
  bid_sent:            "Bid sent to sub",
  bid_received:        "Bid received from sub",
  bid_approved:        "Bid approved",
  bid_declined:        "Bid declined",
  bid_adjustment:      "Bid adjusted by the sub",
  contract_sent:       "Contract sent to sub",
  contract_signed:     "Contract signed",
  contract_adjustment: "Contract adjusted",
}

// The status each event lands the trade on. An adjustment is deliberately absent:
// rewriting a clause is not a step forward or back, so the trade stays where the
// last real step left it.
export const EVENT_STATUS: Partial<Record<TradeEventType, TradeStatus>> = {
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
  type: ProjectType
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
  questionnaire_pending: "Questionnaire pending",
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
