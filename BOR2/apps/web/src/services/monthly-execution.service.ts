import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface GoalSite { cliente: string; jobSite: string }
export interface GoalCheckpoint { year: number; month: number; goal: number }

/** Um ou mais job sites com meta mensal de casas terminadas. */
export interface GoalGroup {
  id: string
  name: string
  sites: GoalSite[]
  checkpoints: GoalCheckpoint[]
  /** Meta de cada mês do ano pedido (0 = janeiro), já resolvida pelos checkpoints. */
  goals?: number[]
}

export interface FinishedProject {
  id: string
  cliente: string
  jobSite: string
  projectName: string
  address: string
  /** Dia em que a obra passou para closed, "YYYY-MM-DD". */
  finishedOn: string
}

export type PointStatus = "pending" | "resolved"

export interface PointReply {
  id: number
  body: string
  authorId: string
  authorName: string
  authorRole: string
  createdAt: string
}

export interface ImprovementPoint {
  id: string
  year: number
  month: number
  body: string
  status: PointStatus
  groupIds: string[]
  authorId: string
  authorName: string
  authorRole: string
  createdAt: string
  replies: PointReply[]
}

const BASE = "/api/v1/monthly-execution"

export const monthlyExecutionService = {
  goals:      (year: number)          => api.get<GoalGroup[]>(`${BASE}/goals?year=${year}`, getToken()),
  saveGoals:  (groups: GoalGroup[])   => api.put<void>(`${BASE}/goals`, groups, getToken()),
  finished:   (year: number)          => api.get<FinishedProject[]>(`${BASE}/finished?year=${year}`, getToken()),
  points:     (year: number)          => api.get<ImprovementPoint[]>(`${BASE}/points?year=${year}`, getToken()),
  addPoint:   (p: { year: number; month: number; body: string; groupIds: string[] }) =>
    api.post<ImprovementPoint>(`${BASE}/points`, p, getToken()),
  editPoint:  (id: string, body: string, groupIds: string[]) =>
    api.patch<void>(`${BASE}/points/${id}`, { body, groupIds }, getToken()),
  setStatus:  (id: string, status: PointStatus) => api.patch<void>(`${BASE}/points/${id}`, { status }, getToken()),
  removePoint: (id: string)           => api.delete<void>(`${BASE}/points/${id}`, getToken()),
  addReply:   (id: string, body: string) => api.post<PointReply>(`${BASE}/points/${id}/replies`, { body }, getToken()),
}
