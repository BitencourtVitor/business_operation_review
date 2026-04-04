import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface Receivable {
  id: string
  transactionType: string
  customer: string
  dueDate: string
  openBalance: number
  category: string
  aging: number
}

export interface Payable {
  id: string
  transactionType: string
  vendor: string
  dueDate: string
  openBalance: number
  category: string
  aging: number
}

export const receivableService = {
  list: (company?: string) => {
    const params = new URLSearchParams()
    if (company) params.set("company", company)
    const qs = params.toString()
    return api.get<Receivable[]>(`/api/v1/receivables${qs ? `?${qs}` : ""}`, getToken())
  },
}

export const payableService = {
  list: (company?: string) => {
    const params = new URLSearchParams()
    if (company) params.set("company", company)
    const qs = params.toString()
    return api.get<Payable[]>(`/api/v1/payables${qs ? `?${qs}` : ""}`, getToken())
  },
}
