import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { emailTriggersService, type UpdateEmailTriggerBody } from "@/services/email-triggers.service"

export function useEmailTriggers(enabled: boolean) {
  return useQuery({
    queryKey: ["email-triggers"],
    queryFn: () => emailTriggersService.list(),
    enabled,
  })
}

export function useEmailTriggerHistory(key: string | null) {
  return useQuery({
    queryKey: ["email-trigger-history", key],
    queryFn: () => emailTriggersService.history(key as string),
    enabled: !!key,
  })
}

export function usePreviewEmailTrigger() {
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateEmailTriggerBody }) =>
      emailTriggersService.preview(key, body),
  })
}

export function useUpdateEmailTrigger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateEmailTriggerBody }) =>
      emailTriggersService.update(key, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-triggers"] })
      // The Subcontractor Docs modal reads the same recipients.
      qc.invalidateQueries({ queryKey: ["sub-doc-email-recipients"] })
    },
  })
}
