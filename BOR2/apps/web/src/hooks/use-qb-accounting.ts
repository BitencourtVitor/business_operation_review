import { useQuery } from "@tanstack/react-query"
import { qbAccountingService } from "@/services/qb-accounting.service"

export function useQBChart(params: { company: string; year: number; month?: number }) {
  return useQuery({
    queryKey: ["qb-accounting-chart", params.company, params.year, params.month],
    queryFn: () => qbAccountingService.getChart(params),
    enabled: !!params.company && !!params.year,
  })
}

export function useQBProjects(params: { company: string; year?: number }) {
  return useQuery({
    queryKey: ["qb-accounting-projects", params.company, params.year],
    queryFn: () => qbAccountingService.getProjects(params),
    enabled: !!params.company,
  })
}
