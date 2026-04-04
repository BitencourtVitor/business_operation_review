import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface TimesheetEntry {
  id: string
  date: string
  name: string
  team: string
  corporation: string
  jobsite: string
  worktype: string
  hours: number
  rate: number
  total: number
}

export const timesheetService = {
  list: () => api.get<TimesheetEntry[]>("/api/v1/timesheets", getToken()),
}
