import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { Trade } from "./types"
import { TRADES_SEED } from "./trades-seed"

// Local-only while the page is being designed — moves to the Railway API once
// the shape settles. Everything here is the catalog PCG edits by hand today.
interface CatalogState {
  trades: Trade[]
  subcontractors: string[]
  addTrade: (trade: Trade) => void
  updateTrade: (id: string, patch: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  addSubcontractor: (name: string) => void
  removeSubcontractor: (name: string) => void
  resetCatalog: () => void
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set) => ({
      trades: TRADES_SEED,
      subcontractors: [],
      addTrade: (trade) => set(s => ({ trades: [...s.trades, trade] })),
      updateTrade: (id, patch) => set(s => ({
        trades: s.trades.map(t => (t.id === id ? { ...t, ...patch } : t)),
      })),
      deleteTrade: (id) => set(s => ({ trades: s.trades.filter(t => t.id !== id) })),
      addSubcontractor: (name) => set(s => (
        s.subcontractors.includes(name) ? s : { subcontractors: [...s.subcontractors, name].sort() }
      )),
      removeSubcontractor: (name) => set(s => ({ subcontractors: s.subcontractors.filter(n => n !== name) })),
      resetCatalog: () => set({ trades: TRADES_SEED }),
    }),
    {
      name: "pcg-bid-requests-catalog",
      storage: createJSONStorage(() => localStorage),
      // Reseeds on every bump: v2 fixed options that collapsed into duplicates,
      // v3 dropped "Free text" pseudo-hints and split "qty: ___" into its own
      // field, v4 spelled "TBD" out and title-cased option labels, v5 dropped
      // leftover paper-form blanks ("R-___", "Qty: ___").
      version: 6,
      migrate: (state, version) => (
        version < 6 ? { ...(state as CatalogState), trades: TRADES_SEED } : (state as CatalogState)
      ),
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
  }
}

export function nextQuestionId(trade: Trade): string {
  const used = new Set(trade.questions.map(q => q.id))
  let n = trade.questions.length + 1
  while (used.has(`q${n}`)) n++
  return `q${n}`
}
