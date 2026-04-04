import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface TakeoffWork {
  id: string
  project: string
  dataSolicitacao: string | null
  dataInicio: string | null
  dataEstimadaEntrega: string | null
  entregaReal: string | null
  description: string
  docLinks: string
  modeloDaCasa: string
  stageDwg: string
  stageMitek3d: string
  stageMaterialsList: string
  stagePanelDivision: string
  stageValidation: string
  stageCutList: string
  stageProduction: string
  stageDelivery: string
  stageAssembly: string
  createdAt: string
}

export const takeoffService = {
  list: (project?: string) =>
    api.get<TakeoffWork[]>(
      `/api/v1/takeoffs${project ? `?project=${encodeURIComponent(project)}` : ""}`,
      getToken()
    ),
}
