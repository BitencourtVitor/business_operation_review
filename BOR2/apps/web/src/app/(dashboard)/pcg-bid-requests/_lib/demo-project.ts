import type { Project } from "./types"
import { TRADES_SEED } from "./trades-seed"
import { DOCUMENT_BLOCKS_SEED } from "./document-blocks-seed"
import { questionnaireId, revisionId } from "./events"
// The real ids of the seeded Siding definition — with made-up ones the approval
// would read as stale forever, and putting an answer back would never clear it.
const SIDING_TRADE = TRADES_SEED.find(t => t.id === "siding")!
const SIDING_REV = revisionId(SIDING_TRADE, DOCUMENT_BLOCKS_SEED)
const SIDING_QID = questionnaireId(SIDING_TRADE, DOCUMENT_BLOCKS_SEED)
// A worked example, not PCG data: one trade with a bid form and one without, far
// enough along to exercise events, frozen params and the re-approval warning.
// Remove this file and its use in projects-store.ts to drop it.
const DAY = (d: number) => new Date(2026, 6, d, 12, 0).toISOString()
// What the Siding questionnaire says today.
const SIDING_ANSWERS: Record<string, string> = {
  q1: "Fiber Cement HardiePlank", q2: "James Hardie HZ10", q3: "7\" lap", q4: "5/16\"",
  q5: "Pre-Painted", q6: "Arctic White", q7: "Same as Siding", q8: "Azek PVC",
  q9: "5/4 x 4", q10: "Yes", q11: "Yes", q12: "No", q13: "Yes All Windows",
  q14: "Yes All Doors", q15: "No", q16: "Yes Included", q17: "Vinyl", q18: "Yes",
  q19: "Yes Included", q20: "Aluminum", q21: "No", q22: "Tyvek HomeWrap",
  q23: "Yes", q24: "2", q25: "Yes", q26: "No", q27: "Yes",
}
// What was on the paper the sub priced: house wrap was in the scope back then.
const SIDING_APPROVED = { ...SIDING_ANSWERS, q21: "Yes Included" }
export const DEMO_PROJECT: Project = {
  id: "demo-willow-creek",
  name: "Demo — Willow Creek, Lot 42",
  address: "4210 Willow Creek Dr, Charlotte, NC 28216",
  status: "active",
  createdAt: DAY(6),
  trades: [
    {
      // Bid form trade: sent, priced, approved — then an answer changed, which is
      // what puts the re-approval warning on screen.
      tradeId: "siding",
      answers: SIDING_ANSWERS,
      events: [
        { id: "e1", type: "created", at: DAY(6), recordedAt: DAY(6), by: "Vitor Bitencourt", note: "", params: null, url: "", amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "" },
        {
          id: "e2", type: "bid_sent", at: DAY(9), recordedAt: DAY(9), by: "Vitor Bitencourt",
          note: "Sent with the elevation set from 07/08",
          params: { tradeRevisionId: SIDING_REV, questionnaireId: SIDING_QID, answers: SIDING_APPROVED }, amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "Carolina Exteriors LLC",
          url: "",
        },
        {
          id: "e3", type: "bid_received", at: DAY(15), recordedAt: DAY(16), by: "Vitor Bitencourt", note: "",
          params: null, url: "", amount: 48250, leadTimeValue: 12, leadTimeUnit: "weeks", subcontractor: "",
        },
        {
          id: "e4", type: "bid_approved", at: DAY(17), recordedAt: DAY(17), by: "Vitor Bitencourt", note: "",
          params: { tradeRevisionId: SIDING_REV, questionnaireId: SIDING_QID, answers: SIDING_APPROVED }, amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "",
          url: "",
        },
      ],
    },
    {
      // Direct contract trade: no bid round, straight to the contract.
      tradeId: "foundation",
      answers: {
        q1: "New Construction", q2: "Yes", q3: "No", q4: "Yes", q5: "Yes",
        q6: "Yes", q7: "Yes", q8: "No",
        q9: "Pour scheduled after the utility trench is backfilled and compacted.",
      },
      events: [
        { id: "e1", type: "created", at: DAY(6), recordedAt: DAY(6), by: "Vitor Bitencourt", note: "", params: null, url: "", amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "" },
        { id: "e2", type: "contract_sent", at: DAY(20), recordedAt: DAY(20), by: "Vitor Bitencourt", note: "", params: null, url: "", amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "Piedmont Concrete Co" },
        {
          id: "e3", type: "contract_signed", at: DAY(24), recordedAt: DAY(25), by: "Vitor Bitencourt", note: "Countersigned copy filed",
          params: null, amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "",
          url: "https://premiumcontractors.sharepoint.com/sites/contracts/Willow-Creek-42-Foundation.pdf",
        },
      ],
    },
  ],
}
