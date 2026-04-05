import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type CatalogTable =
  | "workforce"
  | "fieldwire"
  | "machines"
  | "contract-steps"
  | "providers"

export const catalogService = {
  list: (table: CatalogTable) =>
    api.get<Record<string, unknown>[]>(`/api/v1/forecast/catalog/${table}`, getToken()),

  add: (table: CatalogTable, data: Record<string, string>) =>
    api.post<{ id: number }>(`/api/v1/forecast/catalog/${table}`, data, getToken()),

  delete: (table: CatalogTable, id: number) =>
    api.delete<void>(`/api/v1/forecast/catalog/${table}/${id}`, getToken()),
}
