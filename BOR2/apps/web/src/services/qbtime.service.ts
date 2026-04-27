import { api } from "@/lib/api"
import type { QBTimeDailyReport } from "@bor2/shared"
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
