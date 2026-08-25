import { api } from "@/lib/api"
import type { ForecastFilters, ForecastObsEntry,
  ForecastDateEntry, ForecastProject } from "@bor2/shared"
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

  listObs: (id: string) =>
    api.get<ForecastObsEntry[]>(`/api/v1/forecast/${id}/obs`, getToken()),

  listDateHistory: (id: string) =>
    api.get<ForecastDateEntry[]>(`/api/v1/forecast/${id}/date-history`, getToken()),

  create: (data: Omit<ForecastProject, "id" | "createdAt" | "updatedAt" | "startDate" | "endDate">) =>
    api.post<ForecastProject>("/api/v1/forecast", data, getToken()),

  update: (id: string, data: Partial<ForecastProject>) =>
    api.put<ForecastProject>(`/api/v1/forecast/${id}`, data, getToken()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/forecast/${id}`, getToken()),

  toggleFieldwire: (fwId: number, status: string) =>
    api.patch<{ ok: boolean }>(`/api/v1/forecast/fieldwire/${fwId}`, { status }, getToken()),

  togglePermit: (permitId: number, status: string) =>
    api.patch<{ ok: boolean }>(`/api/v1/forecast/permit/${permitId}`, { status }, getToken()),

  toggleMachine: (machId: number, status: string) =>
    api.patch<{ ok: boolean }>(`/api/v1/forecast/machine/${machId}`, { status }, getToken()),

  updateMachineUnit: (machId: number, unit: string) =>
    api.patch<{ ok: boolean }>(`/api/v1/forecast/machine/${machId}/unit`, { unit }, getToken()),

  toggleContractStep: (stepId: number, status: boolean) =>
    api.patch<{ ok: boolean }>(`/api/v1/forecast/contract/${stepId}`, { status }, getToken()),

  createContractStep: (projectId: string, team: string, step: string) =>
    api.post<{ id: number }>(`/api/v1/forecast/contract`, { projectId, team, step }, getToken()),

  deleteContractTeam: (projectId: string, team: string) =>
    api.delete<{ ok: boolean }>(`/api/v1/forecast/contract/team?projectId=${encodeURIComponent(projectId)}&team=${encodeURIComponent(team)}`, getToken()),

  addContractTeam: (projectId: string, team: string) =>
    api.post<{ ok: boolean }>(`/api/v1/forecast/contract/team`, { projectId, team }, getToken()),
}
