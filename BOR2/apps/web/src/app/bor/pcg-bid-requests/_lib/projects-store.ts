import { create } from "zustand"
import type {
  LeadTimeUnit, PaymentMilestone, Project, ProjectTrade, ProjectType, Trade, TradeEvent,
  TradeEventEdit, TradeEventType,
} from "./types"
import { clampEventDate, clampNewEventDate, compareEvents, lastEvent, SETS_SCHEDULE } from "./events"
import { projectTypeQuestionId } from "./trades-seed"
import { pcgProjectsService } from "@/services/pcg-projects.service"

// O estado vive no Railway. Cada ação escreve na API e atualiza a cópia local
// na mesma chamada, para a tela responder na hora — mas a verdade é o banco.
//
// Até 19/08/2026 isto era localStorage, e um contrato assinado com
// subcontratado existia no navegador de uma pessoa só, sem cópia e sem rastro.
interface ProjectsState {
  projects: Project[]
  loaded: boolean
  loading: boolean
  // Carrega tudo do banco. Idempotente: chamada repetida não duplica requisição.
  load: (force?: boolean) => Promise<void>
  // How many demo projects this store has been handed. Not persist's `version`
  // — see DEMO_SEED_REVISION.
  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  updateProjectTrade: (projectId: string, tradeId: string, patch: Partial<ProjectTrade>) => void
  // Caches the number the API issued for a contract. The API owns it — this is
  // only so the document can print it without asking again, and so another
  // machine's number shows up here once it has been fetched.
  setContractNumber: (projectId: string, tradeId: string, number: string) => void
  addTradeEvent: (projectId: string, tradeId: string, event: TradeEvent) => void
  updateTradeEvent: (projectId: string, tradeId: string, eventId: string, patch: TradeEventEdit) => void
  setEventSchedule: (projectId: string, tradeId: string, eventId: string, schedule: PaymentMilestone[]) => void
  deleteTradeEvent: (projectId: string, tradeId: string, eventId: string) => void
}

function patchTrade(
  projects: Project[], projectId: string, tradeId: string, fn: (t: ProjectTrade) => ProjectTrade,
): Project[] {
  return projects.map(p => (p.id !== projectId ? p : {
    ...p,
    trades: p.trades.map(t => (t.tradeId === tradeId ? fn(t) : t)),
  }))
}

// Lead time used to be whatever was typed: "12 weeks", "3 months". Read the
// number and the unit out of it; anything unparseable becomes blank rather than
// a made-up count. Declared above the store on purpose: rehydration runs while
// this module is still evaluating, and a `const` below would be unreachable —
// the migration would throw and persist would silently fall back to the seed.
const LEGACY_LEAD_TIME = /(\d+)\s*(day|week|month)/i

// Reads the project type out of the trade that used to ask it. Declared above
// the store for the same reason as the regex: rehydration runs while this module
// is still evaluating.
const PROJECT_TYPE_FROM_ANSWER: Record<string, ProjectType> = {
  "new construction": "new_construction",
  addition:           "addition",
  renovation:         "renovation",
}

function projectTypeFromAnswers(project: Project): ProjectType {
  for (const trade of project.trades ?? []) {
    const questionId = projectTypeQuestionId(trade.tradeId)
    if (!questionId) continue
    const answer = trade.answers?.[questionId]
    const key = (Array.isArray(answer) ? answer[0] : answer)?.trim().toLowerCase()
    const type = key ? PROJECT_TYPE_FROM_ANSWER[key] : undefined
    if (type) return type
  }
  return "new_construction"
}

// Demo projects land once each, and a delete afterwards sticks. Counted here
// rather than left to persist's `version` for the reason the catalog store
// learned the hard way: that number is stamped on every save, so a save can land
// before the bump ever rehydrates and migrate is then skipped forever. This
// counter only moves when a demo is actually added. Declared above the store
// with the rest — rehydration runs while this module is still evaluating.
function withoutLegacyDemos(projects: Project[]): Project[] {
  return projects.filter(project => !project.id.startsWith("demo-"))
}

// The schedule used to sit on the trade, one per trade. Hand it to the last
// event that could have settled it — the adjustment if there was one, otherwise
// the approval — so nothing already agreed is lost on the way in. Idempotent,
// and declared above the store like the rest: rehydration runs while this module
// is still evaluating.
function legacySchedule(trade: ProjectTrade & { paymentSchedule?: PaymentMilestone[] }): TradeEvent[] {
  const events = trade.events ?? []
  const stored = trade.paymentSchedule
  if (!stored?.length) return events
  if (events.some(e => e.paymentSchedule?.length)) return events

  let target = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (SETS_SCHEDULE.includes(events[i].type)) { target = i; break }
  }
  if (target < 0) return events
  return events.map((e, i) => (i === target ? { ...e, paymentSchedule: stored } : e))
}

