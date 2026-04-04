import { subcontractorService } from "@/services/subcontractor.service"
import type { SubcontractorFilters } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useSubcontractors(filters?: Partial<SubcontractorFilters>) {
  return useQuery({
    queryKey: ["subcontractors", filters],
    queryFn: () => subcontractorService.list(filters),
  })
}

export function useUpdateSubcontractorStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      subcontractorService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcontractors"] }),
  })
}
