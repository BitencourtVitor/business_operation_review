import { permitService } from "@/services/permit.service"
import { useQuery } from "@tanstack/react-query"

const FIVE_MINUTES = 5 * 60 * 1000

export function usePermits() {
  return useQuery({
    queryKey:  ["permits"],
    queryFn:   () => permitService.list(),
    staleTime: FIVE_MINUTES,  // served from cache for 5 min — no redundant fetches on re-mount or tab focus
  })
}
