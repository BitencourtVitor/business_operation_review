import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { settingsService, type CreateUserInput, type UpdateUserInput, type PermissionLevel } from "@/services/settings.service"

export function useScreens() {
  return useQuery({
    queryKey: ["settings", "screens"],
    queryFn:  () => settingsService.getScreens().then(d => d ?? []),
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ["settings", "users"],
    queryFn:  () => settingsService.getUsers().then(d => d ?? []),
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserInput) => settingsService.createUser(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["settings", "users"] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      settingsService.updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "users"] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => settingsService.deleteUser(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["settings", "users"] }),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: string) => settingsService.resetPassword(id),
  })
}

export function useMyPermissions() {
  return useQuery({
    queryKey: ["settings", "my-permissions"],
    queryFn:  () => settingsService.getMyPermissions().catch(() => null),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useUpdateUserPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: Record<string, PermissionLevel> }) =>
      settingsService.updateUserPermissions(userId, permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "users"] }),
  })
}
