import type { Company, Month } from "./common"

export type AccountingType = "receivables" | "payables"

export interface AccountingRecord {
  id: string
  company: Company
  type: AccountingType
  month: string
  year: number
  amount: number
  description: string
  category: string
  dueDate?: string
  paidDate?: string
  createdAt: string
  updatedAt: string
}

export interface AccountingFilters {
  company?: Company
  type?: AccountingType
  month?: Month
  year?: number
}

export interface AccountingSummary {
  totalReceivables: number
  totalPayables: number
  netBalance: number
  byMonth: Record<Month, { receivables: number; payables: number }>
}
