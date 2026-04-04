import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface Permit {
  id: string
  model: string
  jobsite: string
  lotAddress: string
  situacao: string
  solicitacao: string
  aplicacao: string
  emissao: string
}

export const permitService = {
  list: () => api.get<Permit[]>("/api/v1/permits", getToken()),
}
