import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface ProjectMapping {
  customer_id: string
  client_id: number | null
  job_site_id: number | null
}

export const budgetMappingService = {
  list: (company: string) =>
    api.get<ProjectMapping[]>(`/api/v1/budget/project-mappings?company=${company}`, getToken()).then(r => r ?? []),

  set: (body: { company: string; customer_id: string; client_id: number | null; job_site_id: number | null }) =>
    api.put(`/api/v1/budget/project-mappings`, body, getToken()),
}
