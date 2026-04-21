import { apiClient } from "@/lib/api-client"

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
    const res = await apiClient.get<{ data: ChartPoint[] }>(`/qb/accounting/chart?${search}`)
    return res.data ?? []
  },

  async getProjects(params: { company: string; year?: number }): Promise<ProjectCard[]> {
    const search = new URLSearchParams({
      company: params.company,
      ...(params.year ? { year: String(params.year) } : {}),
    })
    const res = await apiClient.get<{ data: ProjectCard[] }>(`/qb/accounting/projects?${search}`)
    return res.data ?? []
  },
}
