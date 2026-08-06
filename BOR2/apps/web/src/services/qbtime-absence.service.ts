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

// ─── Weekly attendance grid ───────────────────────────────────────────────────

/** `pending` = today or later, hasn't happened yet. `skipped` = nobody in the
 *  company punched that day (holiday or failed sync), so it proves nothing.
 *  `off`     = weekend with no punch — never an absence. */
export type AttendanceStatus = "present" | "absent" | "skipped" | "pending" | "off"

export interface AttendanceDay {
  date:    string
  weekday: string
  status:  AttendanceStatus
  /** Consecutive absent days ending on this one, counting back past Monday. */
  streak:  number
}

export interface AttendanceDayHeader {
  date:      string
  weekday:   string
  /** False when the whole company sat the day out — holiday or failed sync. */
  evaluated: boolean
  weekend:   boolean
}

export interface AttendanceEmployee {
  qbtUserId:   number
  name:        string
  days:        AttendanceDay[]
  absentCount: number
  maxStreak:   number
}

export interface AttendanceTeam {
  team:      string
  employees: AttendanceEmployee[]
}

export interface AttendanceResponse {
  company:      string
  weekStart:    string
  weekEnd:      string
  days:         AttendanceDayHeader[]
  teams:        AttendanceTeam[]
  rosterSize:   number
  totalAbsent:  number
  totalFlagged: number
}

export const absenceService = {
  attendance: (company: string, week?: string) =>
    api.get<AttendanceResponse>(
      `/api/v1/qbtime/absences/attendance?company=${company}${week ? `&week=${week}` : ""}`,
      getToken(),
    ),

  get: (company: string, days?: number) =>
    api.get<AbsenceResponse>(
      `/api/v1/qbtime/absences?company=${company}${days ? `&days=${days}` : ""}`,
      getToken(),
    ),
}
