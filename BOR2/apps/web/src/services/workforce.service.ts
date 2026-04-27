import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface WorkforceUpload {
  id: string
  referenceMonth: string
  company: string
  fileName: string
  recordCount: number
  totalHours: number
  uploadedBy: string
  uploadedAt: string
  status: string
}

export interface WorkforceRow {
  id: string
  uploadId: string
  client: string
  jobsite: string
  lotBuilding: string
  worktype: string
  employeeName: string
  regularRate: number
  regularHours: number
  referenceMonth: string
  company: string
}

export interface WorkforceFilters {
  company?: string
  month?: string
  worktype?: string
  jobsite?: string
}

export const workforceService = {
  // ── Data rows ──────────────────────────────────────────────────────────────
  list: (filters: WorkforceFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.company)  params.set("company",  filters.company)
    if (filters.month)    params.set("month",    filters.month)
    if (filters.worktype) params.set("worktype", filters.worktype)
    if (filters.jobsite)  params.set("jobsite",  filters.jobsite)
    const qs = params.toString()
    return api.get<WorkforceRow[]>(`/api/v1/workforce${qs ? `?${qs}` : ""}`, getToken())
  },

  // ── Uploads ────────────────────────────────────────────────────────────────
  listUploads: () =>
    api.get<WorkforceUpload[]>("/api/v1/workforce/uploads", getToken()),

  upload: async (
    file: File,
    company: string,
    referenceMonth: string,
    overwrite = false,
  ) => {
    const form = new FormData()
    form.append("file", file)
    form.append("company", company)
    form.append("reference_month", referenceMonth)
    if (overwrite) form.append("overwrite", "true")

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/v1/workforce/uploads`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      },
    )
    const json = await res.json()
    if (!res.ok) return { ok: false as const, status: res.status, ...json }
    return { ok: true as const, ...json }
  },

  deleteUpload: (id: string) =>
    api.delete(`/api/v1/workforce/uploads/${id}`, getToken()),

  // ── Attribution Rules ──────────────────────────────────────────────────────
  listRules: () =>
    api.get<AttributionRule[]>("/api/v1/workforce/rules", getToken()),

  createRule: (body: Omit<AttributionRule, "id" | "createdBy" | "createdAt" | "updatedAt">) =>
    api.post<AttributionRule>("/api/v1/workforce/rules", body, getToken()),

  updateRule: (id: string, body: Omit<AttributionRule, "id" | "createdBy" | "createdAt" | "updatedAt">) =>
    api.put<AttributionRule>(`/api/v1/workforce/rules/${id}`, body, getToken()),

  deleteRule: (id: string) =>
    api.delete(`/api/v1/workforce/rules/${id}`, getToken()),
}

// ── Attribution Rule types ─────────────────────────────────────────────────

export interface RuleConditions {
  company?:  string
  client?:   string
  jobsite?:  string
  worktype?: string
}

export interface AttributionRule {
  id:            string
  name:          string
  conditions:    RuleConditions
  targetCompany: string
  createdBy:     string
  createdAt:     string
  updatedAt:     string
}
