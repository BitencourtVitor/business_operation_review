import { takeoffService } from "@/services/takeoff.service"
import { useQuery } from "@tanstack/react-query"
import { MOCK_TAKEOFFS } from "@/lib/mock-data"

export function useTakeoffs(project?: string) {
  return useQuery({
    queryKey: ["takeoffs", project ?? ""],
    queryFn: async () => {
      try {
        const data = await takeoffService.list(project)
        return data && data.length > 0 ? data : MOCK_TAKEOFFS
      } catch {
        return MOCK_TAKEOFFS
      }
    },
  })
}
