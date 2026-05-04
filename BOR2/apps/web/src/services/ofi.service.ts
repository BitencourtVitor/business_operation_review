import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface OfiEntry {
  id: string
  obraId: string
  referenceMonth: number
  referenceYear: number
  fieldwireScore: number
  machinesScore: number
  contractScore: number
  systemsScore: number
  totalScore: number
  captureDate: string
  projectName: string
}

export interface ExecutionEntry {
  id: string
  obraId: string
  referenceMonth: number
  referenceYear: number
  plannedStatus: string
  actualStatus: "not_started" | "started" | "completed" | string
  reason: string
  subcontractor: string
  isCycleCompleted: boolean
  projectName: string
}

export interface OfiFilters {
  year?: number
}

export const ofiService = {
  list: async (filters?: OfiFilters): Promise<OfiEntry[]> => {
    const params = new URLSearchParams()
    if (filters?.year) params.set("year", String(filters.year))
    const qs = params.toString()
    return await api.get<OfiEntry[]>(`/api/v1/ofi${qs ? `?${qs}` : ""}`, getToken())
  },

  listExecution: async (filters?: { year?: number; month?: number }): Promise<ExecutionEntry[]> => {
    const params = new URLSearchParams()
    if (filters?.year)  params.set("year",  String(filters.year))
    if (filters?.month) params.set("month", String(filters.month))
    const qs = params.toString()
    return await api.get<ExecutionEntry[]>(`/api/v1/ofi/monthly-execution${qs ? `?${qs}` : ""}`, getToken())
  },

  updateExecutionReason: (id: string, reason: string) =>
    api.patch<void>(`/api/v1/ofi/monthly-execution/${id}`, { reason }, getToken()),
}
