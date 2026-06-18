import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface MappingSuggestion {
  customer_id: string
  name: string
  score: number
}

export interface MappingQueueItem {
  address_key: string
  is_private: boolean
  blocks: number
  suggestions: MappingSuggestion[]
}

export const qbtimeMappingService = {
  queue: (company: string) =>
    api
      .get<MappingQueueItem[]>(`/api/v1/budget/qbtime-mapping/queue?company=${company}`, getToken())
      .then(r => r ?? []),

  customers: (company: string, q: string) =>
    api
      .get<MappingSuggestion[]>(
        `/api/v1/budget/qbtime-mapping/customers?company=${company}&q=${encodeURIComponent(q)}`,
        getToken(),
      )
      .then(r => r ?? []),

  accept: (body: { company: string; address_key: string; customer_id: string }) =>
    api.post(`/api/v1/budget/qbtime-mapping/accept`, body, getToken()),

  skip: (body: { company: string; address_key: string }) =>
    api.post(`/api/v1/budget/qbtime-mapping/skip`, body, getToken()),
}
