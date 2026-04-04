import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ServiceRequest {
  id: string
  contractor: string
  jobSite: string
  city: string
  lot: string
  issue: string
  dateReceived: string
  dateCompleted: string
  warranty: string
  tech: string
}

export const serviceRequestService = {
  list: () => api.get<ServiceRequest[]>("/api/v1/service-requests", getToken()),
}
