import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

export type Notification = {
  id:          number
  title:       string
  content:     string
  recipients:  string[]
  viewedBy:    string[]
  /** In-app path to open on click. Set by system notifications; null for hand-written ones. */
  link?:       string | null
  scheduledAt: string | null
  createdBy:   string
  createdAt:   string
}

export type CreateNotificationInput = {
  title:        string
  content:      string
  recipients:   string[]
  scheduledAt?: string | null   // ISO string or null = send immediately
}

export type UpdateNotificationInput = {
  title:        string
  content:      string
  recipients:   string[]
  scheduledAt?: string | null
}

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const notificationService = {
  /** Current user's active notifications */
  list: () =>
    api.get<Notification[]>("/api/v1/notifications", getToken()),

  /** All notifications — admin view */
  listAll: () =>
    api.get<Notification[]>("/api/v1/notifications/all", getToken()),

  create: (data: CreateNotificationInput) =>
    api.post<Notification>("/api/v1/notifications", data, getToken()),

  update: (id: number, data: UpdateNotificationInput) =>
    api.put<Notification>(`/api/v1/notifications/${id}`, data, getToken()),

  markViewed: (id: number) =>
    api.patch<{ message: string }>(`/api/v1/notifications/${id}/viewed`, {}, getToken()),

  delete: (id: number) =>
    api.delete<void>(`/api/v1/notifications/${id}`, getToken()),
}
