import { projectMonitoringService } from "@/services/project-monitoring.service"
import { useQuery } from "@tanstack/react-query"

export function useProjectMonitoring() {
  return useQuery({
    queryKey: ["project-monitoring"],
    queryFn: () => projectMonitoringService.list(),
  })
}
