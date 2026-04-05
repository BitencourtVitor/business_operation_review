import type { Company } from "./common"

export type ForecastStatus = "planned" | "active" | "completed" | "cancelled"

export interface ForecastFieldwireDoc {
  id?: number
  status?: boolean | string | null
}

export interface ForecastMachineItem {
  id?: number
  title?: string | null
  status?: string | null   // "scheduled" | "dispensed" | "true" | "yes" | "1" → active
}

export interface ForecastContractStep {
  id?: number
  team?: string | null
  step?: string | null
  status?: string | null
}

export type ForecastDisplayStatus = "active" | "planned" | "overdue" | "completed" | "cancelled"

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
  // Extended fields
  cliente: string
  jobSite: string
  type: string
  loteBld: string
  address: string
  obs: string
  hvac: boolean
  buildertrend: boolean
  storage: boolean
  machineProvider: string
  previousBeamsDate?: string | null
  previousStartDate?: string | null
  previousEndDate?: string | null
  // Tracked item arrays (from backend sub-resources)
  fieldwire?: ForecastFieldwireDoc[]
  machines?: ForecastMachineItem[]
  contractSteps?: ForecastContractStep[]
  createdAt: string
  updatedAt: string
}

export interface ForecastFilters {
  company?: Company
  status?: ForecastStatus
  year?: number
  month?: number
}

export function getForecastDisplayStatus(p: ForecastProject): ForecastDisplayStatus {
  if (p.status === "completed" || p.status === "cancelled") return p.status
  const now = new Date()
  const end = new Date(p.endDate)
  if (end < now) return "overdue"
  return p.status
}
