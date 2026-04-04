import { permitService } from "@/services/permit.service"
import { useQuery } from "@tanstack/react-query"

export function usePermits() {
  return useQuery({
    queryKey: ["permits"],
    queryFn: () => permitService.list(),
  })
}
