import type { DocumentBlock } from "./types"

// Company-level text: belongs to PCG, not to any single trade. Wording carried
// over from the responsibility matrices in PCG_Scope_Questionnaire_AllTrades.xlsx,
// where the same Exhibit A clause was repeated on every trade.
export const DOCUMENT_BLOCKS_SEED: DocumentBlock[] = [
  {
    id: "block-exhibit-a",
    title: "Materials and Supply",
    body: "Any item listed as \"GC or Sub\" in the responsibility matrix is to be defined at contract execution per Exhibit A.",
    scope: "both",
    placement: "after_sections",
  },
]
