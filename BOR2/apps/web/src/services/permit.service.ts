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
  /** Obra do HVAC Schedule vinculada; muda só pelo `link`. */
  projectId: string | null
}

export type PermitInput = Omit<Permit, "id" | "createdAt" | "projectId">

export const permitService = {
  list:          ()                              => api.get<Permit[]>("/api/v1/permits", getToken()),
  create:        (data: PermitInput)             => api.post<Permit>("/api/v1/permits", data, getToken()),
  update:        (id: string, data: PermitInput) => api.put<Permit>(`/api/v1/permits/${id}`, data, getToken()),
  remove:        (id: string)                    => api.delete<void>(`/api/v1/permits/${id}`, getToken()),
  link:          (projectId: string, permitId: string | null) => api.put<{ ok: boolean }>(`/api/v1/permits/link/${projectId}`, { permitId }, getToken()),
}
