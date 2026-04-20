import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface Permit {
  id: string
  client: string
  jobsite: string
  lotAddress: string
  situacao: string
  solicitacao: string | null
  aplicacao: string | null
  emissao: string | null
  observacao: string
  arquivo: string
  createdAt: string
}

export type PermitInput = Omit<Permit, "id" | "createdAt">

export const permitService = {
  list:          ()                              => api.get<Permit[]>("/api/v1/permits", getToken()),
  create:        (data: PermitInput)             => api.post<Permit>("/api/v1/permits", data, getToken()),
  update:        (id: string, data: PermitInput) => api.put<Permit>(`/api/v1/permits/${id}`, data, getToken()),
  remove:        (id: string)                    => api.delete<void>(`/api/v1/permits/${id}`, getToken()),
  syncFromSheet: ()                              => api.post<{ total: number; inserted: number }>("/api/v1/permits/sync-sheet", {}, getToken()),
}
