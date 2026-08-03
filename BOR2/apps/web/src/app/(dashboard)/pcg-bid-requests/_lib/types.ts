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
}

export type TradeIconKey =
  | "foundation" | "excavation" | "framing" | "deck" | "glass" | "landscaping"
  | "plumbing" | "electrical" | "hvac" | "insulation" | "roofing" | "gutters"
  | "siding" | "masonry" | "drywall" | "painting" | "tile" | "flooring" | "trim"
  | "general"

// ── Projects ────────────────────────────────────────────────────────────────

export type ProjectStatus = "active" | "on_hold" | "completed"

// The eight states a trade moves through. Trades with no bid form skip
// straight from not_started to contract_draft.
export type TradeStatus =
  | "not_started" | "bid_draft" | "bid_sent" | "bid_received"
  | "bid_approved" | "contract_draft" | "contract_sent" | "contract_signed"

export type ProjectTrade = {
  tradeId: string
  status: TradeStatus
  subcontractor: string
  bidAmount: number | null
  answers: Record<string, string | string[]>
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
