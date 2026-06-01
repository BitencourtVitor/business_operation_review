import { ofiService, type OfiFilters } from "@/services/ofi.service"
import { useQuery } from "@tanstack/react-query"

export function useOfi(filters?: OfiFilters) {
  return useQuery({
    queryKey: ["ofi", filters],
    queryFn:  () => ofiService.list(filters),
  })
}


export function useMonthlyExecution(filters?: { year?: number }) {
  return useQuery({
    queryKey: ["monthly-execution", filters],
    queryFn:  () => ofiService.listExecution(filters),
  })
}
