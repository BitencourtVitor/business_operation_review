import { fuelService } from "@/services/fuel.service"
import type { FuelFilters } from "@bor2/shared"
import { useQuery } from "@tanstack/react-query"

export function useSamsaraEvents(filters?: Partial<FuelFilters>) {
  return useQuery({
    queryKey: ["fuel", "samsara", filters],
    queryFn: () => fuelService.listSamsara(filters),
  })
}

export function useWexTransactions(filters?: Partial<FuelFilters>) {
  return useQuery({
    queryKey: ["fuel", "wex", filters],
    queryFn: () => fuelService.listWex(filters),
  })
}
