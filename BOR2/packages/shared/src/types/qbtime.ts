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
