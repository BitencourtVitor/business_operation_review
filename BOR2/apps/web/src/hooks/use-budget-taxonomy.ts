import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { budgetTaxonomyService as svc, type Category, type ProjectType } from "@/services/budget-taxonomy.service"

export function useCategories(projectType?: ProjectType) {
  return useQuery({
    queryKey: ["budget-categories", projectType ?? "all"],
    queryFn: () => svc.listCategories(projectType),
  })
}

export function useCategoryMutations() {
  const qc = useQueryClient()
  const inval = () => qc.invalidateQueries({ queryKey: ["budget-categories"] })
  return {
    create: useMutation({ mutationFn: (b: Partial<Category>) => svc.createCategory(b), onSuccess: inval }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Category> }) => svc.updateCategory(id, body), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: string) => svc.deleteCategory(id), onSuccess: inval }),
  }
}

export function useAccountMappings(company: string, projectType: ProjectType) {
  return useQuery({
    queryKey: ["budget-account-mappings", company, projectType],
    queryFn: () => svc.listAccountMappings(company, projectType),
    enabled: !!company,
  })
}

export function useSetAccountMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setAccountMapping,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-account-mappings", v.company, v.project_type] }),
  })
}

export function usePresetAccounts(company: string) {
  return useQuery({
    queryKey: ["preset-accounts", company],
    queryFn: () => svc.listPresetAccounts(company),
    enabled: !!company,
  })
}

export function useSetPresetAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setPresetAccount,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["preset-accounts", v.company] }),
  })
}

export function useVendorMappings(company: string, projectType: ProjectType) {
  return useQuery({
    queryKey: ["budget-vendor-mappings", company, projectType],
    queryFn: () => svc.listVendorMappings(company, projectType),
    enabled: !!company,
  })
}

export function useSetVendorMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setVendorMapping,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-vendor-mappings", v.company, v.project_type] }),
  })
}

// ── Per-project budget editing (modal) — invalidates the project detail ───────

export function useSetCategoryBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setProjectLimit,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-detail", v.company, v.project_id] }),
  })
}

export function useSetVendorBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setVendorLimit,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-detail", v.company, v.project_id] }),
  })
}

export function useSetProjectVendorCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setProjectVendorCategory,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-detail", v.company, v.project_id] }),
  })
}

export function useSetPayrollSupervisor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setPayrollSupervisor,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-account-payees", v.company, v.project_id, v.account_id] }),
  })
}

export function useBudgetSettings(company: string) {
  return useQuery({
    queryKey: ["budget-settings", company],
    queryFn: () => svc.getSettings(company),
    enabled: !!company,
  })
}

export function useSetBudgetSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.setSettings,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["budget-settings", v.company] }),
  })
}
