import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface WhosWorkingEntry {
  qbtUserId: number
  name:      string
  clockIn:   string  // "07:30 AM"
  elapsed:   number  // decimal hours
}

export interface WhosWorkingGroup {
  team:    string
  entries: WhosWorkingEntry[]
}

export interface WhosWorkingResponse {
  company:      string
  generatedAt:  string  // "05/13 · 02:13 PM"
  generatedISO: string
  groups:       WhosWorkingGroup[]
  totalOnClock: number
}

export interface WhosWorkingException {
  id:           string
  company:      string
  employeeName: string
  createdAt:    string
}

export const whosWorkingService = {
  get: (company: string) =>
    api.get<WhosWorkingResponse>(`/api/v1/qbtime/whos-working?company=${company}`, getToken()),
}

export const whosWorkingExceptionsService = {
  list: (company: string) =>
    api.get<WhosWorkingException[]>(`/api/v1/qbtime/exceptions?company=${company}`, getToken()),

  upsert: (company: string, name: string) =>
    api.post<WhosWorkingException>("/api/v1/qbtime/exceptions", { company, name }, getToken()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/qbtime/exceptions/${id}`, getToken()),
}
