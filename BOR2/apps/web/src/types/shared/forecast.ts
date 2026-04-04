import type { Company } from "./common"

export type ForecastStatus = "planned" | "active" | "completed" | "cancelled"

export interface ForecastProject {
  id: string
  company: Company
  name: string
  status: ForecastStatus
  startDate: string
  endDate: string
  contractValue: number
  team: string
  qbTime: boolean
  createdAt: string
  updatedAt: string
}

export interface ForecastFilters {
  company?: Company
  status?: ForecastStatus
  year?: number
}
