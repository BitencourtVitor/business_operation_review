import type { Company } from "./common"

export type ForecastStatus = "planned" | "active" | "completed" | "cancelled"

export interface ForecastFieldwireDoc {
  id?: number
  status?: string | null
  category?: string
  document?: string
}

export interface ForecastMachineItem {
  id?: number
  title?: string | null
  unit?: string | null
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
  obsAuthor?: string
  obsRole?: string
  obsAt?: string | null
  hvac: boolean
  buildertrend: boolean
  storage: boolean
  hasOrders: boolean
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

export interface ForecastObsEntry {
  id: number
  projectId: string
  body: string
  authorId: string
  authorName: string
  authorRole: string
  createdAt: string
}

export interface ForecastFilters {
  company?: Company
  status?: ForecastStatus
  year?: number
  month?: number
}

export function getForecastDisplayStatus(
  p: ForecastProject,
  dateMode?: "start" | "beams",
): ForecastDisplayStatus {
  if (p.status === "completed" || p.status === "cancelled") return p.status
  if (p.status === "active") return "active"
  if (p.status === "planned") {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Which date(s) to check depends on the active grouping mode.
    // If dateMode is provided, only the matching date qualifies a project as overdue.
    // Without dateMode (e.g. detail panels) both dates are considered.
    const candidates =
      dateMode === "start"  ? [p.previousStartDate] :
      dateMode === "beams"  ? [p.previousBeamsDate]  :
      [p.previousStartDate, p.previousBeamsDate]
    const dates = candidates
      .filter(Boolean)
      .map(s => {
        // parseInt stops at "T" in "YYYY-MM-DDTHH:mm:ssZ", avoiding NaN from Number()
        const [y, m, d] = s!.split("-").map(n => parseInt(n, 10))
        return new Date(y, m - 1, d)
      })
    if (dates.some(date => date <= today)) return "overdue"
  }
  return p.status
}
