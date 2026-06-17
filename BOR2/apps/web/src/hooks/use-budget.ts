import { useQuery } from "@tanstack/react-query"
import { budgetService, type BudgetStatus } from "@/services/budget.service"

export function useBudgetProjects(params: { company: string; status?: BudgetStatus }) {
  return useQuery({
    queryKey: ["budget-projects", params.company, params.status ?? "all"],
    queryFn: () => budgetService.getProjects(params),
    enabled: !!params.company,
  })
}

export function useBudgetCustomers(params: { company: string }) {
  return useQuery({
    queryKey: ["budget-customers", params.company],
    queryFn: () => budgetService.getCustomers(params),
    enabled: !!params.company,
  })
}

export function useBudgetDetail(params: { company: string; project_id: string } | null) {
  return useQuery({
    queryKey: ["budget-detail", params?.company, params?.project_id],
    queryFn: () => budgetService.getDetail(params!),
    enabled: !!params?.company && !!params?.project_id,
  })
}
