import { ofiService, type OfiFilters } from "@/services/ofi.service"
import { useQuery } from "@tanstack/react-query"

export function useOfi(filters?: OfiFilters) {
  return useQuery({
    queryKey: ["ofi", filters],
    queryFn:  () => ofiService.list(filters),
  })
}

export function useOfiLive(filters: { month: number; year: number }, enabled: boolean) {
  return useQuery({
    queryKey:        ["ofi-live", filters],
    queryFn:         () => ofiService.liveScores(filters),
    enabled,
    staleTime:       60_000,
    refetchInterval: 60_000,
  })
}

export function useMonthlyExecution(filters?: { year?: number }) {
  return useQuery({
    queryKey: ["monthly-execution", filters],
    queryFn:  () => ofiService.listExecution(filters),
  })
}
