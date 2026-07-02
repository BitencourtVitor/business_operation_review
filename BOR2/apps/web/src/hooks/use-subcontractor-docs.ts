import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { subcontractorDocsService } from "@/services/subcontractor-docs.service"

export function useSubDocTypes() {
  return useQuery({
    queryKey: ["sub-doc-types"],
    queryFn: () => subcontractorDocsService.listTypes(),
    staleTime: 60 * 60 * 1000,
  })
}

export function useSubDocContractors() {
  return useQuery({
    queryKey: ["sub-doc-contractors"],
    queryFn: () => subcontractorDocsService.listContractors(),
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
    mutationFn: ({ id, ...body }: { id: number; name: string; email: string; phone: string; notes: string }) =>
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

export function useSetSubDocRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: subcontractorDocsService.setRecord,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-doc-contractors"] }),
  })
}
