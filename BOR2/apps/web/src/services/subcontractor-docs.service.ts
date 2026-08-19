import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type DocStatus = "missing" | "requested" | "received" | "not_applicable"
// The Workers' Comp vocabulary, reused by documents whose question is "is this
// in order?" rather than "did the paper arrive?".
export type ConditionStatus = "pending" | "regular" | "irregular"
export type RecordStatus = DocStatus | ConditionStatus
export type StatusModel = "document" | "condition"
export type Urgency = "expired" | "urgent" | "soon" | "ok" | "none"
export type Lifecycle = "active" | "pending" | "inactive"

export interface SubDocType {
  key: string
  label: string
  has_expiry: boolean
  status_model: StatusModel
  divisions: string[]
}

export interface SubDocDivision {
  key: string
  label: string
  // Display-only parent. A sub in a subdivision is not in the parent division,
  // and the parent's document catalog is not inherited.
  parent_key: string | null
}

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
  status: "open" | "closed" | "not_opened"
  review_email_sent_at: string | null
  closed_at: string | null
  checks: WorkersCompReviewCheck[]
  prev_review_date: string
  next_review_date: string
}

export interface SubDocRecord {
  doc_type: string
  division: string
  status: RecordStatus
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
  // Who signs for the sub. `name` is the company; this is the person.
  owner_name: string
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

  getWorkersCompReview: (date?: string) =>
    api.get<WorkersCompReviewCycle>(
      `/api/v1/subcontractor-docs/workers-comp-review${date ? `?date=${date}` : ""}`,
      getToken(),
    ),

  updateWorkersCompCheck: (id: string, body: { status: WorkersCompCheckStatus; notes: string }) =>
    api.patch<{ ok: boolean }>(`/api/v1/subcontractor-docs/workers-comp-review/checks/${id}`, body, getToken()),

  listContractors: (includeArchived?: boolean) =>
    api.get<SubDocContractor[]>(
      `/api/v1/subcontractor-docs/contractors${includeArchived ? "?include_archived=true" : ""}`,
      getToken(),
    ).then(r => r ?? []),

  createContractor: (body: { name: string; owner_name: string; email: string; phone: string; notes: string; divisions: string[] }) =>
    api.post<{ id: number }>(`/api/v1/subcontractor-docs/contractors`, body, getToken()),

  updateContractor: (id: number, body: { name: string; owner_name: string; email: string; phone: string; notes: string; divisions: string[] }) =>
    api.put(`/api/v1/subcontractor-docs/contractors/${id}`, body, getToken()),

  deleteContractor: (id: number) =>
    api.delete(`/api/v1/subcontractor-docs/contractors/${id}`, getToken()),

  archiveContractor: (id: number, archived: boolean) =>
    api.patch(`/api/v1/subcontractor-docs/contractors/${id}/archive`, { archived }, getToken()),

  setRecord: (body: {
    contractor_id: number; doc_type: string; division: string; status: RecordStatus
    start_date?: string; expiry_date?: string; requested_date?: string; notes?: string
    url?: string
  }) =>
    api.put(`/api/v1/subcontractor-docs/records`, body, getToken()),
}
