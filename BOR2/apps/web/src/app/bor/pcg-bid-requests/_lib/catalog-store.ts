import { create } from "zustand"
import { toast } from "sonner"
import { pcgCatalogService } from "@/services/pcg-projects.service"
import type { DocumentBlock, Trade, TradeRevision } from "./types"
import { tradeShortCode } from "./types"
import { TRADES_SEED, withSupplyQuestion } from "./trades-seed"
import { DOCUMENT_BLOCKS_SEED } from "./document-blocks-seed"
import { makeRevision } from "./events"

// O catálogo que o PCG edita à mão. Vive no Railway (PCG-3); ver loadCatalog.
interface CatalogState {
  trades: Trade[]
  documentBlocks: DocumentBlock[]
  // How many one-off reorders of the document body this catalog has taken. Not
  // persist's `version` — see BLOCK_ORDER_REVISION.
  blockOrderRevision: number
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

// Codes used to read BRF-PLB, where the prefix said nothing — every trade was
// BRF. They are now the three letters alone, because they open the contract
// number: PLB-00001. Trades that never had a code get one from the seed, or from
// their own name if the catalog invented them. Idempotent and run on every
// rehydration, for the reason written on `merge` below.
function withShortCode(trade: Trade): Trade {
  const seed = TRADES_SEED.find(s => s.id === trade.id)
  const code = tradeShortCode({ code: trade.code ?? seed?.code ?? null, name: trade.name })
  return trade.code === code ? trade : { ...trade, code }
}

// Todo serviço passa por cotação. Não existe mais contrato gerado direto do
// escopo padrão, então a chave deixou de ser uma escolha do catálogo e virou
// regra da empresa. Fica aqui, e não num bump de `version`, pelo mesmo motivo
// das outras normalizações: roda em toda rehidratação e é idempotente, então
// catálogo salvo antes desta decisão se corrige sozinho no próximo load.
function withBidForm(trade: Trade): Trade {
  return trade.hasBidForm ? trade : { ...trade, hasBidForm: true }
}

// One-off reorders are counted here rather than left to persist's `version`.
// That number is stamped on every save, so a save can land before the bump ever
// rehydrates and migrate is then skipped forever — which is what happened to v15
// and again to v16. This counter only moves when the reorder actually runs.
// Revision 2 also gave "Materials and Supply" its number.
const BLOCK_ORDER_REVISION = 2

// "Materials and Supply" opened the contract because it was the only block that
// existed before the body became ordered modules. It reads as a note on the
// scope, so it belongs under it — and it is a clause like the others, so it
// takes a number like the others.
function fixMaterialsBlock(blocks: DocumentBlock[]): DocumentBlock[] {
  const numbered = blocks.map(b => (b.id === "block-exhibit-a" ? { ...b, numbered: true } : b))

  const from = numbered.findIndex(b => b.id === "block-exhibit-a")
  const scope = numbered.findIndex(b => b.id === "block-scope-of-work")
  if (from < 0 || scope < 0 || from === scope + 1) return numbered

  const out = [...numbered]
  const [moved] = out.splice(from, 1)
  out.splice(out.findIndex(b => b.id === "block-scope-of-work") + 1, 0, moved)
  return out
}

// A module the store has never seen goes where the seed puts it, not at the end.
// Appending was harmless while blocks were loose paragraphs; now that they are
// the document's body in order, an appended one prints after the signatures.
// Position is taken from the nearest seed neighbour that the store already has,
// so anything reordered by hand keeps its place.
function mergeBlocks(stored: DocumentBlock[], seed: DocumentBlock[]): DocumentBlock[] {
  const out = [...stored]
  const known = new Set(stored.map(b => b.id))

  seed.forEach((block, i) => {
    if (known.has(block.id)) return
    let anchor = -1
    for (let j = i - 1; j >= 0; j--) {
      const at = out.findIndex(b => b.id === seed[j].id)
      if (at >= 0) { anchor = at; break }
    }
    out.splice(anchor + 1, 0, block)
    known.add(block.id)
  })
  return out
}

// Campos do catálogo que vão para o Railway (PCG-3). O resto do estado são as ações.
type CatalogData = Pick<CatalogState, "trades" | "documentBlocks" | "blockOrderRevision" | "revisions" | "subcontractors">

// O que era o `migrate` e o `merge` do localStorage, agora aplicado a todo catálogo que
// chega da API. Tudo idempotente, então rodar a cada carga não muda o que já está certo:
// pontuação, blocos no formato de módulos, a pergunta de suprimento, código curto, bid form,
// lacunas de escopo e trades novos do seed. O seed só preenche lacuna; o que foi escrito fica.
export function normalizeCatalog(raw: Partial<CatalogData> | null | undefined): CatalogData {
  const s = raw ?? {}
  const trades = (s.trades ?? []).map(undashTrade).map(withSupplyQuestion)
  const blocks = (s.documentBlocks ?? []).map(b => ({
    ...b,
    title: undash(b.title),
    body: undash(b.body),
    kind: b.kind ?? "text",
    numbered: b.numbered ?? false,
    generated: b.generated ?? null,
  }))
  const knownTrade = new Set(trades.map(t => t.id))
  return {
    trades: [
      ...trades.map(fillScopeGaps).map(withShortCode).map(withBidForm),
      ...TRADES_SEED.filter(t => !knownTrade.has(t.id)),
    ],
    // O reordenamento roda uma vez e se registra: mexer no bloco à mão depois fica.
    documentBlocks: mergeBlocks(
      raw && (s.blockOrderRevision ?? 0) < BLOCK_ORDER_REVISION ? fixMaterialsBlock(blocks) : blocks,
      DOCUMENT_BLOCKS_SEED,
    ),
    blockOrderRevision: BLOCK_ORDER_REVISION,
    revisions: s.revisions ?? {},
    subcontractors: s.subcontractors ?? [],
  }
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  trades: TRADES_SEED,
  documentBlocks: DOCUMENT_BLOCKS_SEED,
  blockOrderRevision: BLOCK_ORDER_REVISION,
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
}))

