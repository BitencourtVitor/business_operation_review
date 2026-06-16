import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface BudgetProject {
  customer_id: string
  name: string
  projected_receive: number // estimate total
  invoiced: number          // customer invoices
  received: number          // customer payments
  labor_committed: number   // purchase-order line total (projected labor)
  labor_billed: number      // purchase-order received (realized)
  labor_open: number        // open PO commitment (to pay)
}

export interface BudgetSummary {
  projected_receive: number
  invoiced: number
  received: number
  labor_committed: number
  labor_billed: number
  labor_open: number
  projects: number
}

export const budgetService = {
  async getProjects(params: { company: string; year?: number }): Promise<BudgetProject[]> {
    const search = new URLSearchParams({
      company: params.company,
      ...(params.year ? { year: String(params.year) } : {}),
    })
    return (await api.get<BudgetProject[]>(`/api/v1/budget/projects?${search}`, getToken())) ?? []
  },

  async getSummary(params: { company: string; year?: number }): Promise<BudgetSummary | null> {
    const search = new URLSearchParams({
      company: params.company,
      ...(params.year ? { year: String(params.year) } : {}),
    })
    return api.get<BudgetSummary>(`/api/v1/budget/summary?${search}`, getToken())
  },
}
