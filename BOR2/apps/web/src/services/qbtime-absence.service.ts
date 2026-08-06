import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface AbsenceEvent {
  id:           string
  company:      string
  qbtUserId:    number
  employeeName: string
  teamName:     string
  startDate:    string   // YYYY-MM-DD
  endDate:      string   // YYYY-MM-DD
  daysCount:    number
  /** Still absent as of the most recent evaluated day. */
  open:         boolean
  notifiedAt?:  string
}

export interface AbsenceGroup {
  team:   string
  events: AbsenceEvent[]
}

export interface AbsenceResponse {
  company:     string
  groups:      AbsenceGroup[]
  totalOpen:   number
  totalEvents: number
  /** Days actually checked — holidays and failed syncs are dropped. */
  evaluatedDays: string[]
}

export const absenceService = {
  get: (company: string, days?: number) =>
    api.get<AbsenceResponse>(
      `/api/v1/qbtime/absences?company=${company}${days ? `&days=${days}` : ""}`,
      getToken(),
    ),
}
