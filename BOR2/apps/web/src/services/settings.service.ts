import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

export interface Screen {
  id:          string
  description: string
}

export interface UserWithPermissions {
  id:          string
  email:       string
  name:        string
  role:        string
  permissions: Record<string, boolean>
}

export interface CreateUserInput {
  name:  string
  email: string
  role:  string
}

export interface UpdateUserInput {
  name:  string
  email: string
  role:  string
}

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export const settingsService = {
  getScreens: () =>
    api.get<Screen[]>("/api/v1/settings/screens", getToken()),

  getUsers: () =>
    api.get<UserWithPermissions[]>("/api/v1/settings/users", getToken()),

  createUser: (data: CreateUserInput) =>
    api.post<{ id: string; name: string; email: string; role: string; provisionalPassword: string }>(
      "/api/v1/settings/users", data, getToken()
    ),

  updateUser: (id: string, data: UpdateUserInput) =>
    api.put<{ message: string }>(`/api/v1/settings/users/${id}`, data, getToken()),

  deleteUser: (id: string) =>
    api.delete<void>(`/api/v1/settings/users/${id}`, getToken()),

  resetPassword: (id: string) =>
    api.post<{ provisionalPassword: string }>(`/api/v1/settings/users/${id}/reset-password`, {}, getToken()),

  updateUserPermissions: (userId: string, permissions: Record<string, boolean>) =>
    api.patch<{ message: string }>(`/api/v1/settings/users/${userId}/permissions`, { permissions }, getToken()),
}
