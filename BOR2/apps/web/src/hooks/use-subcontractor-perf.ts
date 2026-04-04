import { subcontractorPerfService } from "@/services/subcontractor-perf.service"
import { useQuery } from "@tanstack/react-query"

export function useSubcontractorPerf() {
  const subcontractors = useQuery({
    queryKey: ["subcontractor-perf"],
    queryFn: () => subcontractorPerfService.listSubcontractors(),
  })

  const forecast = useQuery({
    queryKey: ["subcontractor-perf-forecast"],
    queryFn: () => subcontractorPerfService.listForecast(),
  })

  return {
    subcontractors,
    forecast,
    isLoading: subcontractors.isLoading || forecast.isLoading,
  }
}
