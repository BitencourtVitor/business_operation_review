import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type ClientItem   = { id: number; name: string }
export type JobSiteItem  = { id: number; client_id: number; name: string }

export const clientsCatalogService = {
  listClients:   () =>
    api.get<ClientItem[]>(`/api/v1/forecast/clients`, getToken()),

  addClient:     (name: string) =>
    api.post<{ id: number }>(`/api/v1/forecast/clients`, { name }, getToken()),

  updateClient:  (id: number, name: string) =>
    api.patch<void>(`/api/v1/forecast/clients/${id}`, { name }, getToken()),

  deleteClient:  (id: number) =>
    api.delete<void>(`/api/v1/forecast/clients/${id}`, getToken()),

  listJobSites:  () =>
    api.get<JobSiteItem[]>(`/api/v1/forecast/job-sites`, getToken()),

  addJobSite:    (clientId: number, name: string) =>
    api.post<{ id: number }>(`/api/v1/forecast/job-sites`, { client_id: clientId, name }, getToken()),

  updateJobSite: (id: number, name: string) =>
    api.patch<void>(`/api/v1/forecast/job-sites/${id}`, { name }, getToken()),

  deleteJobSite: (id: number) =>
    api.delete<void>(`/api/v1/forecast/job-sites/${id}`, getToken()),
}
