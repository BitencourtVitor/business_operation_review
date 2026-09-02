import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"
import type { Project, ProjectTrade, TradeEvent } from "@/app/bor/pcg-bid-requests/_lib/types"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

const base = "/api/v1/pcg/projects"
// Rota irmã de `projects`, não filha: o backend expõe /api/v1/pcg/subcontractor-contacts.
// Pendurada em `base`, a chamada casava com PATCH|DELETE /projects/:id e voltava 405.
const contactsBase = "/api/v1/pcg/subcontractor-contacts"

export const pcgProjectsService = {
  list: () => api.get<Project[]>(base, getToken()).then(r => r ?? []),

  create: (project: Project) => api.post<Project>(base, project, getToken()),

  update: (id: string, patch: Partial<Project>) =>
    api.patch(`${base}/${id}`, patch, getToken()),

  remove: (id: string) => api.delete(`${base}/${id}`, getToken()),

  // Cria ou atualiza o trade inteiro: respostas e cláusulas reescritas.
  upsertTrade: (projectId: string, trade: Pick<ProjectTrade, "tradeId" | "answers" | "moduleOverrides"> & { contractNumber?: string }) =>
    api.put(`${base}/${projectId}/trades/${trade.tradeId}`, trade, getToken()),

  removeTrade: (projectId: string, tradeId: string) =>
    api.delete(`${base}/${projectId}/trades/${tradeId}`, getToken()),

  addEvent: (projectId: string, tradeId: string, event: TradeEvent) =>
    api.post(`${base}/${projectId}/trades/${tradeId}/events`, event, getToken()),

  updateEvent: (projectId: string, tradeId: string, eventId: string, patch: Partial<TradeEvent>) =>
    api.patch(`${base}/${projectId}/trades/${tradeId}/events/${eventId}`, patch, getToken()),

  removeEvent: (projectId: string, tradeId: string, eventId: string) =>
    api.delete(`${base}/${projectId}/trades/${tradeId}/events/${eventId}`, getToken()),
}

// O contato do sub como o PCG o imprime: cobre a lacuna da roster do
// Subcontractor Docs sem escrever de volta nela.
export interface PCGSubcontractorContact {
  subcontractor: string
  owner_name: string
  email: string
  phone: string
}

export const pcgSubcontractorContactsService = {
  list: () =>
    api.get<PCGSubcontractorContact[]>(contactsBase, getToken()).then(r => r ?? []),

  save: (contact: PCGSubcontractorContact) =>
    api.put(
      `${contactsBase}/${encodeURIComponent(contact.subcontractor)}`,
      contact,
      getToken(),
    ),
}
