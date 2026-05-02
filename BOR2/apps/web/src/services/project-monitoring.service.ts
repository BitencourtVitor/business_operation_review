import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ProjectMonitoringEntry {
  id:               string
  city:             string
  jobSite:          string
  lotNumber:        string
  team:             string
  startDate:        string | null
  finishDate:       string | null
  s1Rough:          string
  s1Date:           string | null
  s2Machines:       string
  s2Date:           string | null
  s3Condenser:      string
  s3Date:           string | null
  s4Finish:         string
  s4Date:           string | null
  percentCompleted: number
  lastUpdate:       string | null
  notes:            string
  createdAt:        string
}

export const projectMonitoringService = {
  list: () => api.get<ProjectMonitoringEntry[]>("/api/v1/project-monitoring", getToken()),
}
