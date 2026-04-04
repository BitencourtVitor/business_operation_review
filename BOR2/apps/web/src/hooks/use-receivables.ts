import { receivableService, payableService } from "@/services/receivable.service"
import { useQuery } from "@tanstack/react-query"

export function useReceivables(company?: string) {
  return useQuery({
    queryKey: ["receivables", company],
    queryFn: () => receivableService.list(company),
  })
}

export function usePayables(company?: string) {
  return useQuery({
    queryKey: ["payables", company],
    queryFn: () => payableService.list(company),
  })
}
