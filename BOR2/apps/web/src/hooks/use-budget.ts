import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { budgetService, type BudgetStatus } from "@/services/budget.service"

export function useBudgetProjects(params: { company: string; status?: BudgetStatus; year?: number; month?: number }) {
  return useQuery({
    queryKey: ["budget-projects", params.company, params.status ?? "all", params.year ?? 0, params.month ?? 0],
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

export function useSetAccountLimit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: budgetService.setAccountLimit,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-detail", v.company, v.project_id] }),
  })
}

export function useSetAccountDeadline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: budgetService.setAccountDeadline,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-detail", v.company, v.project_id] }),
  })
}

export function useSetProjectStartDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: budgetService.setProjectStartDate,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-detail", v.company, v.project_id] }),
  })
}

export function useAccountPayees(params: { company: string; project_id: string; account_id: string } | null) {
  return useQuery({
    queryKey: ["budget-account-payees", params?.company, params?.project_id, params?.account_id],
    queryFn: () => budgetService.getAccountPayees(params!),
    enabled: !!params?.company && !!params?.project_id && !!params?.account_id,
  })
}

export function useAccountHistory(params: { company: string; project_id: string; account_ids: string[] } | null) {
  return useQuery({
    queryKey: ["budget-account-history", params?.company, params?.project_id, (params?.account_ids ?? []).join(",")],
    queryFn: () => budgetService.getAccountHistory(params!),
    enabled: !!params?.company && !!params?.project_id && (params?.account_ids.length ?? 0) > 0,
  })
}

export function useIncomeHistory(params: { company: string; project_id: string; type: string } | null) {
  return useQuery({
    queryKey: ["budget-income-history", params?.company, params?.project_id, params?.type],
    queryFn: () => budgetService.getIncomeHistory(params!),
    enabled: !!params?.company && !!params?.project_id && !!params?.type,
  })
}

export function useLaborEstimate(params: { company: string; project_id: string } | null) {
  return useQuery({
    queryKey: ["budget-labor-estimate", params?.company, params?.project_id],
    queryFn: () => budgetService.getLaborEstimate(params!),
    enabled: !!params?.company && !!params?.project_id,
  })
}

export function useLaborSummary(company: string) {
  return useQuery({
    queryKey: ["budget-labor-summary", company],
    queryFn: () => budgetService.getLaborSummary(company),
    enabled: !!company,
    staleTime: 3 * 60 * 1000,
  })
}
