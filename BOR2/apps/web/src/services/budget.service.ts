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
  id: string
  name: string
  amount: number
  paid: number
  outstanding: number
  budget_limit: number
  deadline: string | null // "YYYY-MM-DD" — paired with the project's start_date
  locked: boolean
  children?: CostAccount[]
}

export interface AccountLimit {
  account_id: string
  amount: number
}

export interface AccountPaidPoint {
  month: string
  paid: number
}

export interface AccountPayee {
  vendor_id: string
  vendor_name: string
  amount: number
  is_supervisor: boolean
}

export interface IncomePaidPoint {
  month: string
  amount: number
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
  budget_limit: number
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
  customer_group: string
  project_type: "house" | "building"
  margin_target: number
  start_date: string | null // "YYYY-MM-DD", manual — paired with each account's deadline

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
  labor_budget: number
  labor_billed: number
  labor_open: number
  labor_paid: number
  purchase_orders: PORow[]

  // Cost grouped by user-defined category (vendor → payments hierarchy)
  cost_categories: CostCategory[]
}

export interface LaborEstimateEmployee {
  name: string
  regular_hours: number
  ot_hours: number
  total_hours: number
  pay_rate: number
  regular_cost: number
  ot_cost: number
  total_cost: number
}

export interface LaborEstimate {
  company: string
  project_id: string
  has_mapping: boolean
  has_data: boolean
  addresses: string[]
  period_start: string
  period_end: string
  regular_hours: number
  ot_hours: number
  total_hours: number
  regular_cost: number
  ot_cost: number
  total_cost: number
  employees: LaborEstimateEmployee[]
}

export interface LaborSummaryItem {
  project_id: string
  total_cost: number
}

export type BudgetStatus = "all" | "in_progress" | "settled"

export const budgetService = {
  async getProjects(params: { company: string; status?: BudgetStatus; year?: number; month?: number }): Promise<BudgetProjectDetail[]> {
    const search = new URLSearchParams({ company: params.company })
    if (params.status && params.status !== "all") search.set("status", params.status)
    if (params.year) search.set("year", String(params.year))
    if (params.month) search.set("month", String(params.month))
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

  async setAccountLimit(body: { company: string; project_id: string; account_id: string; amount: number }): Promise<void> {
    await api.put(`/api/v1/budget/account-limits`, body, getToken())
  },

  async setAccountDeadline(body: { company: string; project_id: string; account_id: string; deadline: string }): Promise<void> {
    await api.put(`/api/v1/budget/account-limits/deadline`, body, getToken())
  },

  async setProjectStartDate(body: { company: string; project_id: string; start_date: string }): Promise<void> {
    await api.put(`/api/v1/budget/project-dates`, body, getToken())
  },

  async getAccountPayees(params: { company: string; project_id: string; account_id: string }): Promise<AccountPayee[]> {
    const search = new URLSearchParams(params)
    return (await api.get<AccountPayee[]>(`/api/v1/budget/projects/account-payees?${search}`, getToken())) ?? []
  },

  async getAccountHistory(params: { company: string; project_id: string; account_ids: string[] }): Promise<AccountPaidPoint[]> {
    const search = new URLSearchParams({
      company: params.company,
      project_id: params.project_id,
      account_ids: params.account_ids.join(","),
    })
    return (await api.get<AccountPaidPoint[]>(`/api/v1/budget/projects/account-history?${search}`, getToken())) ?? []
  },

  async getIncomeHistory(params: { company: string; project_id: string; type: string }): Promise<IncomePaidPoint[]> {
    const search = new URLSearchParams({ company: params.company, project_id: params.project_id, type: params.type })
    return (await api.get<IncomePaidPoint[]>(`/api/v1/budget/projects/income-history?${search}`, getToken())) ?? []
  },

  async getLaborEstimate(params: { company: string; project_id: string }): Promise<LaborEstimate | null> {
    const search = new URLSearchParams({ company: params.company, project_id: params.project_id })
    return api.get<LaborEstimate>(`/api/v1/budget/projects/labor-estimate?${search}`, getToken())
  },

  async getLaborSummary(company: string): Promise<Record<string, number>> {
    const arr = (await api.get<LaborSummaryItem[]>(`/api/v1/budget/projects/labor-estimate-summary?company=${company}`, getToken())) ?? []
    const m: Record<string, number> = {}
    for (const it of arr) m[it.project_id] = it.total_cost
    return m
  },
}
