import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { budgetMappingService } from "@/services/budget-mapping.service"

export function useProjectMappings(company: string) {
  return useQuery({
    queryKey: ["budget-project-mappings", company],
    queryFn: () => budgetMappingService.list(company),
    enabled: !!company,
  })
}

export function useSetProjectMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: budgetMappingService.set,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["budget-project-mappings", vars.company] })
    },
  })
}
