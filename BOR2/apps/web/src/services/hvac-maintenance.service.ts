import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type Season = "spring" | "summer" | "fall" | "winter"

export type MaintenanceStage ="prospect" | "to_schedule" | "scheduled" | "renew" | "archived"

/**
 * A invoice como o QuickBooks a vê. `found` falso quando o sync ainda não a
 * trouxe (ou o número está errado); total zero é invoice anulada.
 */
export interface MaintenanceInvoice {
  number: string
  found: boolean
  customer?: string | null
  date?: string | null
  dueDate?: string | null
  paidOn?: string | null
  total?: number | null
  balance?: number | null
  lines?: { description: string | null; amount: number | null }[]
  linkedTo?: string | null
}

// Datas em "YYYY-MM-DD".
export interface MaintenanceContract {
  id: string
  clientName: string
  address: string
  city: string
  phone: string
  email: string
  planSentOn: string | null
  contractStart: string | null
  contractValue: number | null
  season: Season | null
  invoices: string[]
  firstService: string | null
  secondService: string | null
  archived: boolean
  invoiceStatus: MaintenanceInvoice[]
  stage: MaintenanceStage
  unpaid: boolean
}

export interface MaintenanceComment {
  id: number
  body: string
  authorId: string
  authorName: string
  authorRole: string
  createdAt: string
}

export type MaintenanceInput = Omit<MaintenanceContract, "id" | "invoiceStatus" | "stage" | "unpaid">

const BASE = "/api/v1/hvac-maintenance"

export const hvacMaintenanceService = {
  list:   ()                                   => api.get<MaintenanceContract[]>(BASE, getToken()),
  searchInvoices: (q: string)                  => api.get<MaintenanceInvoice[]>(`${BASE}/invoices?q=${encodeURIComponent(q)}`, getToken()),
  create: (data: MaintenanceInput)             => api.post<{ id: string }>(BASE, data, getToken()),
  update: (id: string, data: MaintenanceInput) => api.put<{ id: string }>(`${BASE}/${id}`, data, getToken()),
  listComments: (id: string)                   => api.get<MaintenanceComment[]>(`${BASE}/${id}/comments`, getToken()),
  addComment: (id: string, body: string)       => api.post<MaintenanceComment>(`${BASE}/${id}/comments`, { body }, getToken()),
  updateComment: (id: string, cid: number, body: string) => api.put<void>(`${BASE}/${id}/comments/${cid}`, { body }, getToken()),
  removeComment: (id: string, cid: number)     => api.delete<void>(`${BASE}/${id}/comments/${cid}`, getToken()),
  remove: (id: string)                         => api.delete<void>(`${BASE}/${id}`, getToken()),
}
