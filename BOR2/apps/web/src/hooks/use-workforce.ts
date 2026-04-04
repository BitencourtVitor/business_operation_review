import { workforceService } from "@/services/workforce.service"
import { useQuery } from "@tanstack/react-query"

export function useWorkforce(company?: string, month?: string) {
  return useQuery({
    queryKey: ["workforce", company, month],
    queryFn: () => workforceService.list(company, month),
  })
}
