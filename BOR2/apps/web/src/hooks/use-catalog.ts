import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { catalogService, type CatalogTable } from "@/services/catalog.service"

export function useCatalogTable(table: CatalogTable) {
  return useQuery({
    queryKey: ["catalog", table],
    queryFn: () => catalogService.list(table).then(d => Array.isArray(d) ? d : []),
  })
}

export function useAddCatalogItem(table: CatalogTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, string>) => catalogService.add(table, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", table] }),
  })
}

export function useDeleteCatalogItem(table: CatalogTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => catalogService.delete(table, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", table] }),
  })
}
