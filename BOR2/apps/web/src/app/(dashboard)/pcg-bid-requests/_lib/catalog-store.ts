import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { DocumentBlock, Trade, TradeRevision } from "./types"
import { TRADES_SEED } from "./trades-seed"
import { DOCUMENT_BLOCKS_SEED } from "./document-blocks-seed"
import { makeRevision } from "./events"

// Local-only while the page is being designed — moves to the Railway API once
// the shape settles. Everything here is the catalog PCG edits by hand today.
interface CatalogState {
  trades: Trade[]
  documentBlocks: DocumentBlock[]
  // Frozen copies of what documents were generated from, addressed by content.
  revisions: Record<string, TradeRevision>
  subcontractors: string[]
  addTrade: (trade: Trade) => void
  updateTrade: (id: string, patch: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  setDocumentBlocks: (blocks: DocumentBlock[]) => void
  captureRevision: (trade: Trade) => string
  addSubcontractor: (name: string) => void
  removeSubcontractor: (name: string) => void
}

// The em dash cleanup landed in the seed, and under merge-never-overwrites it
// can no longer reach a catalog that is already stored. This rewrites the
// character in place: same clauses, same decisions, only the punctuation the
// documents are not supposed to carry. The pairs are the ones the seed uses; a
// dash the list does not know becomes a comma, which never breaks a sentence.
const DASH_PAIRS: [string, string][] = [
  [" — to be defined", ", to be defined"],
  [" — performed by", "; performed by"],
  [" — installed by", "; installed by"],
  [" — obtained and coordinated by GC", "; obtained and coordinated by GC"],
  [" — priced separately", "; priced separately"],
  [" — scope and pricing TBD", ", scope and pricing TBD"],
  [" — scope TBD", "; scope TBD"],
  [" — responsibility of Licensed Surveyor", ", responsibility of Licensed Surveyor"],
  [" — TBD per project requirements", ", TBD per project requirements"],
  [" — delivered in advance", ", delivered in advance"],
]

function undash(text: string): string {
  if (!text.includes("—")) return text
  let out = text
  for (const [from, to] of DASH_PAIRS) out = out.split(from).join(to)
  return out.split(" — ").join(", ")
}

function undashTrade(trade: Trade): Trade {
  return {
    ...trade,
    name: undash(trade.name),
    standardNote: undash(trade.standardNote),
    questions: trade.questions.map(q => ({
      ...q,
      label: undash(q.label),
      hint: undash(q.hint),
      options: q.options.map(undash),
    })),
    workIncluded: trade.workIncluded.map(undash),
    exclusions: trade.exclusions.map(undash),
    responsibilityMatrix: trade.responsibilityMatrix.map(undash),
    rules: trade.rules.map(r => ({
      ...r,
      value: undash(r.value),
      clauses: r.clauses.map(undash),
      replaces: undash(r.replaces),
    })),
  }
}

// An empty scope section is a gap, not a decision: it prints a contract with no
// body. So a section the store left empty takes the seed's, while anything
// already written stays exactly as written. Declared above the store because
// rehydration runs while this module is still evaluating.
function fillScopeGaps(trade: Trade): Trade {
  const seed = TRADES_SEED.find(t => t.id === trade.id)
  if (!seed) return trade
  return {
    ...trade,
    workIncluded: trade.workIncluded?.length ? trade.workIncluded : seed.workIncluded,
    exclusions: trade.exclusions?.length ? trade.exclusions : seed.exclusions,
    responsibilityMatrix: trade.responsibilityMatrix?.length
      ? trade.responsibilityMatrix
      : seed.responsibilityMatrix,
  }
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      trades: TRADES_SEED,
      documentBlocks: DOCUMENT_BLOCKS_SEED,
      revisions: {},
      subcontractors: [],
      addTrade: (trade) => set(s => ({ trades: [...s.trades, trade] })),
      updateTrade: (id, patch) => set(s => ({
        trades: s.trades.map(t => (t.id === id ? { ...t, ...patch } : t)),
      })),
      deleteTrade: (id) => set(s => ({ trades: s.trades.filter(t => t.id !== id) })),
      setDocumentBlocks: (blocks) => set({ documentBlocks: blocks }),
      captureRevision: (trade) => {
        const { documentBlocks, revisions } = get()
        const rev = makeRevision(trade, documentBlocks, new Date().toISOString())
        if (!revisions[rev.id]) set({ revisions: { ...revisions, [rev.id]: rev } })
        return rev.id
      },
      addSubcontractor: (name) => set(s => (
        s.subcontractors.includes(name) ? s : { subcontractors: [...s.subcontractors, name].sort() }
      )),
      removeSubcontractor: (name) => set(s => ({ subcontractors: s.subcontractors.filter(n => n !== name) })),
    }),
    {
      name: "pcg-bid-requests-catalog",
      storage: createJSONStorage(() => localStorage),
      // v2 fixed options that collapsed into duplicates, v3 dropped "Free text"
      // pseudo-hints and split "qty: ___" into its own field, v4 spelled "TBD"
      // out and title-cased option labels, v5 dropped leftover paper-form blanks
      // ("R-___", "Qty: ___"), v7 added conditional rules per trade and
      // company-level document blocks, v9 dropped the demo trade, v10 gave
      // Landscaping its bid form back and added revisions, v11 took the em
      // dashes out of everything that reaches the paper, v12 wrote the standard
      // scope for the 13 trades that had none, v13 rewrote the em dashes that
      // v11 never reached because the bump raced the seed it was delivering.
      version: 13,
      // Rewrites punctuation in what is already stored. Independent of the seed
      // on purpose: it transforms the strings it finds, so nothing about it can
      // race a recompile the way v11 and v12 did.
      migrate: (state) => {
        const s = (state ?? {}) as CatalogState
        return {
          ...s,
          trades: (s.trades ?? []).map(undashTrade),
          documentBlocks: (s.documentBlocks ?? []).map(b => ({
            ...b, title: undash(b.title), body: undash(b.body),
          })),
        }
      },
      // Up to v11 a bump replaced the whole catalog with the seed, which was
      // fine while the catalog was only development scaffolding. It now carries
      // scope text somebody typed and signed off on, so the seed only ever fills
      // gaps: a trade the store already has keeps exactly what it says, and only
      // trades it has never seen are added. Same for blocks. Revisions are the
      // record of what was already put on paper, untouchable either way.
      //
      // This runs on every rehydration, not on a version bump. A bump fires once
      // and can land before the seed it was meant to deliver has even compiled,
      // which is exactly how v12 first shipped nothing.
      merge: (persisted, current) => {
        const s = (persisted ?? {}) as Partial<CatalogState>
        const trades = s.trades ?? []
        const blocks = s.documentBlocks ?? []
        const knownTrade = new Set(trades.map(t => t.id))
        const knownBlock = new Set(blocks.map(b => b.id))
        return {
          ...current,
          ...s,
          trades: [
            ...trades.map(fillScopeGaps),
            ...TRADES_SEED.filter(t => !knownTrade.has(t.id)),
          ],
          documentBlocks: [...blocks, ...DOCUMENT_BLOCKS_SEED.filter(b => !knownBlock.has(b.id))],
          revisions: s.revisions ?? {},
        }
      },
    }
  )
)

export function emptyTrade(): Trade {
  return {
    id: `trade-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    code: null,
    icon: "general",
    hasBidForm: true,
    standardNote: "",
    questions: [],
    workIncluded: [],
    exclusions: [],
    responsibilityMatrix: [],
    rules: [],
  }
}

export function emptyDocumentBlock(): DocumentBlock {
  return {
    id: `block-${Math.random().toString(36).slice(2, 9)}`,
    title: "",
    body: "",
    scope: "both",
    placement: "after_sections",
  }
}

export function nextQuestionId(trade: Trade): string {
  const used = new Set(trade.questions.map(q => q.id))
  let n = trade.questions.length + 1
  while (used.has(`q${n}`)) n++
  return `q${n}`
}
