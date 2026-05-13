import { api } from "@/lib/api"

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
  get(company: string): Promise<{ data: WhosWorkingResponse }> {
    return api.get(`/qbtime/whos-working?company=${company}`)
  },
}

export const whosWorkingExceptionsService = {
  list(company: string): Promise<{ data: WhosWorkingException[] }> {
    return api.get(`/qbtime/exceptions?company=${company}`)
  },
  upsert(company: string, name: string): Promise<{ data: WhosWorkingException }> {
    return api.post("/qbtime/exceptions", { company, name })
  },
  delete(id: string): Promise<void> {
    return api.delete(`/qbtime/exceptions/${id}`)
  },
}
