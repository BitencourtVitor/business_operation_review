import { serviceRequestService } from "@/services/service-request.service"
import { useQuery } from "@tanstack/react-query"

export function useServiceRequests() {
  return useQuery({
    queryKey: ["service-requests"],
    queryFn: async () => (await serviceRequestService.list()) ?? [],
    retry: 1,
  })
}
