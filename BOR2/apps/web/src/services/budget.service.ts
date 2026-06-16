import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface BudgetProject {
  customer_id: string
  name: string
  project_type: "house" | "building"
  projected_receive: number
  invoiced: number
  received: number
  to_receive: number
  cost_total: number
  cost_ceiling: number
  over_ceiling: boolean
  labor_committed: number
  labor_billed: number
  labor_open: number
  to_pay: number
  in_progress: boolean
  potentially_closed: boolean
}

export interface BudgetSummary {
  projected_receive: number
  invoiced: number
  received: number
  to_receive: number
  cost_total: number
  labor_committed: number
  labor_open: number
  to_pay: number
  projects: number
  in_progress: number
}

export interface CategoryCost {
  name: string
  icon: string
  actual: number
  max: number
  alert_pct: number
}

export interface POLineRow {
  description: string
  amount: number
  received: number
  open: number
}

export interface PORow {
  external_id: string
  doc_number: string
  txn_date: string
  vendor_name: string
  category: string
  po_status: string
  committed: number
  billed: number
  open: number
  lines: POLineRow[]
}

export interface BudgetProjectDetail {
  customer_id: string
  name: string
  project_type: "house" | "building"
  projected_receive: number
  invoiced: number
  received: number
  cost_total: number
  cost_ceiling: number
  margin_target: number
  categories: CategoryCost[]
  uncategorized: number
  purchase_orders: PORow[]
}

export type BudgetStatus = "all" | "in_progress" | "settled"

export const budgetService = {
  async getProjects(params: { company: string; status?: BudgetStatus }): Promise<BudgetProject[]> {
    const search = new URLSearchParams({ company: params.company })
    if (params.status && params.status !== "all") search.set("status", params.status)
    return (await api.get<BudgetProject[]>(`/api/v1/budget/projects?${search}`, getToken())) ?? []
  },

  async getSummary(params: { company: string }): Promise<BudgetSummary | null> {
    const search = new URLSearchParams({ company: params.company })
    return api.get<BudgetSummary>(`/api/v1/budget/summary?${search}`, getToken())
  },

  async getDetail(params: { company: string; customer_id: string }): Promise<BudgetProjectDetail | null> {
    const search = new URLSearchParams({ company: params.company, customer_id: params.customer_id })
    return api.get<BudgetProjectDetail>(`/api/v1/budget/projects/detail?${search}`, getToken())
  },
}
