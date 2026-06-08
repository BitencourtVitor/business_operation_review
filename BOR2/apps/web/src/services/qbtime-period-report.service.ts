import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

// ── Pay Periods ───────────────────────────────────────────────────────────────

export interface PayPeriod {
  label:     string // "Apr 26 – May 9, 2026"
  startDate: string // "2026-04-26"
  endDate:   string // "2026-05-09"
}

export interface PayPeriodsResponse {
  company: string
  periods: PayPeriod[]
}

// ── Intervals ─────────────────────────────────────────────────────────────────

export interface PeriodBlock {
  start:           string   // ISO 8601
  end:             string   // ISO 8601
  durationMinutes: number
  jobcodePath:     string[] // full hierarchy from root to leaf
  type:            "regular" | "break"
  isPaid:          boolean
}

export interface PeriodDay {
  date:         string        // "2026-04-27"
  dayName:      string        // "Monday"
  totalHours:   number
  totalMinutes: number
  blocks:       PeriodBlock[]
}

export interface PeriodEmployee {
  name:        string
  team:        string // BOR2 team name ("" when unassigned)
  totalHours:  number
  totalOTHours: number
  days:        PeriodDay[]
}

export interface IntervalsResponse {
  company:   string
  startDate: string
  endDate:   string
  employees: PeriodEmployee[]
}

// ── Accounting ────────────────────────────────────────────────────────────────

export interface AccountingRow {
  employee:     string
  jobcodePath:  string[]
  regularHours: number
  regularRate:  number
  regularCost:  number
  otHours:      number
  otRate:       number
  otCost:       number
  totalHours:   number
  totalCost:    number
}

export interface AccountingTotals {
  regularHours: number
  regularCost:  number
  otHours:      number
  otCost:       number
  totalHours:   number
  totalCost:    number
}

export interface AccountingResponse {
  company:   string
  startDate: string
  endDate:   string
  rows:      AccountingRow[]
  totals:    AccountingTotals
}

// ── Addresses (Pillar 2) ────────────────────────────────────────────────────────

export interface PeriodAddress {
  address: string
  unpaid:  boolean
}

// ── Service ───────────────────────────────────────────────────────────────────

export const periodReportService = {
  getPeriods: (company: string) =>
    api.get<PayPeriodsResponse>(
      `/api/v1/qbtime/period-report/periods?company=${encodeURIComponent(company)}`,
      getToken(),
    ),

  getIntervals: (company: string, startDate: string, endDate: string) =>
    api.get<IntervalsResponse>(
      `/api/v1/qbtime/period-report/intervals?company=${encodeURIComponent(company)}&start_date=${startDate}&end_date=${endDate}`,
      getToken(),
    ),

  getAccounting: (company: string, startDate: string, endDate: string) =>
    api.get<AccountingResponse>(
      `/api/v1/qbtime/period-report/accounting?company=${encodeURIComponent(company)}&start_date=${startDate}&end_date=${endDate}`,
      getToken(),
    ),

  listAddresses: (company: string) =>
    api.get<PeriodAddress[]>(
      `/api/v1/qbtime/period-report/addresses?company=${encodeURIComponent(company)}`,
      getToken(),
    ),

  setUnpaidAddress: (company: string, address: string, unpaid: boolean) =>
    api.post<{ address: string; unpaid: boolean }>(
      `/api/v1/qbtime/period-report/unpaid-addresses`,
      { company, address, unpaid },
      getToken(),
    ),

  refresh: (company: string, days = 100) =>
    api.post<{ company: string; days: number; status: string }>(
      `/api/v1/qbtime/period-report/refresh?company=${encodeURIComponent(company)}&days=${days}`,
      {},
      getToken(),
    ),
}
