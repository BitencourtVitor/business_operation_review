import { api } from "@/lib/api"
import type { SubcontractorFilters, SubcontractorPerformance } from "@bor2/shared"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const subcontractorService = {
  list: (filters?: Partial<SubcontractorFilters>) => {
    const params = new URLSearchParams()
    if (filters?.company) params.set("company", filters.company)
    if (filters?.status) params.set("status", filters.status)
    return api.get<SubcontractorPerformance[]>(`/api/v1/subcontractors?${params}`, getToken())
  },

  get: (id: string) =>
    api.get<SubcontractorPerformance>(`/api/v1/subcontractors/${id}`, getToken()),

  create: (data: Omit<SubcontractorPerformance, "id" | "createdAt" | "updatedAt">) =>
    api.post<SubcontractorPerformance>("/api/v1/subcontractors", data, getToken()),

  updateStatus: (id: string, status: string) =>
    api.patch<SubcontractorPerformance>(`/api/v1/subcontractors/${id}/status`, { status }, getToken()),
}
