import { api } from "@/lib/api"
import type { AccountingFilters, AccountingRecord, AccountingSummary } from "@bor2/shared"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const accountingService = {
  list: (filters?: Partial<AccountingFilters>) => {
    const params = new URLSearchParams()
    if (filters?.company) params.set("company", filters.company)
    if (filters?.type) params.set("type", filters.type)
    if (filters?.month) params.set("month", filters.month)
    if (filters?.year) params.set("year", String(filters.year))
    return api.get<AccountingRecord[]>(`/api/v1/accounting?${params}`, getToken())
  },

  summary: (company?: string, year?: number) => {
    const params = new URLSearchParams()
    if (company) params.set("company", company)
    if (year) params.set("year", String(year))
    return api.get<AccountingSummary>(`/api/v1/accounting/summary?${params}`, getToken())
  },

  get: (id: string) =>
    api.get<AccountingRecord>(`/api/v1/accounting/${id}`, getToken()),

  create: (data: Omit<AccountingRecord, "id" | "createdAt" | "updatedAt">) =>
    api.post<AccountingRecord>("/api/v1/accounting", data, getToken()),

  update: (id: string, data: Partial<AccountingRecord>) =>
    api.put<AccountingRecord>(`/api/v1/accounting/${id}`, data, getToken()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/accounting/${id}`, getToken()),
}
