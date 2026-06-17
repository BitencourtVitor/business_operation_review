import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface BudgetCustomer {
  customer_id: string
  name: string
}

export interface IncomeAccount {
  name: string
  amount: number
  outstanding: number
}

export interface CostAccount {
  name: string
  amount: number
  paid: number
  outstanding: number
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

export interface VendorBackCharge {
  date: string
  amount: number
  ref_number: string
}

export interface POPayment {
  date: string
  amount: number
  ref_number: string
}

export interface PODetail {
  external_id: string
  doc_number: string
  txn_date: string
  status: "open" | "settled"
  committed: number
  billed: number
  paid: number
  open: number
  payments: POPayment[]
}

export interface CostVendor {
  vendor_id: string
  vendor_name: string
  committed: number
  billed: number
  paid: number
  open: number
  back_charges: VendorBackCharge[]
  purchase_orders: PODetail[]
}

export interface CostCategory {
  category_id: string
  category_name: string
  icon: string
  budget_limit: number
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
  over_ceiling: boolean
  paid: number
  open_payable: number
  to_pay: number
  in_progress: boolean
  potentially_closed: boolean
  cost_accounts: CostAccount[]

  // Forward subcontractor commitment (POs)
  labor_committed: number
  labor_billed: number
  labor_open: number
  labor_paid: number
  purchase_orders: PORow[]

  // Cost grouped by user-defined category (vendor → payments hierarchy)
  cost_categories: CostCategory[]
}

export type BudgetStatus = "all" | "in_progress" | "settled"

export const budgetService = {
  async getProjects(params: { company: string; status?: BudgetStatus }): Promise<BudgetProjectDetail[]> {
    const search = new URLSearchParams({ company: params.company })
    if (params.status && params.status !== "all") search.set("status", params.status)
    return (await api.get<BudgetProjectDetail[]>(`/api/v1/budget/projects?${search}`, getToken())) ?? []
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
