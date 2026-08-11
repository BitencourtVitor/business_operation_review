import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type DocStatus = "missing" | "requested" | "received" | "not_applicable"
export type Urgency = "expired" | "urgent" | "soon" | "ok" | "none"
export type Lifecycle = "active" | "pending" | "inactive"

export interface SubDocType {
  key: string
  label: string
  has_expiry: boolean
  divisions: string[]
}

export interface SubDocDivision {
  key: string
  label: string
}

export interface SubDocEmailUser {
  id: string
  name: string
  email: string
}

export interface SubDocEmailRecipientSettings {
  to_user_ids: string[]
  cc_user_ids: string[]
}

export interface EmailDeliveryResult { delivery_id: string; provider: string }

export type WorkersCompCheckStatus = "pending" | "regular" | "irregular"

export interface WorkersCompReviewCheck {
  id: string
  contractor_id: number
  contractor_name: string
  email: string
  divisions: string[]
  status: WorkersCompCheckStatus
  notes: string
  checked_by: string | null
  checked_at: string | null
}

export interface WorkersCompReviewCycle {
  id: string
  review_date: string
  status: "open" | "closed"
  review_email_sent_at: string | null
  closed_at: string | null
  checks: WorkersCompReviewCheck[]
}

export interface SubDocEmailRecipientsData {
  users: SubDocEmailUser[]
  settings: SubDocEmailRecipientSettings
}

export interface SubDocRecord {
  doc_type: string
  division: string
  status: DocStatus
  start_date: string | null
  expiry_date: string | null
  requested_date: string | null
  notes: string
  // Where the document actually is — normally a SharePoint link.
  url: string
}

export interface SubDocContractor {
  id: number
  name: string
  email: string
  phone: string
  notes: string
  company: string | null
  divisions: string[]
  archived: boolean
  records: SubDocRecord[]
  next_expiry: string | null
  urgency: Urgency
  status: Lifecycle
}

export const subcontractorDocsService = {
  listTypes: () =>
    api.get<SubDocType[]>(`/api/v1/subcontractor-docs/types`, getToken()).then(r => r ?? []),

  listDivisions: () =>
    api.get<SubDocDivision[]>(`/api/v1/subcontractor-docs/divisions`, getToken()).then(r => r ?? []),

  listEmailRecipients: () =>
    api.get<SubDocEmailRecipientsData>(`/api/v1/subcontractor-docs/email-recipients`, getToken()),

  updateEmailRecipients: (body: { to_user_ids: string[]; cc_user_ids: string[] }) =>
    api.put<SubDocEmailRecipientSettings>(`/api/v1/subcontractor-docs/email-recipients`, body, getToken()),

  sendEmailRecipientsTest: (body: { to_user_ids: string[]; cc_user_ids: string[] }) =>
    api.post<EmailDeliveryResult>(`/api/v1/subcontractor-docs/email-recipients/test`, body, getToken()),

  getWorkersCompReview: () =>
    api.get<WorkersCompReviewCycle>(`/api/v1/subcontractor-docs/workers-comp-review`, getToken()),

  updateWorkersCompCheck: (id: string, body: { status: WorkersCompCheckStatus; notes: string }) =>
    api.patch<{ ok: boolean }>(`/api/v1/subcontractor-docs/workers-comp-review/checks/${id}`, body, getToken()),

  listContractors: (includeArchived?: boolean) =>
    api.get<SubDocContractor[]>(
      `/api/v1/subcontractor-docs/contractors${includeArchived ? "?include_archived=true" : ""}`,
      getToken(),
    ).then(r => r ?? []),

  createContractor: (body: { name: string; email: string; phone: string; notes: string; divisions: string[] }) =>
    api.post<{ id: number }>(`/api/v1/subcontractor-docs/contractors`, body, getToken()),

  updateContractor: (id: number, body: { name: string; email: string; phone: string; notes: string; divisions: string[] }) =>
    api.put(`/api/v1/subcontractor-docs/contractors/${id}`, body, getToken()),

  deleteContractor: (id: number) =>
    api.delete(`/api/v1/subcontractor-docs/contractors/${id}`, getToken()),

  archiveContractor: (id: number, archived: boolean) =>
    api.patch(`/api/v1/subcontractor-docs/contractors/${id}/archive`, { archived }, getToken()),

  setRecord: (body: {
    contractor_id: number; doc_type: string; division: string; status: DocStatus
    start_date?: string; expiry_date?: string; requested_date?: string; notes?: string
    url?: string
  }) =>
    api.put(`/api/v1/subcontractor-docs/records`, body, getToken()),
}
