export interface QBTimeDailyReport {
  id: string
  company: string
  date: string        // "YYYY-MM-DD"
  fileName: string
  entries?: QBTimeDailyReportEntry[]
  createdAt: string
  createdById: string
  createdByName: string
}

export interface QBTimeDailyReportEntry {
  id: string
  reportId: string
  employeeRaw: string     // "Last, First"
  employeeDisplay: string // "First Last"
  jobCode: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface QBTimeTeam {
  id: string
  company: string
  name: string
  members: string[]
  createdAt: string
}

export interface QBTimeEmployeeTeam {
  id: string
  company: string
  qbtUserId: number
  employeeName: string
  qbTeamId: number | null
  qbTeamName: string | null
  overrideTeamName: string | null
  overriddenBy: string | null
  overriddenAt: string | null
  lastSyncedAt: string
  effectiveTeamName: string
  isOverridden: boolean
}