// Onde o catálogo ficava antes (zustand persist): { state: {...}, version }.
const LOCAL_KEY = "pcg-bid-requests-catalog"
const IMPORTED_KEY = "pcg-bid-requests-catalog-imported"

const pick = (s: CatalogState): CatalogData => ({
  trades: s.trades, documentBlocks: s.documentBlocks, blockOrderRevision: s.blockOrderRevision,
  revisions: s.revisions, subcontractors: s.subcontractors,
})

function readLocal(): Partial<CatalogData> | null {
  try {
    if (localStorage.getItem(IMPORTED_KEY)) return null
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw)?.state ?? null) : null
  } catch {
    return null
  }
}

let loading: Promise<void> | null = null

// Carrega o catálogo do Railway uma vez por sessão e, a partir daí, grava cada mudança.
// O navegador que ainda tem o catálogo antigo manda uma cópia (que vira o oficial se o
// banco estiver vazio) e não apaga nada do localStorage: só marca que já mandou.
export function loadCatalog(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    const local = readLocal()
    let remote = (await pcgCatalogService.get())?.catalog as Partial<CatalogData> | null
    if (local) {
      const res = await pcgCatalogService.importLocal(local as Record<string, unknown>)
      try { localStorage.setItem(IMPORTED_KEY, new Date().toISOString()) } catch { /* sem storage */ }
      if (res?.adopted) remote = local
    }
    useCatalogStore.setState(normalizeCatalog(remote))

    // ponytail: a cada mudança grava o catálogo inteiro (meio segundo depois da última);
    // é um documento de poucas centenas de KB. Trocar por PATCH por trade se ficar pesado.
    let timer: ReturnType<typeof setTimeout> | undefined
    useCatalogStore.subscribe(state => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        pcgCatalogService.save(pick(state) as unknown as Record<string, unknown>)
          .catch(() => toast.error("Could not save the catalog. Your last change may be lost."))
      }, 500)
    })
  })()
  loading.catch(() => { loading = null })
  return loading
}

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
    kind: "text",
    numbered: true,
    generated: null,
  }
}

export function nextQuestionId(trade: Trade): string {
  const used = new Set(trade.questions.map(q => q.id))
  let n = trade.questions.length + 1
  while (used.has(`q${n}`)) n++
  return `q${n}`
}
