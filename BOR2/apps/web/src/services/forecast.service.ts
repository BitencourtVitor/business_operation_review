import { api } from "@/lib/api"
import type { ForecastFilters, ForecastProject } from "@bor2/shared"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const forecastService = {
  list: (filters?: Partial<ForecastFilters>) => {
    const params = new URLSearchParams()
    if (filters?.company) params.set("company", filters.company)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.year) params.set("year", String(filters.year))
    if (filters?.month !== undefined) params.set("month", String(filters.month))
    return api.get<ForecastProject[]>(`/api/v1/forecast?${params}`, getToken())
  },

  get: (id: string) =>
    api.get<ForecastProject>(`/api/v1/forecast/${id}`, getToken()),

  create: (data: Omit<ForecastProject, "id" | "createdAt" | "updatedAt">) =>
    api.post<ForecastProject>("/api/v1/forecast", data, getToken()),

  update: (id: string, data: Partial<ForecastProject>) =>
    api.put<ForecastProject>(`/api/v1/forecast/${id}`, data, getToken()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/forecast/${id}`, getToken()),
}
