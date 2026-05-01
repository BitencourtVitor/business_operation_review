import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function tok() {
  return useAuthStore.getState().token ?? ""
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildingListItem {
  id: string
  name: string
  address: string
  created_at: string
  updated_at: string
  has_schedule: boolean
  schedule_id?: string
  pdf_filename?: string
  project_start?: string   // "YYYY-MM-DD"
  project_finish?: string  // "YYYY-MM-DD"
  uploaded_at?: string
  task_count?: number
}

export interface RowComment {
  id:         string
  row_id:     number
  user_name:  string
  user_role:  string
  body:       string
  created_at: string
}

export interface RowMetaItem {
  row_id:      number
  status:      'pending' | 'done'
  observation: string
}

export interface ScheduleResponse {
  pdf_filename: string
  project_start: string | null
  project_finish: string | null
  uploaded_at: string
  schedule_data: ParsedScheduleStored
}

// Stored version: startDate/finishDate are ISO strings (JSON-serialised Date objects)
export interface ParsedScheduleStored {
  fileName: string
  projectName: string
  rows: ScheduleRowStored[]
  allResources: string[]
  projectStart: string | null
  projectFinish: string | null
}

export interface ScheduleRowStored {
  id: string
  name: string
  durationText: string
  durationDays: number
  predecessors: string
  start: string
  finish: string
  startDate: string | null
  finishDate: string | null
  resources: string[]
  notes: string
  level: number
  isPhase: boolean
  isMilestone: boolean
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const buildingsService = {
  list: () =>
    api.get<BuildingListItem[]>("/api/v1/buildings", tok()),

  create: (name: string, address: string) =>
    api.post<{ id: string }>("/api/v1/buildings", { name, address }, tok()),

  update: (id: string, name: string, address: string) =>
    api.put<void>(`/api/v1/buildings/${id}`, { name, address }, tok()),

  delete: (id: string) =>
    api.delete<void>(`/api/v1/buildings/${id}`, tok()),

  getSchedule: (buildingId: string) =>
    api.get<ScheduleResponse>(`/api/v1/buildings/${buildingId}/schedule`, tok()),

  upsertSchedule: (
    buildingId: string,
    pdfFilename: string,
    projectStart: string | null,
    projectFinish: string | null,
    scheduleData: ParsedScheduleStored,
  ) =>
    api.post<{ schedule_id: string }>(`/api/v1/buildings/${buildingId}/schedule`, {
      pdf_filename:   pdfFilename,
      project_start:  projectStart,
      project_finish: projectFinish,
      schedule_data:  scheduleData,
    }, tok()),

  deleteSchedule: (buildingId: string) =>
    api.delete<void>(`/api/v1/buildings/${buildingId}/schedule`, tok()),

  getScheduleRowMeta: (buildingId: string) =>
    api.get<RowMetaItem[]>(`/api/v1/buildings/${buildingId}/schedule/row-meta`, tok()),

  upsertScheduleRowMeta: (buildingId: string, rowId: number | string, patch: { status?: string; observation?: string }) =>
    api.patch<void>(`/api/v1/buildings/${buildingId}/schedule/row-meta/${rowId}`, patch, tok()),

  getAllRowComments: (buildingId: string) =>
    api.get<RowComment[]>(`/api/v1/buildings/${buildingId}/schedule/row-comments`, tok()),

  getRowComments: (buildingId: string, rowId: number | string) =>
    api.get<RowComment[]>(`/api/v1/buildings/${buildingId}/schedule/row-comments/${rowId}`, tok()),

  addRowComment: (buildingId: string, rowId: number | string, body: string, userName: string, userRole: string) =>
    api.post<RowComment>(`/api/v1/buildings/${buildingId}/schedule/row-comments/${rowId}`, { body, user_name: userName, user_role: userRole }, tok()),

  editRowComment: (buildingId: string, commentId: string, body: string) =>
    api.patch<RowComment>(`/api/v1/buildings/${buildingId}/schedule/row-comments/${commentId}`, { body }, tok()),

  deleteRowComment: (buildingId: string, commentId: string) =>
    api.delete<void>(`/api/v1/buildings/${buildingId}/schedule/row-comments/${commentId}`, tok()),
}
