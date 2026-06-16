import { useQuery } from "@tanstack/react-query"
import { budgetService } from "@/services/budget.service"

export function useBudgetProjects(params: { company: string; year?: number }) {
  return useQuery({
    queryKey: ["budget-projects", params.company, params.year],
    queryFn: () => budgetService.getProjects(params),
    enabled: !!params.company,
  })
}

export function useBudgetSummary(params: { company: string; year?: number }) {
  return useQuery({
    queryKey: ["budget-summary", params.company, params.year],
    queryFn: () => budgetService.getSummary(params),
    enabled: !!params.company,
  })
}
