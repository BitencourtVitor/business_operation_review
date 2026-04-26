import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { workforceService, type WorkforceFilters } from "@/services/workforce.service"

export function useWorkforceData(filters: WorkforceFilters = {}) {
  return useQuery({
    queryKey: ["workforce", "data", filters],
    queryFn:  () => workforceService.list(filters).then(d => d ?? []),
  })
}

export function useWorkforceUploads() {
  return useQuery({
    queryKey: ["workforce", "uploads"],
    queryFn:  () => workforceService.listUploads().then(d => d ?? []),
  })
}

export function useWorkforceUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      file, company, referenceMonth, overwrite,
    }: {
      file: File
      company: string
      referenceMonth: string
      overwrite?: boolean
    }) => workforceService.upload(file, company, referenceMonth, overwrite),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workforce"] })
    },
  })
}

export function useDeleteWorkforceUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workforceService.deleteUpload(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["workforce"] }),
  })
}
