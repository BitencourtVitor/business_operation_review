import type { Company } from "./common"

export type SubcontractorStatus = "active" | "inactive" | "suspended" | "pending"

export interface SubcontractorPerformance {
  id: string
  company: Company
  subcontractorName: string
  status: SubcontractorStatus
  performanceScore: number
  completedProjects: number
  activeProjects: number
  lastEventAt: string
  createdAt: string
  updatedAt: string
}

export interface SubcontractorFilters {
  company?: Company
  status?: SubcontractorStatus
}
