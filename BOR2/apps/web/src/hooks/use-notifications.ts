import { notificationService, type CreateNotificationInput, type UpdateNotificationInput } from "@/services/notification.service"
import { useAuth } from "@/hooks/use-auth"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

/** Current user's active notifications — auto-refreshes every 30 s */
export function useNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey:       ["notifications"],
    queryFn:        () => notificationService.list(),
    enabled:        !!user,
    refetchInterval: 30_000,
  })
}

/** All notifications — admin management view */
export function useAllNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["notifications", "all"],
    queryFn:  () => notificationService.listAll(),
    enabled:  !!user,
  })
}

export function useCreateNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateNotificationInput) => notificationService.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useUpdateNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateNotificationInput }) =>
      notificationService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useMarkNotificationViewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => notificationService.markViewed(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => notificationService.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}
