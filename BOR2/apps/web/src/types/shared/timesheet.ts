import type { Company } from "./common"

export interface TimesheetEntry {
  id: string
  company: Company
  employeeName: string
  projectName: string
  hoursWorked: number
  date: string
  week: number
  year: number
  createdAt: string
}

export interface TimesheetFilters {
  company?: Company
  week?: number
  year?: number
  employeeName?: string
}

export interface TimesheetSummary {
  totalHours: number
  byEmployee: Record<string, number>
  byProject: Record<string, number>
  byWeek: Record<number, number>
}
