import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface WhosWorkingBreak {
  start:   string  // "07:30 AM"
  end:     string  // "08:00 AM"
  minutes: number
}

export interface WhosWorkingEntry {
  qbtUserId:         number
  name:              string
  // legacy fields (kept for backward compat)
  clockIn:           string  // current block start, "07:30 AM"
  elapsed:           number  // hours since current block started
  // enriched fields
  firstClockIn:      string  // start of first block today
  currentBlockStart: string  // same as clockIn
  currentBlockType:  string  // "regular" | "break"
  totalWorkHours:    number  // sum of regular hours today
  totalBreakMinutes: number  // sum of break minutes today
  currentAddress:    string  // jobcode name of open block
  breaks:            WhosWorkingBreak[]
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
