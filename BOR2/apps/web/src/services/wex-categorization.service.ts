import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WexNormEntry {
  id: number
  company: string
  driverId: string
  wexName: string
  qbName: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface WexNormInput {
  company: string
  driverId: string
  wexName?: string
  qbName: string
  isActive?: boolean
}

export interface WexReportMeta {
  wexTxCount: number
  wexTotal: number
  wexDrivers: number
  qbEntries: number
  qbEmployees: number
  matched: number
  officeCount: number
  uniqueObras: number
  totalCost: number
}

export interface WexReport {
  id: string
  company: string
  filterFrom: string
  filterTo: string
  meta: WexReportMeta
  results?: unknown[]   // only present when fetched individually
  createdAt: string
}

export interface WexReportInput {
  company: string
  filterFrom: string
  filterTo: string
  meta: WexReportMeta
  results: unknown[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const wexCategorizationService = {
  // Normalization
  listNorm:   (company: string)                          => api.get<WexNormEntry[]>(`/api/v1/wex/normalization?company=${company}`, getToken()),
  upsertNorm: (data: WexNormInput)                       => api.post<WexNormEntry>("/api/v1/wex/normalization", data, getToken()),
  updateNorm: (id: number, data: WexNormInput)           => api.put<WexNormEntry>(`/api/v1/wex/normalization/${id}`, data, getToken()),
  deleteNorm: (id: number)                               => api.delete<void>(`/api/v1/wex/normalization/${id}`, getToken()),

  // Reports
  listReports:  (company: string)                        => api.get<WexReport[]>(`/api/v1/wex/reports?company=${company}`, getToken()),
  getReport:    (id: string)                             => api.get<WexReport>(`/api/v1/wex/reports/${id}`, getToken()),
  createReport: (data: WexReportInput)                   => api.post<WexReport>("/api/v1/wex/reports", data, getToken()),
  deleteReport: (id: string)                             => api.delete<void>(`/api/v1/wex/reports/${id}`, getToken()),
}
