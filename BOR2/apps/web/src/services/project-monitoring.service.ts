import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ProjectMonitoringEntry {
  id: string
  jobsite: string
  team: string
  s1: string
  s2: string
  s3: string
  s4: string
  completion: number
  startDate: string
  endDate: string
}

export const projectMonitoringService = {
  list: () => api.get<ProjectMonitoringEntry[]>("/api/v1/project-monitoring", getToken()),
}
