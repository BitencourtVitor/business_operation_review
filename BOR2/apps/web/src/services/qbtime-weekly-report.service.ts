import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface WeeklyAddress {
  path:  string[]  // full hierarchy from root to leaf, e.g. ["Canton, Neponset", "Normal Labor"]
  hours: number
}

export interface WeeklyShift {
  start: string  // ISO 8601: "2026-05-13T07:00:00-04:00"
  end:   string  // ISO 8601 (empty if still clocked-in)
}

export interface WeeklyDay {
  date:       string   // "2026-05-13"
  day:        string   // "Wednesday"
  totalHours: number
  addresses:  WeeklyAddress[]
  shifts:     WeeklyShift[]
}

export interface WeeklyEmployee {
  name:            string
  days:            WeeklyDay[]
  weekTotal:       number
  weekExcess:      number
  suggestionHours: number
}

export interface WeeklyReport {
  company:     string
  weekStart:   string  // Monday date
  weekEnd:     string  // last day with data
  reportDate:  string  // the date param
  hoursPerDay: number
  employees:   WeeklyEmployee[]
}

export const weeklyReportService = {
  get: (company: string, date: string) =>
    api.get<WeeklyReport>(
      `/api/v1/qbtime/weekly-report?company=${encodeURIComponent(company)}&date=${date}`,
      getToken(),
    ),
}
