import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  whosWorkingService,
  whosWorkingExceptionsService,
} from "@/services/qbtime-whos-working.service"

export function useWhosWorking(company: string, enabled: boolean) {
  return useQuery({
    queryKey: ["qbtime-whos-working", company],
    queryFn:  () => whosWorkingService.get(company),
    enabled:  enabled && !!company,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useWhosWorkingExceptions(company: string) {
  return useQuery({
    queryKey: ["qbtime-exceptions", company],
    queryFn:  () => whosWorkingExceptionsService.list(company),
    enabled:  !!company,
    staleTime: 60_000,
  })
}

export function useUpsertException(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => whosWorkingExceptionsService.upsert(company, name),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["qbtime-exceptions", company] }),
  })
}

export function useDeleteException(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => whosWorkingExceptionsService.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["qbtime-exceptions", company] }),
  })
}
