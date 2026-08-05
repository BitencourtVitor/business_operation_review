import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type {
  LeadTimeUnit, Project, ProjectTrade, Trade, TradeEvent, TradeEventEdit, TradeEventType,
} from "./types"
import { clampEventDate, clampNewEventDate, compareEvents, lastEvent } from "./events"
import { DEMO_PROJECT } from "./demo-project"

// Local-only while the page is being designed — moves to the Railway API once
// the shape settles.
interface ProjectsState {
  projects: Project[]
  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  updateProjectTrade: (projectId: string, tradeId: string, patch: Partial<ProjectTrade>) => void
  addTradeEvent: (projectId: string, tradeId: string, event: TradeEvent) => void
  updateTradeEvent: (projectId: string, tradeId: string, eventId: string, patch: TradeEventEdit) => void
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

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [DEMO_PROJECT],
      addProject: (project) => set(s => ({ projects: [project, ...s.projects] })),
      updateProject: (id, patch) => set(s => ({
        projects: s.projects.map(p => (p.id === id ? { ...p, ...patch } : p)),
      })),
      deleteProject: (id) => set(s => ({ projects: s.projects.filter(p => p.id !== id) })),
      updateProjectTrade: (projectId, tradeId, patch) => set(s => ({
        projects: patchTrade(s.projects, projectId, tradeId, t => ({ ...t, ...patch })),
      })),
      // Kept in chronological order of the fact, not of the typing — a bid logged
      // late still belongs where it happened.
      addTradeEvent: (projectId, tradeId, event) => set(s => ({
        projects: patchTrade(s.projects, projectId, tradeId, t => ({
          ...t,
          events: [...t.events, { ...event, at: clampNewEventDate(t.events, event.at) }]
            .sort(compareEvents),
        })),
      })),
      // A correction, not a re-telling: the step, the frozen params and who
      // logged it stay put. The date can only move between the neighbouring
      // events, so fixing one day never rewrites the order things happened in.
      updateTradeEvent: (projectId, tradeId, eventId, patch) => set(s => ({
        projects: patchTrade(s.projects, projectId, tradeId, t => {
          if (!t.events.some(e => e.id === eventId)) return t
          const at = patch.at ? clampEventDate(t.events, eventId, patch.at) : undefined
          const events = t.events
            .map(e => (e.id === eventId ? { ...e, ...patch, at: at ?? e.at } : e))
            .sort(compareEvents)
          return { ...t, events }
        }),
      })),
      deleteTradeEvent: (projectId, tradeId, eventId) => set(s => ({
        projects: patchTrade(s.projects, projectId, tradeId, t => ({
          ...t,
          events: t.events.filter(e => e.id !== eventId),
        })),
      })),
    }),
    {
      name: "pcg-bid-requests-projects",
      storage: createJSONStorage(() => localStorage),
      // v2 turned the stored status into an event history, v3 seeded the demo
      // project, v4 re-sorted histories that a timestamp comparison had left in
      // the wrong order within a day, v5 split the free-text lead time into a
      // count and a unit.
      version: 5,
      migrate: (state, version) => {
        const s = state as ProjectsState
        const projects = version >= 2
          ? (s?.projects ?? [])
          : (s?.projects ?? []).map(p => ({ ...p, trades: p.trades.map(legacyTrade) }))
        const sorted = projects.map(p => ({
          ...p,
          trades: p.trades.map(t => ({
            ...t,
            events: t.events.map(legacyLeadTime).sort(compareEvents),
          })),
        }))
        const withDemo = sorted.some(p => p.id === DEMO_PROJECT.id)
          ? sorted
          : [DEMO_PROJECT, ...sorted]
        return { ...s, projects: withDemo }
      },
    }
  )
)

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
  return { tradeId: t.tradeId, answers: t.answers, events }
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
