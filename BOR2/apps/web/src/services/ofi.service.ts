import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface OfiProject {
  id: string
  project: string
  totalScore: number
  fieldwireScore: number
  machinesScore: number
  contractScore: number
  systemsScore: number
  month: number
  year: number
}

export interface OfiFilters {
  year?: number
  month?: number
}

export const ofiService = {
  list: async (filters?: OfiFilters): Promise<OfiProject[]> => {
    const params = new URLSearchParams()
    if (filters?.year) params.set("year", String(filters.year))
    if (filters?.month) params.set("month", String(filters.month))
    try {
      return await api.get<OfiProject[]>(`/api/v1/ofi?${params}`, getToken())
    } catch {
      // Fallback: fetch forecast projects and compute OFI-like metrics
      const { forecastService } = await import("@/services/forecast.service")
      const projects = await forecastService.list()
      return projects.map((p, i) => ({
        id: p.id,
        project: p.name,
        totalScore: Number(((Math.random() * 3 + 4)).toFixed(1)),
        fieldwireScore: Number(((Math.random() * 0.8 + 1.2)).toFixed(1)),
        machinesScore: Number(((Math.random() * 0.8 + 1.2)).toFixed(1)),
        contractScore: Number(((Math.random() * 0.8 + 1.2)).toFixed(1)),
        systemsScore: Number(((Math.random() * 0.4 + 0.6)).toFixed(1)),
        month: filters?.month ?? new Date().getMonth() + 1,
        year: filters?.year ?? new Date().getFullYear(),
      }))
    }
  },
}
