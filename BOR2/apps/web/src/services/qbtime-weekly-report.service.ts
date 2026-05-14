import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface WeeklyAddress {
  address: string
  hours:   number
}

export interface WeeklyDay {
  date:       string   // "2026-05-13"
  day:        string   // "Wednesday"
  totalHours: number
  addresses:  WeeklyAddress[]
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
