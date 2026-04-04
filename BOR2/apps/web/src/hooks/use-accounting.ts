import { accountingService } from "@/services/accounting.service"
import type { AccountingFilters } from "@bor2/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function useAccounting(filters?: Partial<AccountingFilters>) {
  return useQuery({
    queryKey: ["accounting", filters],
    queryFn: () => accountingService.list(filters),
  })
}

export function useAccountingSummary(company?: string, year?: number) {
  return useQuery({
    queryKey: ["accounting", "summary", company, year],
    queryFn: () => accountingService.summary(company, year),
  })
}

export function useCreateAccounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: accountingService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounting"] }),
  })
}

export function useDeleteAccounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: accountingService.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounting"] }),
  })
}
