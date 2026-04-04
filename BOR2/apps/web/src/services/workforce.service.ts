import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface WorkforceRow {
  id: string
  client: string
  jobsite: string
  lotBuilding: string
  worktype: string
  employeeName: string
  regularRate: number
  regularHours: number
  referenceMonth: string
  company: string
}

export const workforceService = {
  list: (company?: string, month?: string) => {
    const params = new URLSearchParams()
    if (company) params.set("company", company)
    if (month) params.set("month", month)
    const qs = params.toString()
    return api.get<WorkforceRow[]>(`/api/v1/workforce${qs ? `?${qs}` : ""}`, getToken())
  },
}
