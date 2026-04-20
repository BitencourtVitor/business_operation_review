import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ServiceRequest {
  id:                    string
  contractor:            string
  jobSite:               string
  city:                  string
  lot:                   string
  address:               string
  closeDate:             string | null
  dateReceived:          string | null
  materialAvailableDate: string | null
  residentAvailableDate: string | null
  dateCompleted:         string | null
  additionalVisits:      string[]
  issue:                 string
  warranty:              boolean
  tech:                  string
  createdAt:             string
}

export type ServiceRequestInput = Omit<ServiceRequest, "id" | "createdAt">

export interface SyncResult {
  total:    number
  inserted: number
}

export const serviceRequestService = {
  list:          ()                                           => api.get<ServiceRequest[]>("/api/v1/service-requests", getToken()),
  create:        (data: ServiceRequestInput)                  => api.post<ServiceRequest>("/api/v1/service-requests", data, getToken()),
  update:        (id: string, data: ServiceRequestInput)      => api.put<ServiceRequest>(`/api/v1/service-requests/${id}`, data, getToken()),
  remove:        (id: string)                                 => api.delete<void>(`/api/v1/service-requests/${id}`, getToken()),
  syncFromSheet: ()                                           => api.post<SyncResult>("/api/v1/service-requests/sync-sheet", {}, getToken()),
}
