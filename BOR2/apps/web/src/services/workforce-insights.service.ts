import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type Granularity = "month" | "payperiod"

export interface InsightsPeriod { key: string; from: string; to: string }

export interface ObraHours {
  period: string
  jobsite: string
  lot: string
  isBuilding: boolean
  regular: number
  overtime: number
}

export interface EmployeeHours { period: string; employee: string; regular: number; overtime: number }

export interface InsightsOverview { periods: InsightsPeriod[]; obras: ObraHours[]; employees: EmployeeHours[] }

export interface ForecastBuildingRef {
  id: string; cliente: string; jobSite: string; lot: string; status: string
  start: string | null; end: string | null
}

export interface BuildingLink { forecastId: string; jobsite: string; building: string }

export interface BuildingPoint { date: string; planned: number; actual: number | null; projected: number | null }

export interface WorkerHours { employee: string; regular: number; overtime: number }

/** EVM do prédio, só em horas: o dinheiro nunca sai do servidor. */
export interface BuildingForecast {
  start: string; end: string
  budgetHours: number; consumedHours: number; projectedHours: number
  regularHours: number; overtimeHours: number; remainingHours: number
  exceedsOn: string | null
  series: BuildingPoint[]
  workers: WorkerHours[]
}

export interface BuildingView { building: ForecastBuildingRef; link: BuildingLink | null; forecast: BuildingForecast | null }

export interface InsightsSettings {
  buildingBudget: number
  ignoredWorktypes: string[]
  nonCountingWorktypes: string[]
  supervisors: string[]
  links: BuildingLink[]
}

export interface QBTBuilding { jobsite: string; building: string; hours: number }

export interface SettingsView {
  settings: InsightsSettings
  employees: string[]
  worktypes: string[]
  qbtBuildings: QBTBuilding[]
  buildings: ForecastBuildingRef[]
  suggestions: Record<string, QBTBuilding>
}

const BASE = "/api/v1/workforce-insights"

export const workforceInsightsService = {
  overview: (company: string, year: number, granularity: Granularity) =>
    api.get<InsightsOverview>(`${BASE}/overview?company=${company}&year=${year}&granularity=${granularity}`, getToken()),
  buildings: () => api.get<BuildingView[]>(`${BASE}/buildings`, getToken()),
  settings: () => api.get<SettingsView>(`${BASE}/settings`, getToken()),
  saveSettings: (s: InsightsSettings) => api.put<void>(`${BASE}/settings`, s, getToken()),
}