function legacyLeadTime(event: TradeEvent & { leadTime?: string }): TradeEvent {
  if (!("leadTime" in event)) return event
  const { leadTime, ...rest } = event
  const m = LEGACY_LEAD_TIME.exec(leadTime ?? "")
  return {
    ...rest,
    leadTimeValue: m ? Number(m[1]) : null,
    leadTimeUnit: m ? (`${m[2].toLowerCase()}s` as LeadTimeUnit) : "weeks",
  }
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  loaded: false,
  loading: false,

  load: async (force = false) => {
    if (get().loading) return
    if (get().loaded && !force) return
    set({ loading: true })
    try {
      const projects = await pcgProjectsService.list()
      set({
        // O banco guarda o que foi gravado; as normalizações antigas continuam
        // valendo na leitura, para dado escrito antes da migração não quebrar.
        projects: (projects ?? []).map(p => ({
          ...p,
          type: p.type ?? projectTypeFromAnswers(p),
          trades: (p.trades ?? []).map(t => ({
            ...t,
            answers: t.answers ?? {},
            moduleOverrides: t.moduleOverrides ?? {},
            events: legacySchedule(t).map(legacyLeadTime).sort(compareEvents),
          })),
        })),
        loaded: true,
      })
    } finally {
      set({ loading: false })
    }
  },

  addProject: (project) => {
    set(s => ({ projects: [project, ...s.projects] }))
    void pcgProjectsService.create(project)
  },

  updateProject: (id, patch) => {
    set(s => ({ projects: s.projects.map(p => (p.id === id ? { ...p, ...patch } : p)) }))
    // A lista de trades não vai neste endpoint: trade é recurso próprio, com a
    // sua rota. Mandar aqui gravaria o array inteiro a cada tecla.
    const { trades, ...rest } = patch
    if (Object.keys(rest).length) void pcgProjectsService.update(id, rest)
    for (const trade of trades ?? []) {
      void pcgProjectsService.upsertTrade(id, {
        tradeId: trade.tradeId,
        answers: trade.answers ?? {},
        moduleOverrides: trade.moduleOverrides ?? {},
      })
    }
  },

  deleteProject: (id) => {
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
    void pcgProjectsService.remove(id)
  },

  updateProjectTrade: (projectId, tradeId, patch) => {
    set(s => ({ projects: patchTrade(s.projects, projectId, tradeId, t => ({ ...t, ...patch })) }))
    const trade = get().projects.find(p => p.id === projectId)?.trades.find(t => t.tradeId === tradeId)
    if (!trade) return
    void pcgProjectsService.upsertTrade(projectId, {
      tradeId,
      answers: trade.answers ?? {},
      moduleOverrides: trade.moduleOverrides ?? {},
      contractNumber: trade.contractNumber,
    })
  },

  setContractNumber: (projectId, tradeId, number) => {
    set(s => ({
      projects: patchTrade(s.projects, projectId, tradeId, t => (
        t.contractNumber === number ? t : { ...t, contractNumber: number }
      )),
    }))
    // O número já foi emitido e gravado pela própria API que o gerou; aqui só se
    // garante que o trade existe no banco carregando o mesmo valor.
    const trade = get().projects.find(p => p.id === projectId)?.trades.find(t => t.tradeId === tradeId)
    if (trade) {
      void pcgProjectsService.upsertTrade(projectId, {
        tradeId,
        answers: trade.answers ?? {},
        moduleOverrides: trade.moduleOverrides ?? {},
        contractNumber: number,
      })
    }
  },

  // Mantido em ordem cronológica do fato, não da digitação — um bid registrado
  // atrasado continua no lugar em que aconteceu.
  addTradeEvent: (projectId, tradeId, event) => {
    let saved: TradeEvent | null = null
    set(s => ({
      projects: patchTrade(s.projects, projectId, tradeId, t => {
        saved = { ...event, at: clampNewEventDate(t.events, event.at, event.type) }
        return { ...t, events: [...t.events, saved].sort(compareEvents) }
      }),
    }))
    if (saved) void pcgProjectsService.addEvent(projectId, tradeId, saved)
  },

  // Uma correção, não uma reescrita: o passo, os params congelados e quem
  // registrou ficam. A data só anda entre os eventos vizinhos.
  updateTradeEvent: (projectId, tradeId, eventId, patch) => {
    let saved: Partial<TradeEvent> | null = null
    set(s => ({
      projects: patchTrade(s.projects, projectId, tradeId, t => {
        if (!t.events.some(e => e.id === eventId)) return t
        const at = patch.at ? clampEventDate(t.events, eventId, patch.at) : undefined
        saved = { ...patch, ...(at ? { at } : {}) }
        const events = t.events
          .map(e => (e.id === eventId ? { ...e, ...patch, at: at ?? e.at } : e))
          .sort(compareEvents)
        return { ...t, events }
      }),
    }))
    if (saved) void pcgProjectsService.updateEvent(projectId, tradeId, eventId, saved)
  },

  // Escrito direto no evento que a firmou — a aprovação guarda o que foi
  // aprovado, um ajuste guarda o que foi renegociado.
  setEventSchedule: (projectId, tradeId, eventId, schedule) => {
    set(s => ({
      projects: patchTrade(s.projects, projectId, tradeId, t => ({
        ...t,
        events: t.events.map(e => (e.id === eventId ? { ...e, paymentSchedule: schedule } : e)),
      })),
    }))
    void pcgProjectsService.updateEvent(projectId, tradeId, eventId, { paymentSchedule: schedule })
  },

  deleteTradeEvent: (projectId, tradeId, eventId) => {
    set(s => ({
      projects: patchTrade(s.projects, projectId, tradeId, t => ({
        ...t,
        events: t.events.filter(e => e.id !== eventId),
      })),
    }))
    void pcgProjectsService.removeEvent(projectId, tradeId, eventId)
  },
}))

