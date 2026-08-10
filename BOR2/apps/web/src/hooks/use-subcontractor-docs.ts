import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { subcontractorDocsService } from "@/services/subcontractor-docs.service"
import type { WorkersCompCheckStatus } from "@/services/subcontractor-docs.service"
import { settingsService } from "@/services/settings.service"

export function useSubDocDivisions() {
  return useQuery({
    queryKey: ["sub-doc-divisions"],
    queryFn: () => subcontractorDocsService.listDivisions(),
    staleTime: 60 * 60 * 1000,
  })
}

export function useSubDocTypes() {
  return useQuery({
    queryKey: ["sub-doc-types"],
    queryFn: () => subcontractorDocsService.listTypes(),
    staleTime: 60 * 60 * 1000,
  })
}

export function useSubDocEmailRecipients() {
  return useQuery({
    queryKey: ["sub-doc-email-recipients"],
    queryFn: async () => {
      // The recipient endpoint is introduced with the email delivery backend.
      // Until that backend is deployed, use the existing Settings users API so
      // the modal remains usable during local UI review.
      const users = await settingsService.getUsers()
      try {
        return await subcontractorDocsService.listEmailRecipients()
      } catch {
        return { users, settings: { to_user_ids: [], cc_user_ids: [] } }
      }
    },
    enabled: false,
  })
}

export function useUpdateSubDocEmailRecipients() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ toUserIDs, ccUserIDs }: { toUserIDs: string[]; ccUserIDs: string[] }) =>
      subcontractorDocsService.updateEmailRecipients({ to_user_ids: toUserIDs, cc_user_ids: ccUserIDs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-email-recipients"] }),
  })
}

export function useSendSubDocEmailRecipientsTest() {
  return useMutation({
    mutationFn: ({ toUserIDs, ccUserIDs }: { toUserIDs: string[]; ccUserIDs: string[] }) =>
      subcontractorDocsService.sendEmailRecipientsTest({ to_user_ids: toUserIDs, cc_user_ids: ccUserIDs }),
  })
}

export function useSubDocWorkersCompReview(enabled: boolean) {
  return useQuery({
    queryKey: ["sub-doc-workers-comp-review"],
    queryFn: () => subcontractorDocsService.getWorkersCompReview(),
    enabled,
  })
}

export function useUpdateSubDocWorkersCompCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: WorkersCompCheckStatus; notes: string }) =>
      subcontractorDocsService.updateWorkersCompCheck(id, { status, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-workers-comp-review"] }),
  })
}

export function useSubDocContractors(includeArchived?: boolean) {
  return useQuery({
    queryKey: ["sub-doc-contractors", includeArchived ?? false],
    queryFn: () => subcontractorDocsService.listContractors(includeArchived),
  })
}

export function useCreateSubDocContractor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: subcontractorDocsService.createContractor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-contractors"] }),
  })
}

export function useUpdateSubDocContractor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name: string; email: string; phone: string; notes: string; divisions: string[] }) =>
      subcontractorDocsService.updateContractor(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-contractors"] }),
  })
}

export function useDeleteSubDocContractor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => subcontractorDocsService.deleteContractor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-contractors"] }),
  })
}

export function useArchiveSubDocContractor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      subcontractorDocsService.archiveContractor(id, archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-contractors"] }),
  })
}

export function useSetSubDocRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: subcontractorDocsService.setRecord,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-contractors"] }),
  })
}
