import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface SubcontractorPerfData {
  id: string
  company: string
  subcontractorName: string
  status: string
  performanceScore: number
  completedProjects: number
  activeProjects: number
  lastEventAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ForecastProjectData {
  id: string
  company: string
  name: string
  status: string
  startDate: string
  endDate: string
  contractValue: number
  team: string
  cliente: string
  jobSite: string
  type: string
  loteBld: string
  createdAt: string
  updatedAt: string
}

export const subcontractorPerfService = {
  listSubcontractors: () =>
    api.get<SubcontractorPerfData[]>("/api/v1/subcontractors", getToken()),

  listForecast: () =>
    api.get<ForecastProjectData[]>("/api/v1/forecast", getToken()),
}