// Old tracks carried a status field and a single timestamp. Replay them as the
// one event that can be inferred, so nothing already recorded is lost.
type LegacyTrade = ProjectTrade & {
  status?: string
  statusChangedAt?: string | null
  bidAmount?: number | null
  subcontractor?: string
}

function legacyTrade(t: LegacyTrade): ProjectTrade {
  if (t.events) return t
  const at = t.statusChangedAt ?? new Date().toISOString()
  const type = LEGACY_EVENT[t.status ?? ""] ?? null
  // No record of who did it back then — better blank than a name we invented.
  const blank = {
    by: "", note: "", params: null, url: "", amount: null,
    leadTimeValue: null, leadTimeUnit: "weeks" as LeadTimeUnit, subcontractor: "",
  }
  const events: TradeEvent[] = [{ id: "e1", type: "created", at, recordedAt: at, ...blank }]
  if (type) {
    events.push({
      ...blank,
      id: "e2", type, at, recordedAt: at,
      note: "Carried over from the status field",
      // The old free-typed amount and sub have no event of their own — hang them
      // on the one that would have produced them.
      amount: type === "bid_received" ? t.bidAmount ?? null : null,
      subcontractor: t.subcontractor ?? "",
    })
  }
  return { tradeId: t.tradeId, answers: t.answers, events, moduleOverrides: {} }
}

const LEGACY_EVENT: Record<string, TradeEventType | undefined> = {
  bid_sent: "bid_sent",
  bid_received: "bid_received",
  bid_approved: "bid_approved",
  contract_sent: "contract_sent",
  contract_signed: "contract_signed",
}

export function emptyProject(): Project {
  return {
    id: `project-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    address: "",
    status: "active",
    type: "new_construction",
    trades: [],
    createdAt: new Date().toISOString(),
  }
}

export function newProjectTrade(tradeId: string, by = ""): ProjectTrade {
  const now = new Date().toISOString()
  return {
    tradeId,
    events: [{
      id: "e1", type: "created", at: now, recordedAt: now, by,
      note: "", params: null, url: "", amount: null, leadTimeValue: null, leadTimeUnit: "weeks", subcontractor: "",
    }],
    answers: {},
    moduleOverrides: {},
  }
}

export function projectProgress(project: Project): { done: number; total: number } {
  return {
    done: project.trades.filter(t => lastEvent(t)?.type === "contract_signed").length,
    total: project.trades.length,
  }
}

export function tradeById(trades: Trade[], id: string): Trade | undefined {
  return trades.find(t => t.id === id)
}

export function isAnswered(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0
  return (value ?? "").trim().length > 0
}

// A trade's document can only be generated once every question has an answer.
export function answerProgress(trade: Trade, answers: ProjectTrade["answers"]): { answered: number; total: number } {
  return {
    answered: trade.questions.filter(q => isAnswered(answers[q.id])).length,
    total: trade.questions.length,
  }
}
