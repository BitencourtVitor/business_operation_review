import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ChartPoint {
  period: string
  received: number
  paid: number
}

export interface ProjectCard {
  customer_id: string
  name: string
  estimate: number
  invoiced: number
  expenses: number
  profit: number
  profit_pct: number
}

// ── Project Detail types ──────────────────────────────────────────────────────

export interface EstimateLine {
  description: string
  amount: number
  unit_price: number
  quantity: number
  item_ref_name: string
}

export interface EstimateInfo {
  doc_number: string
  txn_date: string
  txn_status: string
  total_amount: number
  lines: EstimateLine[]
}

export interface BillPaymentBrief {
  doc_number: string
  txn_date: string
  total_amount: number
  private_note: string
}

export interface BillLine {
  description: string
  amount: number
  account_ref_name: string
}

export interface BillDetail {
  external_id: string
  doc_number: string
  txn_date: string
  vendor_name: string
  total_amount: number
  lines: BillLine[]
  payments: BillPaymentBrief[]
}

export interface PurchaseLine {
  description: string
  amount: number
  account_ref_name: string
}

export interface PurchaseDetail {
  external_id: string
  txn_date: string
  payment_type: string
  total_amount: number
  private_note: string
  lines: PurchaseLine[]
}

export interface VendorCreditLine {
  description: string
  amount: number
  account_ref_name: string
}

export interface VendorCreditDetail {
  external_id: string
  doc_number: string
  txn_date: string
  vendor_name: string
  total_amount: number
  lines: VendorCreditLine[]
}

export interface PaymentBrief {
  total_amount: number
  txn_date: string
  payment_ref: string
  private_note: string
}

export interface InvoiceDetail {
  external_id: string
  doc_number: string
  txn_date: string
  total_amount: number
  balance: number
  payments: PaymentBrief[]
}

export interface BackchargeDetail {
  txn_date: string
  amount: number
  description: string
  memo: string
}

export interface POLineBrief {
  description: string
  amount: number
  received: number
  account_ref_name: string
}

export interface PurchaseOrderDetail {
  external_id: string
  doc_number: string
  txn_date: string
  vendor_name: string
  po_status: string
  total_amount: number
  received: number
  open: number
  lines: POLineBrief[]
}

export interface ProjectDetailData {
  customer_name: string
  estimate: EstimateInfo | null
  bills: BillDetail[]
  purchases: PurchaseDetail[]
  vendor_credits: VendorCreditDetail[]
  invoices: InvoiceDetail[]
  backcharges: BackchargeDetail[]
  purchase_orders: PurchaseOrderDetail[]
}

// ── Service ───────────────────────────────────────────────────────────────────

export const qbAccountingService = {
  async getYears(params: { company: string }): Promise<number[]> {
    const search = new URLSearchParams({ company: params.company })
    return (await api.get<number[]>(`/api/v1/qb/accounting/years?${search}`, getToken())) ?? []
  },

  async getChart(params: { company: string; year?: number; month?: number }): Promise<ChartPoint[]> {
    const search = new URLSearchParams({ company: params.company })
    if (params.year)  search.set("year",  String(params.year))
    if (params.month) search.set("month", String(params.month).padStart(2, "0"))
    return (await api.get<ChartPoint[]>(`/api/v1/qb/accounting/chart?${search}`, getToken())) ?? []
  },

  async getProjects(params: { company: string; year?: number }): Promise<ProjectCard[]> {
    const search = new URLSearchParams({
      company: params.company,
      ...(params.year ? { year: String(params.year) } : {}),
    })
    return (await api.get<ProjectCard[]>(`/api/v1/qb/accounting/projects?${search}`, getToken())) ?? []
  },

  async getProjectDetail(params: { company: string; customer_id: string }): Promise<ProjectDetailData | null> {
    const search = new URLSearchParams({
      company: params.company,
      customer_id: params.customer_id,
    })
    return api.get<ProjectDetailData>(`/api/v1/qb/accounting/projects/detail?${search}`, getToken())
  },
}
