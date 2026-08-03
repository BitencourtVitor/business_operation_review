import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { Project, ProjectTrade, Trade } from "./types"

// Local-only while the page is being designed — moves to the Railway API once
// the shape settles.
interface ProjectsState {
  projects: Project[]
  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  updateProjectTrade: (projectId: string, tradeId: string, patch: Partial<ProjectTrade>) => void
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      addProject: (project) => set(s => ({ projects: [project, ...s.projects] })),
      updateProject: (id, patch) => set(s => ({
        projects: s.projects.map(p => (p.id === id ? { ...p, ...patch } : p)),
      })),
      deleteProject: (id) => set(s => ({ projects: s.projects.filter(p => p.id !== id) })),
      updateProjectTrade: (projectId, tradeId, patch) => set(s => ({
        projects: s.projects.map(p => (p.id !== projectId ? p : {
          ...p,
          trades: p.trades.map(t => (t.tradeId === tradeId ? { ...t, ...patch } : t)),
        })),
      })),
    }),
    {
      name: "pcg-bid-requests-projects",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)

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

export function newProjectTrade(tradeId: string): ProjectTrade {
  return { tradeId, status: "not_started", subcontractor: "", bidAmount: null, answers: {} }
}

export function projectProgress(project: Project): { done: number; total: number } {
  return {
    done: project.trades.filter(t => t.status === "contract_signed").length,
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
