import { useQuery } from "@tanstack/react-query"
import { qbAccountingService } from "@/services/qb-accounting.service"

export function useQBYears(params: { company: string }) {
  return useQuery({
    queryKey: ["qb-accounting-years", params.company],
    queryFn: () => qbAccountingService.getYears(params),
    enabled: !!params.company,
    staleTime: 1000 * 60 * 10, // 10 min — years rarely change
  })
}

export function useQBChart(params: { company: string; year?: number; month?: number }) {
  return useQuery({
    queryKey: ["qb-accounting-chart", params.company, params.year, params.month],
    queryFn: () => qbAccountingService.getChart(params),
    enabled: !!params.company,
  })
}

export function useQBProjects(params: { company: string; year?: number }) {
  return useQuery({
    queryKey: ["qb-accounting-projects", params.company, params.year],
    queryFn: () => qbAccountingService.getProjects(params),
    enabled: !!params.company,
  })
}

export function useQBProjectDetail(params: { company: string; customer_id: string } | null) {
  return useQuery({
    queryKey: ["qb-accounting-project-detail", params?.company, params?.customer_id],
    queryFn: () => qbAccountingService.getProjectDetail(params!),
    enabled: !!params?.company && !!params?.customer_id,
  })
}
