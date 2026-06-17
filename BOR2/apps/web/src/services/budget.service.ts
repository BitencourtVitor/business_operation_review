import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface BudgetProject {
  project_id: string
  client_name: string
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

export interface BudgetCustomer {
  customer_id: string
  name: string
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

export interface IncomeAccount {
  name: string
  amount: number
  outstanding: number
}

export interface CostAccount {
  name: string
  group: string // "Cost of Goods Sold" | "Expense" | "Other"
  amount: number // includes children
  children?: CostAccount[]
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
  vendor_id: string
  vendor_name: string
  category: string
  po_status: string
  committed: number
  billed: number
  open: number
  lines: POLineRow[]
}

export interface VendorPayment {
  date: string
  amount: number
  ref_number: string
}

export interface CostVendor {
  vendor_id: string
  vendor_name: string
  committed: number
  billed: number
  paid: number
  open: number
  payments: VendorPayment[]
  purchase_orders: PORow[]
}

export interface CostCategory {
  category_id: string
  category_name: string
  icon: string
  committed: number
  billed: number
  paid: number
  open: number
  vendors: CostVendor[]
}

export interface BudgetProjectDetail {
  project_id: string
  client_name: string
  name: string
  project_type: "house" | "building"
  margin_target: number

  // Income (a receber)
  projected_receive: number
  invoiced: number
  income_actual: number
  received: number
  to_receive: number
  income_accounts: IncomeAccount[]

  // Cost (a pagar)
  cost_total: number
  cost_ceiling: number
  paid: number
  open_payable: number
  to_pay: number
  cost_accounts: CostAccount[]

  // Forward subcontractor commitment (POs)
  labor_committed: number
  labor_billed: number
  labor_open: number
  purchase_orders: PORow[]

  // Cost grouped by user-defined category (vendor → payments hierarchy)
  cost_categories: CostCategory[]
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

  async getCustomers(params: { company: string }): Promise<BudgetCustomer[]> {
    const search = new URLSearchParams({ company: params.company })
    return (await api.get<BudgetCustomer[]>(`/api/v1/budget/customers?${search}`, getToken())) ?? []
  },

  async getDetail(params: { company: string; project_id: string }): Promise<BudgetProjectDetail | null> {
    const search = new URLSearchParams({ company: params.company, project_id: params.project_id })
    return api.get<BudgetProjectDetail>(`/api/v1/budget/projects/detail?${search}`, getToken())
  },
}
