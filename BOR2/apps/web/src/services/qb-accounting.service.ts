import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ChartPoint {
  period: string
  received: number
  paid: number
}

export interface ProjectCard {
  name: string
  estimate: number
  invoiced: number
  expenses: number
  profit: number
  profit_pct: number
}

export const qbAccountingService = {
  async getChart(params: { company: string; year: number; month?: number }): Promise<ChartPoint[]> {
    const search = new URLSearchParams({
      company: params.company,
      year: String(params.year),
      ...(params.month ? { month: String(params.month).padStart(2, "0") } : {}),
    })
    const res = await api.get<{ data: ChartPoint[] }>(`/api/v1/qb/accounting/chart?${search}`, getToken())
    return res.data ?? []
  },

  async getProjects(params: { company: string; year?: number }): Promise<ProjectCard[]> {
    const search = new URLSearchParams({
      company: params.company,
      ...(params.year ? { year: String(params.year) } : {}),
    })
    const res = await api.get<{ data: ProjectCard[] }>(`/api/v1/qb/accounting/projects?${search}`, getToken())
    return res.data ?? []
  },
}
