import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type DocStatus = "missing" | "requested" | "received" | "not_applicable"
export type Urgency = "expired" | "urgent" | "soon" | "ok" | "none"

export interface SubDocType {
  key: string
  label: string
  has_expiry: boolean
}

export interface SubDocRecord {
  doc_type: string
  status: DocStatus
  start_date: string | null
  expiry_date: string | null
  requested_date: string | null
  notes: string
}

export interface SubDocContractor {
  id: number
  name: string
  email: string
  phone: string
  notes: string
  records: SubDocRecord[]
  next_expiry: string | null
  urgency: Urgency
}

export const subcontractorDocsService = {
  listTypes: () =>
    api.get<SubDocType[]>(`/api/v1/subcontractor-docs/types`, getToken()).then(r => r ?? []),

  listContractors: () =>
    api.get<SubDocContractor[]>(`/api/v1/subcontractor-docs/contractors`, getToken()).then(r => r ?? []),

  createContractor: (body: { name: string; email: string; phone: string; notes: string }) =>
    api.post<{ id: number }>(`/api/v1/subcontractor-docs/contractors`, body, getToken()),

  updateContractor: (id: number, body: { name: string; email: string; phone: string; notes: string }) =>
    api.put(`/api/v1/subcontractor-docs/contractors/${id}`, body, getToken()),

  deleteContractor: (id: number) =>
    api.delete(`/api/v1/subcontractor-docs/contractors/${id}`, getToken()),

  setRecord: (body: {
    contractor_id: number; doc_type: string; status: DocStatus
    start_date?: string; expiry_date?: string; requested_date?: string; notes?: string
  }) =>
    api.put(`/api/v1/subcontractor-docs/records`, body, getToken()),
}
