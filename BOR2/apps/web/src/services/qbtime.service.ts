import { api } from "@/lib/api"
import type { QBTimeDailyReport, QBTimeEmployeeTeam, QBTimeTeam } from "@bor2/shared"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const qbtimeDailyService = {
  list: (company?: string) => {
    const params = new URLSearchParams()
    if (company) params.set("company", company)
    return api.get<QBTimeDailyReport[]>(`/api/v1/qbtime/daily?${params}`, getToken())
  },

  get: (id: string) =>
    api.get<QBTimeDailyReport>(`/api/v1/qbtime/daily/${id}`, getToken()),

  create: (data: Pick<QBTimeDailyReport, "company" | "date" | "fileName"> & { entries: QBTimeDailyReport["entries"] }) =>
    api.post<QBTimeDailyReport>("/api/v1/qbtime/daily", data, getToken()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/qbtime/daily/${id}`, getToken()),
}

export const qbtimeTeamService = {
  list: (company: string) =>
    api.get<QBTimeTeam[]>(`/api/v1/qbtime/teams?company=${encodeURIComponent(company)}`, getToken()),

  create: (data: { company: string; name: string; members: string[] }) =>
    api.post<QBTimeTeam>("/api/v1/qbtime/teams", data, getToken()),

  update: (id: string, data: { name: string; members: string[] }) =>
    api.patch<QBTimeTeam>(`/api/v1/qbtime/teams/${id}`, data, getToken()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/qbtime/teams/${id}`, getToken()),
}

export const qbtimeEmployeeTeamService = {
  list: (company: string) =>
    api.get<QBTimeEmployeeTeam[]>(`/api/v1/qbtime/employee-teams?company=${encodeURIComponent(company)}`, getToken()),

  setOverride: (id: string, teamName: string) =>
    api.patch<QBTimeEmployeeTeam>(`/api/v1/qbtime/employee-teams/${id}/override`, { teamName }, getToken()),

  clearOverride: (id: string) =>
    api.delete<QBTimeEmployeeTeam>(`/api/v1/qbtime/employee-teams/${id}/override`, getToken()),

  sync: () =>
    api.post<Record<string, string>>("/api/v1/qbtime/employee-teams/sync", {}, getToken()),
}
